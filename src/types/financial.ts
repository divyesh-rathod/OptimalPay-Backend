export interface FinancialData {
    monthly_income: number;
    monthly_expenses: number;
}

export interface UserFinancialProfile {
    userId: string;
    monthly_income: number;
    monthly_expenses: number;
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface userFinancialProfileResponse extends UserFinancialProfile {
    available_budget: number
}



