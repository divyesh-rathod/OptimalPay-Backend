import { DebtResponse } from '../types/debts';

export interface DPResult {
    totalInterest: number;
    feasible: boolean;
    timeline: number;
    strategy: { month: number; payments: number[] }[];
}

export interface OptimizationResult {
  isOptimal: boolean;
  totalInterestSaved: number;
  projectedMonths: number;
  plannedPayments: Array<{
    debtId: string;
    debtName: string;
    amount: number;
    minimumPayment: number;
    extraAmount: number;
  }>;
  monthlyProjection: Array<{
    month: number;
    totalDebtRemaining: number;
    totalInterestPaid: number;
    payments: Array<{
      debtName: string;
      payment: number;
      interest: number;
      principal: number;
      newBalance: number;
    }>;
  }>;
}
export interface StrategyWithLookahead {
  payments: number[];
  name: string;
  priority?: number;
  lookaheadScore?: number;
  lookaheadData?: {
    score: number;
    totalDebtReduction: number;
    interestCost: number;
    monthsToComplete: number;
    balancesAfterLookahead: number[];
  };
}

 export interface AStarNode {
    balances: number[];
    months: number;
    path: Array<{ month: number, balances: number[], payments: number[], strategy: string }>;
    fScore: number;
    gScore: number;
    hScore: number;
}
  
 export interface CategorizedDebts {
  highPriority: DebtResponse[];   // Credit cards, medical, high-interest
  lowPriority: DebtResponse[];    // Mortgage, large auto loans
  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto
}



