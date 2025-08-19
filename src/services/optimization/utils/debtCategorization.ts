/**
 * Debt Categorization Service
 * 
 * This module contains business logic for categorizing debts by priority.
 * Uses configurable thresholds to determine debt priority levels.
 * 
 * @module DebtCategorization
 */

import { DebtResponse } from '../../../types/debts';

/**
 * Configuration for debt categorization thresholds
 */
export interface DebtCategorizationConfig {
  autoLoanLargeAmount: number;      // Default: 30000
  studentLoanHighRate: number;      // Default: 0.08 (8%)
  personalLoanHighRate: number;     // Default: 0.12 (12%)
  otherLargeAmount: number;         // Default: 50000
  otherHighRate: number;            // Default: 0.15 (15%)
  otherSmallAmount: number;         // Default: 5000
  otherLowRate: number;             // Default: 0.08 (8%)
}

/**
 * Default configuration for debt categorization
 */
export const DEFAULT_CATEGORIZATION_CONFIG: DebtCategorizationConfig = {
  autoLoanLargeAmount: 30000,
  studentLoanHighRate: 0.08,
  personalLoanHighRate: 0.12,
  otherLargeAmount: 50000,
  otherHighRate: 0.15,
  otherSmallAmount: 5000,
  otherLowRate: 0.08
};

/**
 * Result of debt categorization
 */
export interface CategorizedDebts {
  highPriority: DebtResponse[];   // Credit cards, medical, high-interest
  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto
  lowPriority: DebtResponse[];    // Mortgage, large auto loans
}

/**
 * Categorization summary for logging
 */
export interface CategorizationSummary {
  highPriority: { count: number; totalAmount: number };
  mediumPriority: { count: number; totalAmount: number };
  lowPriority: { count: number; totalAmount: number };
}

/**
 * Categorize debts based on type, amount, and interest rate
 * 
 * @param debts - Array of debt responses to categorize
 * @param config - Configuration for categorization thresholds
 * @param enableLogging - Whether to log categorization details
 * @returns Categorized debts organized by priority
 */
export const categorizeDebts = (
  debts: DebtResponse[], 
  config: DebtCategorizationConfig = DEFAULT_CATEGORIZATION_CONFIG,
  enableLogging: boolean = true
): CategorizedDebts => {
  const highPriority: DebtResponse[] = [];
  const mediumPriority: DebtResponse[] = [];
  const lowPriority: DebtResponse[] = [];
  
  debts.forEach(debt => {
    const category = categorizeDebt(debt, config);
    
    switch (category.priority) {
      case 'HIGH':
        highPriority.push(debt);
        if (enableLogging) {
          console.log(`   ${category.icon} HIGH PRIORITY (${category.reason}): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
        }
        break;
      case 'MEDIUM':
        mediumPriority.push(debt);
        if (enableLogging) {
          console.log(`   ${category.icon} MEDIUM PRIORITY (${category.reason}): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
        }
        break;
      case 'LOW':
        lowPriority.push(debt);
        if (enableLogging) {
          console.log(`   ${category.icon} LOW PRIORITY (${category.reason}): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
        }
        break;
    }
  });
  
  if (enableLogging) {
    logCategorizationSummary({ highPriority, mediumPriority, lowPriority });
  }
  
  return { highPriority, mediumPriority, lowPriority };
};

/**
 * Categorize a single debt based on business rules
 * 
 * @param debt - Individual debt to categorize
 * @param config - Configuration for categorization thresholds
 * @returns Category information with priority, icon, and reason
 */
export const categorizeDebt = (
  debt: DebtResponse, 
  config: DebtCategorizationConfig
): { priority: 'HIGH' | 'MEDIUM' | 'LOW'; icon: string; reason: string } => {
  // RULE 1: MORTGAGE always gets minimum payment only
  if (debt.type === 'MORTGAGE') {
    return { priority: 'LOW', icon: '🏠', reason: 'Mortgage' };
  }
  
  // RULE 2: CREDIT_CARD always high priority (high interest)
  if (debt.type === 'CREDIT_CARD') {
    return { priority: 'HIGH', icon: '💳', reason: 'Credit Card' };
  }
  
  // RULE 3: MEDICAL_DEBT high priority (avoid collections)
  if (debt.type === 'MEDICAL_DEBT') {
    return { priority: 'HIGH', icon: '🏥', reason: 'Medical' };
  }
  
  // RULE 4: AUTO_LOAN - depends on amount
  if (debt.type === 'AUTO_LOAN') {
    if (debt.currentAmount > config.autoLoanLargeAmount) {
      return { priority: 'LOW', icon: '🚗', reason: 'Large Auto' };
    } else {
      return { priority: 'MEDIUM', icon: '🚙', reason: 'Auto' };
    }
  }
  
  // RULE 5: STUDENT_LOAN - usually medium (lower interest)
  if (debt.type === 'STUDENT_LOAN') {
    if (debt.interestRate > config.studentLoanHighRate) {
      return { priority: 'MEDIUM', icon: '🎓', reason: 'Student High Rate' };
    } else {
      return { priority: 'LOW', icon: '📚', reason: 'Student Low Rate' };
    }
  }
  
  // RULE 6: PERSONAL_LOAN - depends on interest rate
  if (debt.type === 'PERSONAL_LOAN') {
    if (debt.interestRate > config.personalLoanHighRate) {
      return { priority: 'HIGH', icon: '💰', reason: 'Personal High Rate' };
    } else {
      return { priority: 'MEDIUM', icon: '💵', reason: 'Personal' };
    }
  }
  
  // RULE 7: OTHER - use smart logic
  if (debt.type === 'OTHER') {
    if (debt.currentAmount > config.otherLargeAmount && debt.interestRate < config.otherLowRate) {
      return { priority: 'LOW', icon: '📦', reason: 'Other Large' };
    } else if (debt.interestRate > config.otherHighRate || debt.currentAmount < config.otherSmallAmount) {
      return { priority: 'HIGH', icon: '⚡', reason: 'Other' };
    } else {
      return { priority: 'MEDIUM', icon: '📋', reason: 'Other' };
    }
  }
  
  // Default case (should not happen with proper typing)
  return { priority: 'MEDIUM', icon: '❓', reason: 'Unknown' };
};

/**
 * Calculate categorization summary statistics
 * 
 * @param categorizedDebts - Result of debt categorization
 * @returns Summary statistics for each priority level
 */
export const calculateCategorizationSummary = (
  categorizedDebts: CategorizedDebts
): CategorizationSummary => {
  return {
    highPriority: {
      count: categorizedDebts.highPriority.length,
      totalAmount: categorizedDebts.highPriority.reduce((sum, debt) => sum + debt.currentAmount, 0)
    },
    mediumPriority: {
      count: categorizedDebts.mediumPriority.length,
      totalAmount: categorizedDebts.mediumPriority.reduce((sum, debt) => sum + debt.currentAmount, 0)
    },
    lowPriority: {
      count: categorizedDebts.lowPriority.length,
      totalAmount: categorizedDebts.lowPriority.reduce((sum, debt) => sum + debt.currentAmount, 0)
    }
  };
};

/**
 * Log categorization summary to console
 * 
 * @param categorizedDebts - Result of debt categorization
 */
export const logCategorizationSummary = (categorizedDebts: CategorizedDebts): void => {
  const summary = calculateCategorizationSummary(categorizedDebts);
  
  console.log(`\n   📊 Categorization Summary:`);
  console.log(`      High Priority: ${summary.highPriority.count} debts ($${summary.highPriority.totalAmount.toFixed(2)})`);
  console.log(`      Medium Priority: ${summary.mediumPriority.count} debts ($${summary.mediumPriority.totalAmount.toFixed(2)})`);
  console.log(`      Low Priority: ${summary.lowPriority.count} debts ($${summary.lowPriority.totalAmount.toFixed(2)})`);
};
