import { PrismaClient } from "@prisma/client";
import { throwInternalError } from "../utils/error";
import { 
    PaymentBreakdown, 
    MakePaymentResult, 
    PaymentHistoryRecord, 
} from "../types/payment";

const prisma = new PrismaClient();

// Helper function to calculate monthly interest rate (consistent across services)
const calculateMonthlyInterestRate = (annualInterestRate: number): number => {
  return annualInterestRate / 12; // Already stored as decimal (0.2499 for 24.99%)
};

// Helper function to calculate monthly interest for a balance
const calculateMonthlyInterest = (balance: number, annualInterestRate: number): number => {
  return balance * calculateMonthlyInterestRate(annualInterestRate);
};

// Helper function to calculate payment breakdown
const calculatePaymentBreakdown = (
    currentBalance: number,
    paymentAmount: number,
    annualInterestRate: number
): PaymentBreakdown => {
    // Calculate monthly interest rate using helper function
    const monthlyInterestRate = calculateMonthlyInterestRate(annualInterestRate);
    
    // Calculate interest owed for this period
    let interestPaid = currentBalance * monthlyInterestRate;
    
    // If payment is less than interest owed (rare but possible for minimum payments)
    if (paymentAmount <= interestPaid) {
        return {
            interestPaid: paymentAmount,
            principalPaid: 0,
            newBalance: currentBalance
        };
    }
    
    // Calculate principal payment (remaining after interest)
    const principalPaid = paymentAmount - interestPaid;
    
    // Calculate new balance
    const newBalance = Math.max(0, currentBalance - principalPaid);
    
    return {
        interestPaid: Math.round(interestPaid * 100) / 100,
        principalPaid: Math.round(principalPaid * 100) / 100,
        newBalance: Math.round(newBalance * 100) / 100
    };
};

export const makePayment = async (userId: string, debtId: string, paymentAmount: number, notes?: string): Promise<MakePaymentResult> => {
    try {
        // Input validation
        if (!userId || !debtId) {
            throw new Error("User ID and Debt ID are required");
        }

        if (typeof paymentAmount !== 'number' || paymentAmount <= 0) {
            throw new Error("Payment amount must be a positive number");
        }

        // Round payment amount to 2 decimal places to avoid floating point issues
        paymentAmount = Math.round(paymentAmount * 100) / 100;

        // Find the debt and verify ownership
        const debt = await prisma.debt.findUnique({
            where: { 
                id: debtId, 
                userId,
                isActive: true // Only allow payments on active debts
            }
        });

        if (!debt) {
            throw new Error("Debt not found or is not active for this user");
        }

        const currentBalance = debt.currentAmount.toNumber();
        
        // Check if debt is already paid off
        if (currentBalance <= 0) {
            throw new Error("This debt is already paid off");
        }

        // Validate payment amount doesn't exceed current balance
        if (paymentAmount > currentBalance) {
            throw new Error(`Payment amount ($${paymentAmount.toFixed(2)}) exceeds current debt balance ($${currentBalance.toFixed(2)})`);
        }

        // Check minimum payment requirement (unless paying off the entire debt)
        const minimumPayment = debt.minimumPayment.toNumber();
        if (paymentAmount < minimumPayment && paymentAmount < currentBalance) {
            throw new Error(`Payment amount must be at least the minimum payment of $${minimumPayment.toFixed(2)}`);
        }

        // Calculate payment breakdown using helper function
        const paymentBreakdown = calculatePaymentBreakdown(
            currentBalance,
            paymentAmount,
            debt.interestRate.toNumber()
        );

        const { interestPaid, principalPaid, newBalance } = paymentBreakdown;
        const isDebtPaidOff = newBalance === 0;

        // Use transaction to ensure data consistency
        const result = await prisma.$transaction(async (tx) => {
            // Create payment history record
            const payment = await tx.paymentHistory.create({
                data: {
                    userId,
                    debtId,
                    actualAmount: paymentAmount,
                    interestAmount: interestPaid,
                    principalAmount: principalPaid,
                    paymentDate: new Date(),
                    newBalance: newBalance,
                    notes: notes || null,
                }
            });

            // Update the debt balance and status
            await tx.debt.update({
                where: { id: debtId },
                data: {
                    currentAmount: newBalance,
                    isActive: !isDebtPaidOff, // Mark as inactive if paid off
                    updatedAt: new Date()
                }
            });

            return {
                paymentId: payment.id,
                interestPaid,
                principalPaid,
                newBalance,
                isDebtPaidOff
            };
        });

        console.log(`Payment processed successfully:
            - Payment Amount: $${paymentAmount.toFixed(2)}
            - Interest Paid: $${interestPaid.toFixed(2)}
            - Principal Paid: $${principalPaid.toFixed(2)}
            - New Balance: $${newBalance.toFixed(2)}
            - Debt Paid Off: ${isDebtPaidOff}`);

        return result;

    } catch (error) {
        if (error instanceof Error) {
            throwInternalError(`Error making payment: ${error.message}`);
        } else {
            throwInternalError("Error making payment: Unknown error");
        }
        
        // This return will never be reached due to throwInternalError, but TypeScript needs it
        throw error;
    }
}

// Get payment history for a specific debt
export const getPaymentHistory = async (userId: string, debtId: string, limit?: number): Promise<PaymentHistoryRecord[]> => {
    try {
        // Verify debt ownership
        const debt = await prisma.debt.findUnique({
            where: { id: debtId, userId }
        });

        if (!debt) {
            throw new Error("Debt not found for this user");
        }

        const queryOptions: any = {
            where: {
                debtId,
                userId
            },
            orderBy: {
                paymentDate: 'desc'
            },
            select: {
                id: true,
                actualAmount: true,
                interestAmount: true,
                principalAmount: true,
                newBalance: true,
                paymentDate: true,
                notes: true
            }
        };

        if (limit) {
            queryOptions.take = limit;
        }

        const paymentHistory = await prisma.paymentHistory.findMany(queryOptions);

        // Convert Decimal types to numbers for the response
        return paymentHistory.map(payment => ({
            id: payment.id,
            actualAmount: payment.actualAmount.toNumber(),
            interestAmount: payment.interestAmount?.toNumber() || 0,
            principalAmount: payment.principalAmount?.toNumber() || 0,
            newBalance: payment.newBalance.toNumber(),
            paymentDate: payment.paymentDate,
            notes: payment.notes
        }));

    } catch (error) {
        if (error instanceof Error) {
            throwInternalError(`Error fetching payment history: ${error.message}`);
        } else {
            throwInternalError("Error fetching payment history: Unknown error");
        }
        throw error;
    }
}

