// Import Prisma's generated types - single source of truth!
import { DebtType, Debt as PrismaDebt } from '@prisma/client';

// Re-export DebtType for convenience
export { DebtType };

// What user sends when creating a new debt (POST request)
export interface CreateDebtData {
  name: string;
  type: DebtType;                    // Prisma's enum
  originalAmount: number;
  currentAmount: number;
  interestRate: number;
  minimumPayment: number;
  notes?: string;
  tenure?: number;
  remainingTenure?: number;
}

// What user sends when updating a debt (PUT request)
export interface UpdateDebtData {
    name?: string;
    type: DebtType; 
    interestRate?: number;
    minimumPayment?: number;
    currentAmount: number;
    notes?: string;
    isActive: boolean;
    remainingTenure?: number;
}

// Convert Prisma's Debt to numbers (Prisma uses Decimal)
export interface Debt {
  id: string;
  userId: string;
  name: string;
  type: DebtType;                    // Prisma's enum
  originalAmount: number;            // Converted from Decimal
  currentAmount: number;             // Converted from Decimal  
  interestRate: number;              // Converted from Decimal
  minimumPayment: number;            // Converted from Decimal
  notes: string | null;              // Prisma uses null, not undefined
  tenure: number | null;             // Prisma uses null, not undefined
  remainingTenure: number | null;    // Prisma uses null, not undefined
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// What API returns (includes calculated fields)
export interface DebtResponse extends Debt {
  progress?: {
    amountPaid: number;
    percentPaid: number;
  };
}

// Summary statistics
export interface DebtSummary {
  totalDebt: number;
  debtCount: number;
  activeDebtCount: number;
  totalMinimumPayments: number;
  highestInterestRate: number;
  averageInterestRate: number;
  monthlyInterestCost: number;
  debtTypes: Record<DebtType, number>;
}