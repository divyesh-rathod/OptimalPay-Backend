// Payment service types

/**
 * Payment breakdown calculation result
 */
export interface PaymentBreakdown {
  interestPaid: number;
  principalPaid: number;
  newBalance: number;
}

/**
 * Result of making a payment
 */
export interface MakePaymentResult {
  paymentId: string;
  interestPaid: number;
  principalPaid: number;
  newBalance: number;
  isDebtPaidOff: boolean;
}

/**
 * Payment history record
 */
export interface PaymentHistoryRecord {
  id: string;
  actualAmount: number;
  interestAmount: number;
  principalAmount: number;
  newBalance: number;
  paymentDate: Date;
  notes: string | null;
}

/**
 * Parameters for making a payment
 */
export interface MakePaymentParams {
  userId: string;
  debtId: string;
  paymentAmount: number;
  notes?: string;
}

/**
 * Parameters for getting payment history
 */
export interface GetPaymentHistoryParams {
  userId: string;
  debtId: string;
  limit?: number;
}

/**
 * Payoff projection result
 */
export interface PayoffProjection {
  monthsToPayoff: number;
  totalInterestToBePaid: number;
  totalPayments: number;
  payoffDate: Date;
}

/**
 * Parameters for calculating payoff projection
 */
export interface CalculatePayoffProjectionParams {
  userId: string;
  debtId: string;
  extraPayment?: number;
}

/**
 * Payment processing error types
 */
export enum PaymentErrorType {
  INVALID_INPUT = 'INVALID_INPUT',
  DEBT_NOT_FOUND = 'DEBT_NOT_FOUND',
  DEBT_ALREADY_PAID = 'DEBT_ALREADY_PAID',
  PAYMENT_EXCEEDS_BALANCE = 'PAYMENT_EXCEEDS_BALANCE',
  PAYMENT_BELOW_MINIMUM = 'PAYMENT_BELOW_MINIMUM',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Payment error details
 */
export interface PaymentError {
  type: PaymentErrorType;
  message: string;
  details?: any;
}

/**
 * Monthly interest calculation result
 */
export interface MonthlyInterestCalculation {
  monthlyRate: number;
  monthlyInterestAmount: number;
}

/**
 * Payment validation result
 */
export interface PaymentValidation {
  isValid: boolean;
  error?: PaymentError;
  minimumPayment?: number;
  currentBalance?: number;
}

/**
 * Payment transaction data for database
 */
export interface PaymentTransactionData {
  userId: string;
  debtId: string;
  actualAmount: number;
  interestAmount: number;
  principalAmount: number;
  paymentDate: Date;
  newBalance: number;
  notes: string | null;
}

/**
 * Debt update data after payment
 */
export interface DebtUpdateData {
  currentAmount: number;
  isActive: boolean;
  updatedAt: Date;
}

/**
 * Payment service configuration
 */
export interface PaymentServiceConfig {
  maxPaymentAmount?: number;
  minPaymentAmount?: number;
  allowPartialInterestPayments?: boolean;
  roundingPrecision?: number;
}

/**
 * Payment summary for reporting
 */
export interface PaymentSummary {
  totalPayments: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  averagePaymentAmount: number;
  paymentsThisMonth: number;
  lastPaymentDate: Date | null;
}

/**
 * Bulk payment result
 */
export interface BulkPaymentResult {
  successfulPayments: MakePaymentResult[];
  failedPayments: {
    debtId: string;
    error: PaymentError;
  }[];
  totalProcessed: number;
  totalSuccessful: number;
  totalFailed: number;
}

/**
 * Payment schedule item
 */
export interface PaymentScheduleItem {
  month: number;
  paymentAmount: number;
  interestAmount: number;
  principalAmount: number;
  remainingBalance: number;
  date: Date;
}

/**
 * Payment schedule
 */
export interface PaymentSchedule {
  debtId: string;
  debtName: string;
  currentBalance: number;
  monthlyPayment: number;
  schedule: PaymentScheduleItem[];
  totalInterest: number;
  totalPayments: number;
  payoffDate: Date;
}
