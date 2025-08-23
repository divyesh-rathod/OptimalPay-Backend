/**
 * Balance Calculation Utilities
 * 
 * This module contains pure functions for balance calculations, discretization,
 * and state management operations used in debt optimization.
 * 
 * @module BalanceCalculations
 */

import { calculateMonthlyInterest } from './interestCalculations';
import { DebtResponse } from '../../../types/debts';

/**
 * Configuration for balance discretization
 */
export interface DiscretizationConfig {
  smallBalanceThreshold: number;        // Default: 1000
  mediumBalanceThreshold: number;       // Default: 10000
  smallBalancePrecision: number;        // Default: 0.02 (2%)
  mediumBalancePrecision: number;       // Default: 0.01 (1%)
  largeBalancePrecision: number;        // Default: 0.005 (0.5%)
  baseMinStep: number;                  // Default: 5
  baseMaxStep: number;                  // Default: 50
  debtCountFactor: number;              // Default: 0.1
}

/**
 * Default configuration for balance discretization
 */
export const DEFAULT_DISCRETIZATION_CONFIG: DiscretizationConfig = {
  smallBalanceThreshold: 1000,
  mediumBalanceThreshold: 10000,
  smallBalancePrecision: 0.02,
  mediumBalancePrecision: 0.01,
  largeBalancePrecision: 0.005,
  baseMinStep: 5,
  baseMaxStep: 50,
  debtCountFactor: 0.1
};

/**
 * Discretize balance for state space reduction in optimization algorithms
 * 
 * Uses adaptive precision based on balance size and debt count for optimal
 * performance vs accuracy trade-off.
 * 
 * @param balance - Original balance amount
 * @param totalDebts - Total number of debts (affects precision)
 * @param config - Configuration for discretization parameters
 * @returns Discretized balance amount
 */
export const discretizeBalance = (
  balance: number, 
  totalDebts: number,
  config: DiscretizationConfig = DEFAULT_DISCRETIZATION_CONFIG
): number => {
  if (balance <= 1) return 0;
  
  // Calculate percentage-based step size based on balance tiers
  let percentageStep: number;
  
  if (balance <= config.smallBalanceThreshold) {
    percentageStep = balance * config.smallBalancePrecision;
  } else if (balance <= config.mediumBalanceThreshold) {
    percentageStep = balance * config.mediumBalancePrecision;
  } else {
    percentageStep = balance * config.largeBalancePrecision;
  }
  
  // Adjust step sizes based on debt count (more debts = finer precision)
  const debtCountFactor = Math.max(0.5, 1 - (totalDebts - 5) * config.debtCountFactor);
  const minStep = config.baseMinStep * debtCountFactor;
  const maxStep = config.baseMaxStep * debtCountFactor;
  
  // Clamp the percentage step between min/max limits
  const finalStep = Math.max(minStep, Math.min(maxStep, percentageStep));
  
  // Round to nearest step
  return Math.round(balance / finalStep) * finalStep;
};

/**
 * Calculate new balance after applying a payment
 * 
 * @param currentBalance - Current debt balance
 * @param payment - Payment amount to apply
 * @param annualInterestRate - Annual interest rate as decimal
 * @param totalDebts - Total number of debts (for discretization)
 * @param config - Configuration for discretization
 * @returns New balance after payment and discretization
 */
export const calculateNewBalanceWithDiscretization = (
  currentBalance: number,
  payment: number,
  annualInterestRate: number,
  totalDebts: number,
  config: DiscretizationConfig = DEFAULT_DISCRETIZATION_CONFIG
): number => {
  if (currentBalance <= 5) return 0;
  
  const maxPayment = currentBalance + calculateMonthlyInterest(currentBalance, annualInterestRate);
  const effectivePayment = Math.min(payment, maxPayment);
  const monthlyInterest = calculateMonthlyInterest(currentBalance, annualInterestRate);
  const principal = effectivePayment - monthlyInterest;
  const newBalance = currentBalance - principal;
  
  return discretizeBalance(Math.max(0, newBalance), totalDebts, config);
};

/**
 * Calculate new balances for all debts after applying payments
 * 
 * @param currentBalances - Array of current debt balances
 * @param payments - Array of payment amounts
 * @param debts - Array of debt information for interest rates
 * @param config - Configuration for discretization
 * @returns Array of new balances after payments
 */
export const calculateNewBalances = (
  currentBalances: number[],
  payments: number[],
  debts: DebtResponse[],
  config: DiscretizationConfig = DEFAULT_DISCRETIZATION_CONFIG
): number[] => {
  return currentBalances.map((balance, index) => 
    calculateNewBalanceWithDiscretization(
      balance,
      payments[index],
      debts[index].interestRate,
      debts.length,
      config
    )
  );
};

/**
 * Generate state key for caching optimization states
 * 
 * Uses multi-level hashing for efficient state deduplication while
 * maintaining good distribution properties.
 * 
 * @param balances - Array of debt balances
 * @param totalDebts - Total number of debts
 * @param config - Configuration for discretization
 * @returns Unique hash representing the state
 */
export const createStateKey = (
  balances: number[],
  totalDebts: number,
  config: DiscretizationConfig = DEFAULT_DISCRETIZATION_CONFIG
): number => {
  // Level 1: Prime number multiplication with discretization
  let hash1 = 0;
  const primes = [982451653, 982451679, 982451707, 982451719, 982451783];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i], totalDebts, config);
    hash1 = (hash1 + (discretized * primes[i % primes.length])) >>> 0;
  }
  
  // Level 2: Bit rotation with Fibonacci numbers
  let hash2 = 0;
  const fibonacci = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i], totalDebts, config);
    hash2 = ((hash2 << 7) - hash2 + (discretized * fibonacci[i % fibonacci.length])) >>> 0;
  }
  
  // Level 3: XOR with golden ratio multiplication
  let hash3 = 0;
  const goldenRatio = 0x9e3779b9; // (√5 - 1) / 2 * 2^32
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i], totalDebts, config);
    hash3 = (hash3 ^ (discretized * goldenRatio)) >>> 0;
  }
  
  // Combine all three levels with bit mixing
  const combined = hash1 ^ (hash2 << 11) ^ (hash3 << 21);
  return combined >>> 0;
};

/**
 * Calculate total debt from balance array
 * 
 * @param balances - Array of debt balances
 * @returns Total debt amount
 */
export const calculateTotalDebt = (balances: number[]): number => {
  return balances.reduce((total, balance) => total + balance, 0);
};

/**
 * Check if all debts are effectively paid off
 * 
 * @param balances - Array of debt balances
 * @param threshold - Threshold below which debt is considered paid off
 * @returns True if all debts are below threshold
 */
export const areAllDebtsPaidOff = (balances: number[], threshold: number = 5): boolean => {
  return balances.every(balance => balance <= threshold);
};

/**
 * Calculate balance reduction from one state to another
 * 
 * @param fromBalances - Starting balances
 * @param toBalances - Ending balances
 * @returns Amount of debt reduction
 */
export const calculateBalanceReduction = (fromBalances: number[], toBalances: number[]): number => {
  const fromTotal = calculateTotalDebt(fromBalances);
  const toTotal = calculateTotalDebt(toBalances);
  return Math.max(0, fromTotal - toTotal);
};
