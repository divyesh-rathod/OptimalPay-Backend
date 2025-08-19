/**
 * Pure Interest Calculation Functions
 * 
 * This module contains pure mathematical functions for interest calculations.
 * No side effects, no external dependencies - just math.
 * 
 * @module InterestCalculations
 */

/**
 * Calculate monthly interest rate from annual interest rate
 * 
 * @param annualInterestRate - Annual interest rate as decimal (0.2499 for 24.99%)
 * @returns Monthly interest rate as decimal
 */
export const calculateMonthlyInterestRate = (annualInterestRate: number): number => {
  return annualInterestRate / 12;
};

/**
 * Calculate monthly interest for a given balance
 * 
 * @param balance - Current debt balance
 * @param annualInterestRate - Annual interest rate as decimal
 * @returns Monthly interest amount in dollars
 */
export const calculateMonthlyInterest = (balance: number, annualInterestRate: number): number => {
  return balance * calculateMonthlyInterestRate(annualInterestRate);
};

/**
 * Calculate remaining balance after a payment
 * 
 * @param currentBalance - Current debt balance
 * @param payment - Payment amount
 * @param annualInterestRate - Annual interest rate as decimal
 * @returns New balance after payment and interest
 */
export const calculateNewBalance = (
  currentBalance: number, 
  payment: number, 
  annualInterestRate: number
): number => {
  if (currentBalance <= 0.01) return 0;
  
  const monthlyInterest = calculateMonthlyInterest(currentBalance, annualInterestRate);
  const principal = payment - monthlyInterest;
  const newBalance = currentBalance - principal;
  
  return Math.max(0, newBalance);
};

/**
 * Calculate principal portion of a payment
 * 
 * @param payment - Total payment amount
 * @param balance - Current balance
 * @param annualInterestRate - Annual interest rate as decimal
 * @returns Principal portion of the payment
 */
export const calculatePrincipalPayment = (
  payment: number, 
  balance: number, 
  annualInterestRate: number
): number => {
  const monthlyInterest = calculateMonthlyInterest(balance, annualInterestRate);
  return Math.max(0, payment - monthlyInterest);
};

/**
 * Calculate months to payoff with fixed payment
 * 
 * @param balance - Current debt balance
 * @param monthlyPayment - Fixed monthly payment
 * @param annualInterestRate - Annual interest rate as decimal
 * @returns Number of months to pay off debt
 */
export const calculateMonthsToPayoff = (
  balance: number, 
  monthlyPayment: number, 
  annualInterestRate: number
): number => {
  if (balance <= 0 || monthlyPayment <= 0) return 0;
  
  const monthlyRate = calculateMonthlyInterestRate(annualInterestRate);
  const monthlyInterest = calculateMonthlyInterest(balance, annualInterestRate);
  
  // If payment doesn't cover interest, debt will never be paid off
  if (monthlyPayment <= monthlyInterest) return Infinity;
  
  // Use amortization formula: n = -log(1 - (P*r)/M) / log(1 + r)
  // Where P = principal, r = monthly rate, M = monthly payment
  if (monthlyRate === 0) {
    return Math.ceil(balance / monthlyPayment);
  }
  
  const months = -Math.log(1 - (balance * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
};
