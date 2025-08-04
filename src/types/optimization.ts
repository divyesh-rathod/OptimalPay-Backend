export interface DPResult {
    totalInterest: number;
    feasible: boolean;
    timeline: number;
    strategy: { month: number; payments: number[] }[];
}


