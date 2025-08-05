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

