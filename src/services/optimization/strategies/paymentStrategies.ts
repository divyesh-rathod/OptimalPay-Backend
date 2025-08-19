/**
 * Payment Strategy Generation Service
 * 
 * This module contains functions for generating different payment strategies
 * based on debt characteristics and available budget.
 * 
 * @module PaymentStrategies
 */

import { DebtResponse } from '../../../types/debts';
import { calculateMonthlyInterest } from '../utils/interestCalculations';

/**
 * Configuration for payment strategy generation
 */
export interface PaymentStrategyConfig {
  minimumCashFlowValue: number;         // Default: 50 (minimum cash flow to consider)
  balancedSplitPrimary: number;         // Default: 0.65 (65% to primary debt)
  balancedSplitSecondary: number;       // Default: 0.35 (35% to secondary debt)
  minimumExtraBudget: number;           // Default: 100 (minimum extra budget for balanced strategy)
  cashFlowMultiplier: number;           // Default: 12 (monthly cash flow * 12)
  efficiencyDivisor: number;            // Default: 10 (efficiency score adjustment)
}

/**
 * Default configuration for payment strategy generation
 */
export const DEFAULT_PAYMENT_STRATEGY_CONFIG: PaymentStrategyConfig = {
  minimumCashFlowValue: 50,
  balancedSplitPrimary: 0.65,
  balancedSplitSecondary: 0.35,
  minimumExtraBudget: 100,
  cashFlowMultiplier: 12,
  efficiencyDivisor: 10
};

/**
 * Enhanced debt information for strategy evaluation
 */
export interface EnhancedDebtInfo {
  balance: number;
  index: number;
  efficiency: number;
  monthlyInterest: number;
  minimumPayment: number;
  monthsToPayoff: number;
  cashFlowValue: number;
  canPayoffSoon: boolean;
  cashFlowScore?: number;
  combinedScore?: number;
}

/**
 * Payment strategy with metadata
 */
export interface PaymentStrategy {
  payments: number[];
  name: string;
  priority?: number;
  lookaheadScore?: number;
  lookaheadData?: any;
}

/**
 * Strategy evaluation result
 */
export interface StrategyEvaluation {
  score: number;
  totalDebtReduction: number;
  interestCost: number;
  monthsToComplete: number;
  balancesAfterLookahead: number[];
}

/**
 * Generate active debt information for strategy calculation
 * 
 * @param balances - Current debt balances
 * @param debts - Debt information array
 * @param extraBudget - Available extra budget beyond minimums
 * @param config - Configuration for strategy generation
 * @returns Array of enhanced debt information
 */
export const generateActiveDebtInfo = (
  balances: number[],
  debts: DebtResponse[],
  extraBudget: number,
  config: PaymentStrategyConfig = DEFAULT_PAYMENT_STRATEGY_CONFIG
): EnhancedDebtInfo[] => {
  const minimums = debts.map(debt => debt.minimumPayment);
  
  return balances.map((balance, index) => {
    const monthlyInterest = calculateMonthlyInterest(balance, debts[index].interestRate);
    const maxPayment = Math.min(extraBudget + minimums[index], balance + monthlyInterest);
    const monthsToPayoff = balance / (maxPayment - monthlyInterest);
    
    return {
      balance,
      index,
      efficiency: balance / minimums[index],
      monthlyInterest,
      minimumPayment: minimums[index],
      monthsToPayoff,
      cashFlowValue: minimums[index],
      canPayoffSoon: monthsToPayoff <= 3 && balance <= extraBudget * 3
    };
  }).filter(debt => debt.balance > 10);
};

/**
 * Generate immediate payoff strategies for debts that can be paid off immediately
 * 
 * @param activeDebts - Array of active debt information
 * @param minimums - Minimum payment amounts
 * @param extraBudget - Available extra budget
 * @param debts - Original debt information
 * @param availableBudget - Total available budget
 * @returns Array of immediate payoff strategies
 */
export const generateImmediatePayoffStrategies = (
  activeDebts: EnhancedDebtInfo[],
  minimums: number[],
  extraBudget: number,
  debts: DebtResponse[],
  availableBudget: number
): PaymentStrategy[] => {
  const strategies: PaymentStrategy[] = [];
  
  const immediatePayoffs = activeDebts.filter(debt => 
    debt.balance <= extraBudget && debt.balance > 0
  );
  
  for (const debt of immediatePayoffs) {
    const liberationPayments = [...minimums];
    const actualBalance = debts[debt.index].currentAmount;
    const actualInterest = calculateMonthlyInterest(actualBalance, debts[debt.index].interestRate);
    const totalNeeded = actualBalance + actualInterest;
    liberationPayments[debt.index] = Math.min(totalNeeded, availableBudget);
    
    strategies.push({
      payments: liberationPayments,
      name: `🚀 IMMEDIATE LIBERATION (Debt ${debt.index + 1}) - Frees $${debt.cashFlowValue}/mo`,
      priority: 100
    });
  }
  
  return strategies;
};

/**
 * Generate rapid payoff strategies for debts that can be paid off in 2-3 months
 * 
 * @param activeDebts - Array of active debt information
 * @param minimums - Minimum payment amounts
 * @param extraBudget - Available extra budget
 * @param immediatePayoffs - Debts that can be paid off immediately
 * @returns Array of rapid payoff strategies
 */
export const generateRapidPayoffStrategies = (
  activeDebts: EnhancedDebtInfo[],
  minimums: number[],
  extraBudget: number,
  immediatePayoffs: EnhancedDebtInfo[]
): PaymentStrategy[] => {
  const strategies: PaymentStrategy[] = [];
  
  const rapidPayoffs = activeDebts.filter(debt => 
    debt.monthsToPayoff <= 3 && 
    debt.balance <= extraBudget * 2.5 &&
    !immediatePayoffs.includes(debt)
  ).sort((a, b) => b.cashFlowValue - a.cashFlowValue);
  
  for (const debt of rapidPayoffs.slice(0, 2)) {
    const rapidPayments = [...minimums];
    rapidPayments[debt.index] += Math.min(extraBudget, debt.balance);
    
    strategies.push({
      payments: rapidPayments,
      name: `⚡ RAPID LIBERATION (Debt ${debt.index + 1}) - ${debt.monthsToPayoff.toFixed(1)} months to freedom`,
      priority: 90
    });
  }
  
  return strategies;
};

/**
 * Generate traditional optimization strategies (avalanche, efficiency, etc.)
 * 
 * @param activeDebts - Array of active debt information
 * @param minimums - Minimum payment amounts
 * @param extraBudget - Available extra budget
 * @param balances - Current debt balances
 * @returns Array of traditional strategies
 */
export const generateTraditionalStrategies = (
  activeDebts: EnhancedDebtInfo[],
  minimums: number[],
  extraBudget: number,
  balances: number[]
): PaymentStrategy[] => {
  const strategies: PaymentStrategy[] = [];
  
  if (activeDebts.length === 0) return strategies;
  
  // Strategy: Smart Avalanche (by absolute interest cost)
  const maxInterestDebt = activeDebts.reduce((max, curr) => 
    curr.monthlyInterest > max.monthlyInterest ? curr : max
  );
  
  const avalanchePayments = [...minimums];
  avalanchePayments[maxInterestDebt.index] += Math.min(extraBudget, balances[maxInterestDebt.index]);
  strategies.push({
    payments: avalanchePayments,
    name: `Avalanche (Debt ${maxInterestDebt.index + 1} - $${maxInterestDebt.monthlyInterest.toFixed(2)}/mo interest)`,
    priority: 80
  });
  
  // Strategy: Efficiency Focus (balance/minimum ratio)
  const maxEfficiencyDebt = activeDebts.reduce((max, curr) => 
    curr.efficiency > max.efficiency ? curr : max
  );
  
  const efficiencyPayments = [...minimums];
  efficiencyPayments[maxEfficiencyDebt.index] += Math.min(extraBudget, balances[maxEfficiencyDebt.index]);
  strategies.push({
    payments: efficiencyPayments,
    name: `Efficiency (Debt ${maxEfficiencyDebt.index + 1} - ${maxEfficiencyDebt.efficiency.toFixed(1)}x)`,
    priority: 75
  });
  
  return strategies;
};

/**
 * Generate advanced optimization strategies (cash flow weighted, balanced, progressive)
 * 
 * @param activeDebts - Array of active debt information
 * @param minimums - Minimum payment amounts
 * @param extraBudget - Available extra budget
 * @param balances - Current debt balances
 * @param config - Configuration for strategy generation
 * @returns Array of advanced strategies
 */
export const generateAdvancedStrategies = (
  activeDebts: EnhancedDebtInfo[],
  minimums: number[],
  extraBudget: number,
  balances: number[],
  config: PaymentStrategyConfig = DEFAULT_PAYMENT_STRATEGY_CONFIG
): PaymentStrategy[] => {
  const strategies: PaymentStrategy[] = [];
  
  if (activeDebts.length === 0) return strategies;
  
  // Strategy: Cash Flow Weighted (combines cash flow value + interest cost)
  const cashFlowWeighted = activeDebts.map(debt => ({
    ...debt,
    cashFlowScore: (debt.cashFlowValue * config.cashFlowMultiplier) + debt.monthlyInterest
  })).reduce((max, curr) => 
    curr.cashFlowScore > max.cashFlowScore ? curr : max
  );
  
  const cashFlowPayments = [...minimums];
  cashFlowPayments[cashFlowWeighted.index] += Math.min(extraBudget, balances[cashFlowWeighted.index]);
  strategies.push({
    payments: cashFlowPayments,
    name: `Cash Flow Weighted (Debt ${cashFlowWeighted.index + 1} - $${cashFlowWeighted.cashFlowScore.toFixed(0)} score)`,
    priority: 70
  });
  
  // Strategy: Balanced High-Impact (split between top 2 by combined metrics)
  if (extraBudget >= config.minimumExtraBudget && activeDebts.length >= 2) {
    const combinedScored = activeDebts.map(debt => ({
      ...debt,
      combinedScore: debt.monthlyInterest + (debt.cashFlowValue * 3) + (debt.efficiency / config.efficiencyDivisor)
    })).sort((a, b) => b.combinedScore - a.combinedScore);
    
    const balancedPayments = [...minimums];
    const split1 = Math.floor(extraBudget * config.balancedSplitPrimary);
    const split2 = extraBudget - split1;
    
    balancedPayments[combinedScored[0].index] += Math.min(split1, balances[combinedScored[0].index]);
    balancedPayments[combinedScored[1].index] += Math.min(split2, balances[combinedScored[1].index]);
    strategies.push({
      payments: balancedPayments,
      name: `Balanced High-Impact ${(config.balancedSplitPrimary * 100).toFixed(0)}/${(config.balancedSplitSecondary * 100).toFixed(0)}`,
      priority: 60
    });
  }
  
  // Strategy: Progressive Snowball (smallest debt, but only if reasonable cash flow)
  const smallestWithGoodCashFlow = activeDebts
    .filter(debt => debt.cashFlowValue >= config.minimumCashFlowValue)
    .reduce((min, curr) => curr.balance < min.balance ? curr : min, activeDebts[0]);
  
  if (smallestWithGoodCashFlow) {
    const progressivePayments = [...minimums];
    progressivePayments[smallestWithGoodCashFlow.index] += Math.min(extraBudget, balances[smallestWithGoodCashFlow.index]);
    strategies.push({
      payments: progressivePayments,
      name: `Progressive Snowball (Debt ${smallestWithGoodCashFlow.index + 1}) - Frees $${smallestWithGoodCashFlow.cashFlowValue}/mo`,
      priority: 50
    });
  }
  
  return strategies;
};

/**
 * Generate all payment strategies for given debt balances and budget
 * 
 * @param balances - Current debt balances
 * @param debts - Debt information array
 * @param effectiveBudget - Available budget for this optimization
 * @param config - Configuration for strategy generation
 * @returns Array of all generated payment strategies
 */
export const generateAllPaymentStrategies = (
  balances: number[],
  debts: DebtResponse[],
  effectiveBudget: number,
  config: PaymentStrategyConfig = DEFAULT_PAYMENT_STRATEGY_CONFIG
): PaymentStrategy[] => {
  const minimums = debts.map(debt => debt.minimumPayment);
  const extraBudget = effectiveBudget - minimums.reduce((a, b) => a + b, 0);
  
  const strategies: PaymentStrategy[] = [];
  
  // Strategy 1: All minimums (baseline)
  strategies.push({ payments: [...minimums], name: 'Minimums Only' });
  
  if (extraBudget <= 0) return strategies;
  
  // Get active debts with enhanced analysis
  const activeDebts = generateActiveDebtInfo(balances, debts, extraBudget, config);
  
  if (activeDebts.length === 0) return strategies;
  
  // Generate all strategy types
  const immediatePayoffs = generateImmediatePayoffStrategies(activeDebts, minimums, extraBudget, debts, effectiveBudget);
  const rapidPayoffs = generateRapidPayoffStrategies(activeDebts, minimums, extraBudget, activeDebts.filter(d => immediatePayoffs.some(ip => ip.payments[d.index] > minimums[d.index])));
  const traditionalStrategies = generateTraditionalStrategies(activeDebts, minimums, extraBudget, balances);
  const advancedStrategies = generateAdvancedStrategies(activeDebts, minimums, extraBudget, balances, config);
  
  // Combine all strategies
  strategies.push(...immediatePayoffs, ...rapidPayoffs, ...traditionalStrategies, ...advancedStrategies);
  
  return strategies;
};
