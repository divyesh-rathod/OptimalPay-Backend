/**
 * Strategy Evaluation Service
 * 
 * This module contains functions for evaluating payment strategies using
 * lookahead analysis and scoring mechanisms.
 * 
 * @module StrategyEvaluation
 */

import { DebtResponse } from '../../../types/debts';
import { PaymentStrategy, StrategyEvaluation } from './paymentStrategies';
import { calculateMonthlyInterest } from '../utils/interestCalculations';
import { discretizeBalance } from '../utils/balanceCalculations';

/**
 * Configuration for strategy evaluation
 */
export interface StrategyEvaluationConfig {
  lookaheadDepth: number;              // Default: 3 (months to look ahead)
  completionBonusBase: number;         // Default: 1000 (base score for early completion)
  balanceReductionWeight: number;      // Default: 10 (weight for balance reduction)
  interestEfficiencyWeight: number;    // Default: 5 (weight for interest efficiency)
  maxTopStrategies: number;            // Default: 3 (max strategies to evaluate with lookahead)
}

/**
 * Default configuration for strategy evaluation
 */
export const DEFAULT_STRATEGY_EVALUATION_CONFIG: StrategyEvaluationConfig = {
  lookaheadDepth: 3,
  completionBonusBase: 1000,
  balanceReductionWeight: 10,
  interestEfficiencyWeight: 5,
  maxTopStrategies: 3
};

/**
 * Enhanced payment strategy with lookahead evaluation
 */
export interface EvaluatedPaymentStrategy extends PaymentStrategy {
  lookaheadScore: number;
  lookaheadData: StrategyEvaluation;
}

/**
 * Evaluate a single strategy using lookahead analysis
 * 
 * @param currentBalances - Current debt balances
 * @param strategy - Payment strategy to evaluate
 * @param debts - Debt information array
 * @param config - Configuration for evaluation
 * @returns Strategy evaluation result
 */
export const evaluateStrategyWithLookahead = (
  currentBalances: number[],
  strategy: PaymentStrategy,
  debts: DebtResponse[],
  config: StrategyEvaluationConfig = DEFAULT_STRATEGY_EVALUATION_CONFIG
): StrategyEvaluation => {
  let tempBalances = [...currentBalances];
  let totalInterestAccumulated = 0;
  let totalPrincipalAccumulated = 0;
  
  // Perform lookahead analysis
  for (let futureMonth = 1; futureMonth <= config.lookaheadDepth; futureMonth++) {
    let monthlyInterest = 0;
    let monthlyPrincipal = 0;
    
    // Calculate this month's payments and their effects
    tempBalances = tempBalances.map((balance, i) => {
      if (balance <= 5) return 0;
      
      const payment = Math.min(strategy.payments[i], balance + calculateMonthlyInterest(balance, debts[i].interestRate));
      const interest = calculateMonthlyInterest(balance, debts[i].interestRate);
      const principal = payment - interest;
      const newBalance = balance - principal;
      
      monthlyInterest += interest;
      monthlyPrincipal += principal;
      
      return discretizeBalance(newBalance, debts.length);
    });
    
    totalInterestAccumulated += monthlyInterest;
    totalPrincipalAccumulated += monthlyPrincipal;
    
    // If all debts paid off in lookahead, that's excellent
    if (tempBalances.every(b => b <= 5)) {
      return {
        score: config.completionBonusBase - futureMonth, // Reward early completion
        totalDebtReduction: totalPrincipalAccumulated,
        interestCost: totalInterestAccumulated,
        monthsToComplete: futureMonth,
        balancesAfterLookahead: tempBalances
      };
    }
  }
  
  // Calculate final lookahead score
  const totalDebtReduction = totalPrincipalAccumulated;
  const interestEfficiency = totalDebtReduction / Math.max(1, totalInterestAccumulated);
  const balanceReduction = currentBalances.reduce((a, b) => a + b, 0) - tempBalances.reduce((a, b) => a + b, 0);
  
  const score = (balanceReduction * config.balanceReductionWeight) + 
                (interestEfficiency * config.interestEfficiencyWeight) + 
                totalDebtReduction;
  
  return {
    score,
    totalDebtReduction,
    interestCost: totalInterestAccumulated,
    monthsToComplete: config.lookaheadDepth + 1,
    balancesAfterLookahead: tempBalances
  };
};

/**
 * Evaluate and rank payment strategies
 * 
 * @param strategies - Array of payment strategies to evaluate
 * @param currentBalances - Current debt balances
 * @param debts - Debt information array
 * @param config - Configuration for evaluation
 * @returns Array of evaluated and ranked strategies
 */
export const evaluateAndRankStrategies = (
  strategies: PaymentStrategy[],
  currentBalances: number[],
  debts: DebtResponse[],
  config: StrategyEvaluationConfig = DEFAULT_STRATEGY_EVALUATION_CONFIG
): EvaluatedPaymentStrategy[] => {
  // First, sort by priority and take top strategies for expensive lookahead evaluation
  const topStrategies = strategies
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, config.maxTopStrategies);
  
  // Evaluate top strategies with lookahead
  const evaluatedTopStrategies = topStrategies.map(strategy => {
    const lookaheadResult = evaluateStrategyWithLookahead(currentBalances, strategy, debts, config);
    return {
      ...strategy,
      lookaheadScore: lookaheadResult.score,
      lookaheadData: lookaheadResult
    };
  });
  
  // Add remaining strategies without expensive lookahead evaluation
  const remainingStrategies = strategies
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(config.maxTopStrategies)
    .map(strategy => ({
      ...strategy,
      lookaheadScore: strategy.priority || 0,
      lookaheadData: {
        score: strategy.priority || 0,
        totalDebtReduction: 0,
        interestCost: 0,
        monthsToComplete: Infinity,
        balancesAfterLookahead: currentBalances
      }
    }));
  
  // Combine and sort by lookahead score
  return [...evaluatedTopStrategies, ...remainingStrategies]
    .sort((a, b) => (b.lookaheadScore || 0) - (a.lookaheadScore || 0))
    .slice(0, 4); // Return top 4 strategies
};

/**
 * Quick strategy evaluation without lookahead (for performance)
 * 
 * @param strategy - Payment strategy to evaluate
 * @param currentBalances - Current debt balances
 * @param debts - Debt information array
 * @returns Quick evaluation score
 */
export const quickEvaluateStrategy = (
  strategy: PaymentStrategy,
  currentBalances: number[],
  debts: DebtResponse[]
): number => {
  let score = strategy.priority || 0;
  
  // Add bonus for strategies that target high-interest debts
  strategy.payments.forEach((payment, index) => {
    if (payment > debts[index].minimumPayment) {
      const extraPayment = payment - debts[index].minimumPayment;
      const interestRate = debts[index].interestRate;
      score += extraPayment * interestRate * 100; // Weight by interest rate
    }
  });
  
  return score;
};

/**
 * Find the best strategy from an array of strategies
 * 
 * @param strategies - Array of payment strategies
 * @param currentBalances - Current debt balances
 * @param debts - Debt information array
 * @param config - Configuration for evaluation
 * @returns Best strategy with evaluation data
 */
export const findBestStrategy = (
  strategies: PaymentStrategy[],
  currentBalances: number[],
  debts: DebtResponse[],
  config: StrategyEvaluationConfig = DEFAULT_STRATEGY_EVALUATION_CONFIG
): EvaluatedPaymentStrategy => {
  const evaluatedStrategies = evaluateAndRankStrategies(strategies, currentBalances, debts, config);
  return evaluatedStrategies[0];
};
