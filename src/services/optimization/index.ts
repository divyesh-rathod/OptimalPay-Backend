/**
 * Optimization Service Module Index
 * 
 * This module exports all the refactored optimization components,
 * providing a clean interface for the main optimization service.
 * 
 * @module OptimizationIndex
 */

// Core Algorithm Components
export {
  AStarConfig,
  AStarNode,
  AStarPriorityQueue,
  DEFAULT_ASTAR_CONFIG,
  createAStarPriorityQueue,
  createInitialAStarNode,
  createChildAStarNode,
  enqueueAStarNode,
  dequeueAStarNode,
  isAStarQueueEmpty,
  isGoalState,
  reconstructPath,
  calculateHeuristic,
  calculateStepCost,
  validateAStarNode
} from './algorithm/astar';

export {
  AStarSearchResult,
  executeAStarSearch,
  quickAStarSearch
} from './algorithm/astarSearch';

// Strategy Components
export {
  PaymentStrategy,
  PaymentStrategyConfig,
  EnhancedDebtInfo,
  StrategyEvaluation,
  DEFAULT_PAYMENT_STRATEGY_CONFIG,
  generateAllPaymentStrategies,
  generateImmediatePayoffStrategies,
  generateRapidPayoffStrategies,
  generateTraditionalStrategies,
  generateAdvancedStrategies
} from './strategies/paymentStrategies';

export {
  StrategyEvaluationConfig,
  EvaluatedPaymentStrategy,
  DEFAULT_STRATEGY_EVALUATION_CONFIG,
  evaluateStrategyWithLookahead,
  evaluateAndRankStrategies,
  quickEvaluateStrategy,
  findBestStrategy
} from './strategies/strategyEvaluation';

// Utility Components
export {
  calculateMonthlyInterest,
  calculateNewBalance,
  calculateMonthsToPayoff
} from './utils/interestCalculations';

export {
  DebtCategorizationConfig,
  CategorizedDebts,
  DEFAULT_CATEGORIZATION_CONFIG,
  categorizeDebts,
  categorizeDebt
} from './utils/debtCategorization';

export {
  BudgetAllocationConfig,
  BudgetAllocation,
  DEFAULT_BUDGET_ALLOCATION_CONFIG,
  allocateBudgetByPriority,
  determineAllocationStrategy
} from './utils/budgetAllocation';

export {
  discretizeBalance,
  createStateKey,
  calculateNewBalances
} from './utils/balanceCalculations';

// Configuration Management
export {
  OptimizationConfig,
  GlobalOptimizationConfig,
  ConfigRepository,
  InMemoryConfigRepository,
  ConfigurationManager,
  DEFAULT_OPTIMIZATION_CONFIG,
  DEFAULT_GLOBAL_CONFIG,
  createConfigurationManager,
  globalConfigManager,
  CONFIG_PRESETS
} from './config';

// Re-export types for convenience
export type {
  DebtResponse
} from '../../types/debts';
