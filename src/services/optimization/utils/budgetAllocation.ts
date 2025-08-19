/**
 * Budget Allocation Service
 * 
 * This module contains logic for allocating available budget across debt priorities.
 * Uses intelligent strategies based on debt composition and types.
 * 
 * @module BudgetAllocation
 */

import { CategorizedDebts } from './debtCategorization';

/**
 * Configuration for budget allocation percentages
 */
export interface BudgetAllocationConfig {
  defaultHighPercentage: number;        // Default: 0.8 (80%)
  defaultMediumPercentage: number;      // Default: 0.2 (20%)
  defaultLowPercentage: number;         // Default: 0.0 (0%)
  medicalDebtHighPercentage: number;    // Default: 0.9 (90% when medical debt exists)
  medicalDebtMediumPercentage: number;  // Default: 0.1 (10% when medical debt exists)
  studentLoanBonusPercentage: number;   // Default: 0.1 (10% bonus for student loans)
  maxStudentLoanPercentage: number;     // Default: 0.3 (30% max for student loans)
  highLowSplitHighPercentage: number;   // Default: 0.8 (80% high when no medium)
  highLowSplitLowPercentage: number;    // Default: 0.2 (20% low when no medium)
}

/**
 * Default configuration for budget allocation
 */
export const DEFAULT_BUDGET_ALLOCATION_CONFIG: BudgetAllocationConfig = {
  defaultHighPercentage: 0.8,
  defaultMediumPercentage: 0.2,
  defaultLowPercentage: 0.0,
  medicalDebtHighPercentage: 0.9,
  medicalDebtMediumPercentage: 0.1,
  studentLoanBonusPercentage: 0.1,
  maxStudentLoanPercentage: 0.3,
  highLowSplitHighPercentage: 0.8,
  highLowSplitLowPercentage: 0.2
};

/**
 * Result of budget allocation
 */
export interface BudgetAllocation {
  highBudget: number;
  mediumBudget: number;
  lowBudget: number;
  totalBudget: number;
  extraBudget: number;
  totalMinimums: number;
  strategy: string;
}

/**
 * Breakdown of minimum payments by priority
 */
export interface MinimumPaymentBreakdown {
  highMinimums: number;
  mediumMinimums: number;
  lowMinimums: number;
  totalMinimums: number;
}

/**
 * Allocate budget across debt priorities using intelligent strategies
 * 
 * @param categories - Categorized debts by priority
 * @param totalBudget - Total available monthly budget
 * @param config - Configuration for allocation percentages
 * @param enableLogging - Whether to log allocation details
 * @returns Budget allocation breakdown
 */
export const allocateBudgetByPriority = (
  categories: CategorizedDebts,
  totalBudget: number,
  config: BudgetAllocationConfig = DEFAULT_BUDGET_ALLOCATION_CONFIG,
  enableLogging: boolean = true
): BudgetAllocation => {
  // Calculate minimum payments for each category
  const minimums = calculateMinimumPayments(categories);
  const extraBudget = Math.max(0, totalBudget - minimums.totalMinimums);
  
  if (enableLogging) {
    logBudgetBreakdown(totalBudget, minimums, extraBudget);
  }
  
  // Determine allocation strategy
  const allocationStrategy = determineAllocationStrategy(categories, config);
  
  if (enableLogging) {
    console.log(`      Allocation Strategy: ${allocationStrategy.description}`);
  }
  
  return {
    highBudget: minimums.highMinimums + (extraBudget * allocationStrategy.highPercentage),
    mediumBudget: minimums.mediumMinimums + (extraBudget * allocationStrategy.mediumPercentage),
    lowBudget: minimums.lowMinimums + (extraBudget * allocationStrategy.lowPercentage),
    totalBudget,
    extraBudget,
    totalMinimums: minimums.totalMinimums,
    strategy: allocationStrategy.description
  };
};

/**
 * Calculate minimum payment requirements for each priority category
 * 
 * @param categories - Categorized debts by priority
 * @returns Breakdown of minimum payments
 */
export const calculateMinimumPayments = (categories: CategorizedDebts): MinimumPaymentBreakdown => {
  const highMinimums = categories.highPriority.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  const mediumMinimums = categories.mediumPriority.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  const lowMinimums = categories.lowPriority.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  
  return {
    highMinimums,
    mediumMinimums,
    lowMinimums,
    totalMinimums: highMinimums + mediumMinimums + lowMinimums
  };
};

/**
 * Determine the best allocation strategy based on debt composition
 * 
 * @param categories - Categorized debts by priority
 * @param config - Configuration for allocation percentages
 * @returns Allocation strategy with percentages and description
 */
export const determineAllocationStrategy = (
  categories: CategorizedDebts,
  config: BudgetAllocationConfig
): {
  highPercentage: number;
  mediumPercentage: number;
  lowPercentage: number;
  description: string;
} => {
  // Check for medical debt (highest urgency)
  const hasMedicalDebt = categories.highPriority.some(debt => debt.type === 'MEDICAL_DEBT');
  if (hasMedicalDebt) {
    return {
      highPercentage: config.medicalDebtHighPercentage,
      mediumPercentage: config.medicalDebtMediumPercentage,
      lowPercentage: 0.0,
      description: `${(config.medicalDebtHighPercentage * 100).toFixed(0)}% High / ${(config.medicalDebtMediumPercentage * 100).toFixed(0)}% Medium / 0% Low (Medical Debt Priority)`
    };
  }
  
  // Handle cases with missing priority categories
  if (categories.highPriority.length === 0 && categories.mediumPriority.length === 0) {
    return {
      highPercentage: 0.0,
      mediumPercentage: 0.0,
      lowPercentage: 1.0,
      description: '0% High / 0% Medium / 100% Low (Only Low Priority Debts)'
    };
  }
  
  if (categories.mediumPriority.length === 0 && categories.lowPriority.length === 0) {
    return {
      highPercentage: 1.0,
      mediumPercentage: 0.0,
      lowPercentage: 0.0,
      description: '100% High / 0% Medium / 0% Low (Only High Priority Debts)'
    };
  }
  
  if (categories.highPriority.length === 0 && categories.mediumPriority.length > 0) {
    return {
      highPercentage: 0.0,
      mediumPercentage: 1.0,
      lowPercentage: 0.0,
      description: '0% High / 100% Medium / 0% Low (Only Medium Priority Debts)'
    };
  }
  
  if (categories.mediumPriority.length === 0) {
    return {
      highPercentage: config.highLowSplitHighPercentage,
      mediumPercentage: 0.0,
      lowPercentage: config.highLowSplitLowPercentage,
      description: `${(config.highLowSplitHighPercentage * 100).toFixed(0)}% High / 0% Medium / ${(config.highLowSplitLowPercentage * 100).toFixed(0)}% Low (No Medium Priority)`
    };
  }
  
  // Special handling for student loans
  const hasOnlyStudentLoans = categories.mediumPriority.every(debt => debt.type === 'STUDENT_LOAN');
  if (hasOnlyStudentLoans && categories.mediumPriority.length > 0) {
    const adjustedMediumPercentage = Math.min(
      config.maxStudentLoanPercentage,
      config.defaultMediumPercentage + config.studentLoanBonusPercentage
    );
    const adjustedHighPercentage = 1.0 - adjustedMediumPercentage;
    
    return {
      highPercentage: adjustedHighPercentage,
      mediumPercentage: adjustedMediumPercentage,
      lowPercentage: 0.0,
      description: `${(adjustedHighPercentage * 100).toFixed(0)}% High / ${(adjustedMediumPercentage * 100).toFixed(0)}% Medium / 0% Low (Student Loan Bonus)`
    };
  }
  
  // Default allocation strategy
  return {
    highPercentage: config.defaultHighPercentage,
    mediumPercentage: config.defaultMediumPercentage,
    lowPercentage: config.defaultLowPercentage,
    description: `${(config.defaultHighPercentage * 100).toFixed(0)}% High / ${(config.defaultMediumPercentage * 100).toFixed(0)}% Medium / ${(config.defaultLowPercentage * 100).toFixed(0)}% Low (Default Strategy)`
  };
};

/**
 * Log budget breakdown details to console
 * 
 * @param totalBudget - Total available budget
 * @param minimums - Minimum payment breakdown
 * @param extraBudget - Extra budget available for optimization
 */
export const logBudgetBreakdown = (
  totalBudget: number,
  minimums: MinimumPaymentBreakdown,
  extraBudget: number
): void => {
  console.log(`\n   💰 Budget Allocation:`);
  console.log(`      Total Budget: $${totalBudget.toFixed(2)}`);
  console.log(`      Total Minimums: $${minimums.totalMinimums.toFixed(2)}`);
  console.log(`      - High Priority Mins: $${minimums.highMinimums.toFixed(2)}`);
  console.log(`      - Medium Priority Mins: $${minimums.mediumMinimums.toFixed(2)}`);
  console.log(`      - Low Priority Mins: $${minimums.lowMinimums.toFixed(2)}`);
  console.log(`      Extra Available: $${extraBudget.toFixed(2)}`);
};
