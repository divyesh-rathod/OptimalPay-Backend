import { PrismaClient } from '@prisma/client'
import { Debt, DebtResponse, DebtType, CreateDebtData, UpdateDebtData } from '../types/debts'



import { InternalServerError, ValidationError ,throwInternalError} from '../utils/error'

const prisma = new PrismaClient()

export const createDebt = async (userId: string, debtData: CreateDebtData): Promise<Debt> => { 
    try {
         if(debtData.originalAmount <= 0 || debtData.currentAmount < 0 || debtData.interestRate < 0 || debtData.minimumPayment < 0) {
             throw new ValidationError('Invalid debt data')
         }

         const debt = await prisma.debt.create({
             data: {
                 userId,
                 ...debtData
             }
         })

            if (!debt) {
                throw new InternalServerError("Debt creation failed");
        }
        
        const responseDebt: Debt = {
            ...debt,
            originalAmount: Number(debt.originalAmount),
            currentAmount: Number(debt.currentAmount),
            interestRate: Number(debt.interestRate),
            minimumPayment: Number(debt.minimumPayment),
            remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,  
            tenure: debt.tenure ? Number(debt.tenure) : null,                              
        };
        
        return responseDebt;
    } catch (error) {
        throw  throwInternalError(error, "Error creating debt");
    }
}

export const updateDebt = async (debtId: string, userId: string, updateData: UpdateDebtData): Promise<DebtResponse> => {
    try {
        let userDebt = await prisma.debt.findUnique({
            where: { id: debtId }
        });
        if (!userDebt) {
            throw new ValidationError('Debt not found');
        }


        if (updateData.interestRate && updateData.interestRate < 0) {
            throw new ValidationError('Interest rate cannot be negative');
        }
        if (updateData.minimumPayment && updateData.minimumPayment < 0) {
            throw new ValidationError('Minimum payment cannot be negative');
        }
        if (updateData.remainingTenure && updateData.remainingTenure < 0) {
            throw new ValidationError('Remaining tenure cannot be negative');
        }
        
        const debt = await prisma.debt.update({
            where: { id: debtId, userId },
            data: updateData
        });

        if (!debt) {
            throw new InternalServerError("Debt update failed");
        }

        const responseDebt: DebtResponse = {
            ...debt,
            originalAmount: Number(debt.originalAmount),
            currentAmount: Number(debt.currentAmount),
            interestRate: Number(debt.interestRate),
            minimumPayment: Number(debt.minimumPayment),
            remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
            tenure: debt.tenure ? Number(debt.tenure) : null,
        };

        return responseDebt;
    } catch (error) {
          throw  throwInternalError(error, "Error updating debt");
        }
}

export const getDebtById = async (debtId: string, userId: string): Promise<DebtResponse> => {
    try {
        const debt = await prisma.debt.findUnique({
            where: { id: debtId, userId }
        });

        if (!debt) {
            throw new ValidationError('Debt not found');
        }

        const responseDebt: DebtResponse = {
            ...debt,
            originalAmount: Number(debt.originalAmount),
            currentAmount: Number(debt.currentAmount),
            interestRate: Number(debt.interestRate),
            minimumPayment: Number(debt.minimumPayment),
            remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
            tenure: debt.tenure ? Number(debt.tenure) : null,
        };

        return responseDebt;
    } catch (error) {
          throw  throwInternalError(error, "Error retrieving debt");
    }
}

export const getAllDebts = async (userId: string): Promise<DebtResponse[]> => {
    try {
        const debts = await prisma.debt.findMany({
            where: { userId }
        });

        return debts.map(debt => ({
            ...debt,
            originalAmount: Number(debt.originalAmount),
            currentAmount: Number(debt.currentAmount),
            interestRate: Number(debt.interestRate),
            minimumPayment: Number(debt.minimumPayment),
            remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
            tenure: debt.tenure ? Number(debt.tenure) : null,
        }));
    } catch (error) {
          throw  throwInternalError(error, "Error retrieving debts");
    }
}