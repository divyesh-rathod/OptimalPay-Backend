// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult, StrategyWithLookahead } from '../types/optimization';
import {optimizeLowPriorityWithHybridAvalanche} from './highpriority.optimization.service';

const prisma = new PrismaClient();

const roundAmount = (amount: number): number => Math.round(amount * 100) / 100;

// Add this at the TOP of your optimization.service.ts file

interface CategorizedDebts {
  highPriority: DebtResponse[];   // Credit cards, medical, high-interest
  lowPriority: DebtResponse[];    // Mortgage, large auto loans
  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto
}

interface DebtPayoffTimeline {
  debtId: string;
  debtName: string;
  debtType: string;
  originalBalance: number;
  currentBalance: number;
  minimumPayment: number;
  interestRate: number;
  warnings?: string[];

  // Timeline info
  payoffMonth: number;
  payoffDate: Date;
  totalInterestPaid: number;
  totalAmountPaid: number;
  avgPrincipalPercentage: string; // Average percentage of payment going to principal
  
  // Monthly tracking
  monthlyPayments: Array<{
    month: number;
    payment: number;
    principal: number;
    interest: number;
    remainingBalance: number;
  }>;
}

interface CompleteDebtTimeline {
  individualDebts: DebtPayoffTimeline[];
  summary: {
    totalMonths: number;
    totalInterestPaid: number;
    totalAmountPaid: number;
    debtFreeDate: Date;
    payoffOrder: Array<{ month: number; debtName: string; freedBudget: number }>;
  };
}

interface CompleteDebtPlan {
  phase1: {
    months: number;
    debts: string[];
    freedBudget: number;
    totalInterest: number;
  };
  phase2: {
    months: number;
    debts: string[];
    acceleratedPayment: number;
    interestSaved: number;
    totalInterest: number;
  };
  totalMonths: number;
  totalInterest: number;
  mortgageStrategy: string;
}

// Enhanced categorization using your debt types
const categorizeDebts = (debts: DebtResponse[]): CategorizedDebts => {
  const highPriority: DebtResponse[] = [];
  const lowPriority: DebtResponse[] = [];
  const mediumPriority: DebtResponse[] = [];
  
  debts.forEach(debt => {
    // RULE 1: MORTGAGE always gets minimum payment only
    if (debt.type === 'MORTGAGE') {
      lowPriority.push(debt);
      console.log(`   🏠 LOW PRIORITY (Mortgage): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
    }
    // RULE 2: CREDIT_CARD always high priority (high interest)
    else if (debt.type === 'CREDIT_CARD') {
      highPriority.push(debt);
      console.log(`   💳 HIGH PRIORITY (Credit Card): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
    }
    // RULE 3: MEDICAL_DEBT high priority (avoid collections)
    else if (debt.type === 'MEDICAL_DEBT') {
      highPriority.push(debt);
      console.log(`   🏥 HIGH PRIORITY (Medical): ${debt.name} - $${debt.currentAmount.toFixed(2)}`);
    }
    // RULE 4: AUTO_LOAN - depends on amount
    else if (debt.type === 'AUTO_LOAN') {
      if (debt.currentAmount > 30000) {
        lowPriority.push(debt);
        console.log(`   🚗 LOW PRIORITY (Large Auto): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      } else {
        mediumPriority.push(debt);
        console.log(`   🚙 MEDIUM PRIORITY (Auto): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      }
    }
    // RULE 5: STUDENT_LOAN - usually medium (lower interest)
    else if (debt.type === 'STUDENT_LOAN') {
      if (debt.interestRate > 0.08) {
        mediumPriority.push(debt);
        console.log(`   🎓 MEDIUM PRIORITY (Student High Rate): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      } else {
        lowPriority.push(debt);
        console.log(`   📚 LOW PRIORITY (Student Low Rate): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      }
    }
    // RULE 6: PERSONAL_LOAN - depends on interest rate
    else if (debt.type === 'PERSONAL_LOAN') {
      if (debt.interestRate > 0.12) {
        highPriority.push(debt);
        console.log(`   💰 HIGH PRIORITY (Personal High Rate): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      } else {
        mediumPriority.push(debt);
        console.log(`   💵 MEDIUM PRIORITY (Personal): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      }
    }
    // RULE 7: OTHER - use smart logic
    else if (debt.type === 'OTHER') {
      // For OTHER type, use amount and interest rate to decide
      if (debt.currentAmount > 50000 && debt.interestRate < 0.08) {
        lowPriority.push(debt);
        console.log(`   📦 LOW PRIORITY (Other Large): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      } else if (debt.interestRate > 0.15 || debt.currentAmount < 5000) {
        highPriority.push(debt);
        console.log(`   ⚡ HIGH PRIORITY (Other): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      } else {
        mediumPriority.push(debt);
        console.log(`   📋 MEDIUM PRIORITY (Other): ${debt.name} - $${debt.currentAmount.toFixed(2)} @ ${(debt.interestRate * 100).toFixed(1)}%`);
      }
    }
  });
  
  // Summary
  console.log(`\n   📊 Categorization Summary:`);
  console.log(`      High Priority: ${highPriority.length} debts ($${highPriority.reduce((s,d) => s + d.currentAmount, 0).toFixed(2)})`);
  console.log(`      Medium Priority: ${mediumPriority.length} debts ($${mediumPriority.reduce((s,d) => s + d.currentAmount, 0).toFixed(2)})`);
  console.log(`      Low Priority: ${lowPriority.length} debts ($${lowPriority.reduce((s,d) => s + d.currentAmount, 0).toFixed(2)})`);
  
  return { highPriority, lowPriority, mediumPriority };
};

// Smart budget allocation based on debt types
const allocateBudgetByPriority = (
  categories: CategorizedDebts, 
  totalBudget: number
): { highBudget: number; mediumBudget: number; lowBudget: number } => {
  // Calculate minimum payments for each category
  const lowMinimums = categories.lowPriority.reduce((sum, d) => sum + d.minimumPayment, 0);
  const mediumMinimums = categories.mediumPriority.reduce((sum, d) => sum + d.minimumPayment, 0);
  const highMinimums = categories.highPriority.reduce((sum, d) => sum + d.minimumPayment, 0);
  
  const totalMinimums = lowMinimums + mediumMinimums + highMinimums;
  const extraBudget = Math.max(0, totalBudget - totalMinimums);
  
  console.log(`\n   💰 Budget Allocation:`);
  console.log(`      Total Budget: $${totalBudget.toFixed(2)}`);
  console.log(`      Total Minimums: $${totalMinimums.toFixed(2)}`);
  console.log(`      - High Priority Mins: $${highMinimums.toFixed(2)}`);
  console.log(`      - Medium Priority Mins: $${mediumMinimums.toFixed(2)}`);
  console.log(`      - Low Priority Mins: $${lowMinimums.toFixed(2)}`);
  console.log(`      Extra Available: $${extraBudget.toFixed(2)}`);
  
  // Smart allocation based on what types of debt we have
  let highPercentage = 0.8;   // Default: 80% to high priority
  let mediumPercentage = 0.2; // Default: 20% to medium
  let lowPercentage = 0.0;    // Default: 0% to low (mortgage/large loans)
  
  // Adjust if we have medical debt (urgent)
  const hasMedicalDebt = categories.highPriority.some(d => d.type === 'MEDICAL_DEBT');
  if (hasMedicalDebt) {
    highPercentage = 0.9;  // 90% to high if medical debt exists
    mediumPercentage = 0.1;
  }
  
  // Adjust if we only have medium priority debts
  if (categories.highPriority.length === 0 && categories.mediumPriority.length > 0) {
    highPercentage = 0.0;
    mediumPercentage = 1.0;
  }
  
  // If student loans are the only medium priority, maybe allocate a bit more
  const hasOnlyStudentLoans = categories.mediumPriority.every(d => d.type === 'STUDENT_LOAN');
  if (hasOnlyStudentLoans && categories.mediumPriority.length > 0) {
    mediumPercentage = Math.min(0.3, mediumPercentage + 0.1);
    highPercentage = 1.0 - mediumPercentage;
  }
  
  console.log(`      Allocation Strategy: ${(highPercentage*100).toFixed(0)}% High / ${(mediumPercentage*100).toFixed(0)}% Medium / ${(lowPercentage*100).toFixed(0)}% Low`);
  
  return {
    highBudget: highMinimums + (extraBudget * highPercentage),
    mediumBudget: mediumMinimums + (extraBudget * mediumPercentage),
    lowBudget: lowMinimums + (extraBudget * lowPercentage)
  };
};







const calculateCompleteDebtTimeline = (
  allDebts: DebtResponse[],
  optimizedPayments: any[], // From your DP result
  availableBudget: number
): CompleteDebtTimeline => {
  
  console.log('\n💰 =============== COMPLETE DEBT ELIMINATION TIMELINE ===============');
  
  // First, validate all minimum payments cover interest
  console.log('\n🔍 VALIDATING MINIMUM PAYMENTS:');
  let hasNegativeAmortization = false;
  
  allDebts.forEach(debt => {
    const monthlyInterestRequired = debt.currentAmount * (debt.interestRate / 12);
    const isAdequate = debt.minimumPayment > monthlyInterestRequired;
    
    if (!isAdequate) {
      hasNegativeAmortization = true;
      console.log(`   ⚠️ WARNING: ${debt.name}`);
      console.log(`      Monthly Interest: $${monthlyInterestRequired.toFixed(2)}`);
      console.log(`      Minimum Payment: $${debt.minimumPayment.toFixed(2)}`);
      console.log(`      DEFICIT: $${(monthlyInterestRequired - debt.minimumPayment).toFixed(2)}`);
      console.log(`      → Balance would INCREASE each month!`);
    } else {
      const principalPortion = debt.minimumPayment - monthlyInterestRequired;
      const coverageRatio = (debt.minimumPayment / monthlyInterestRequired * 100).toFixed(1);
      console.log(`   ✅ ${debt.name}: Min payment covers ${coverageRatio}% of interest (Principal: $${principalPortion.toFixed(2)}/month)`);
    }
  });
  
  if (hasNegativeAmortization) {
    console.log('\n❌ ERROR: Some debts have negative amortization! Minimum payments must be increased.');
    throw new Error('Negative amortization detected - minimum payments insufficient');
  }
  
  // Initialize tracking for each debt
  const debtTrackers = allDebts.map(debt => ({
    ...debt,
    remainingBalance: debt.currentAmount,
    isPaidOff: false,
    payoffMonth: 0,
    totalInterestPaid: 0,
    totalAmountPaid: 0,
    monthlyPayments: [] as any[],
    warningsIssued: [] as string[]
  }));
  
  const payoffOrder: Array<{ month: number; debtName: string; freedBudget: number }> = [];
  let currentMonth = 0;
  let totalInterestAllDebts = 0;
  let extraBudget = availableBudget - allDebts.reduce((sum, d) => sum + d.minimumPayment, 0);
  
  console.log(`\n💵 BUDGET BREAKDOWN:`);
  console.log(`   Total Available: $${availableBudget.toFixed(2)}`);
  console.log(`   Total Minimums: $${allDebts.reduce((sum, d) => sum + d.minimumPayment, 0).toFixed(2)}`);
  console.log(`   Extra for Optimization: $${extraBudget.toFixed(2)}`);
  
  // Simulate month by month until all debts are paid
  while (debtTrackers.some(d => !d.isPaidOff) && currentMonth < 600) {
    currentMonth++;
    
    // Process each active debt
    debtTrackers.forEach((debt, index) => {
      if (debt.isPaidOff) return;
      
      // Calculate interest for this month
      const monthlyInterest = debt.remainingBalance * (debt.interestRate / 12);
      
      // Determine payment amount
      let payment = debt.minimumPayment;
      
      // Add extra payment to highest priority unpaid debt (excluding mortgage/large loans)
      if (extraBudget > 0) {
        // Prioritize non-mortgage debts first
        const eligibleDebts = debtTrackers
          .filter(d => !d.isPaidOff && d.type !== 'MORTGAGE' && d.currentAmount < 100000);
        
        // If no eligible debts, then target highest rate debt
        const targetDebts = eligibleDebts.length > 0 ? eligibleDebts : debtTrackers.filter(d => !d.isPaidOff);
        const highestRateDebt = targetDebts.sort((a, b) => b.interestRate - a.interestRate)[0];
        
        if (debt.id === highestRateDebt.id) {
          payment += extraBudget;
        }
      }
      
      // CRITICAL: Ensure payment covers at least the interest
      if (payment < monthlyInterest) {
        console.log(`\n⚠️ Month ${currentMonth} - ${debt.name}: Payment ($${payment.toFixed(2)}) doesn't cover interest ($${monthlyInterest.toFixed(2)})!`);
        
        // Force payment to at least cover interest to prevent balance growth
        payment = Math.max(payment, monthlyInterest + 0.01); // At least $0.01 to principal
        debt.warningsIssued.push(`Month ${currentMonth}: Payment adjusted to prevent negative amortization`);
      }
      
      // Calculate principal (payment minus interest)
      const principal = payment - monthlyInterest;
      
      // Ensure we don't overpay (can't pay more than remaining balance + interest)
      if (principal > debt.remainingBalance) {
        payment = debt.remainingBalance + monthlyInterest;
      }
      
      // Apply principal to balance
      const previousBalance = debt.remainingBalance;
      debt.remainingBalance = Math.max(0, debt.remainingBalance - principal);
      
      // Validation: Ensure balance never increases
      if (debt.remainingBalance > previousBalance) {
        console.log(`\n❌ ERROR: Balance increased for ${debt.name}!`);
        console.log(`   Previous: $${previousBalance.toFixed(2)}`);
        console.log(`   New: $${debt.remainingBalance.toFixed(2)}`);
        throw new Error('Balance increase detected - calculation error');
      }
      
      // Track payment details
      debt.monthlyPayments.push({
        month: currentMonth,
        payment: roundAmount(payment),
        principal: roundAmount(principal),
        interest: roundAmount(monthlyInterest),
        remainingBalance: roundAmount(debt.remainingBalance),
        principalPercentage: ((principal / payment) * 100).toFixed(1)
      });
      
      debt.totalInterestPaid += monthlyInterest;
      debt.totalAmountPaid += payment;
      totalInterestAllDebts += monthlyInterest;
      
      // Check if paid off
      if (debt.remainingBalance <= 0.01 && !debt.isPaidOff) {
        debt.isPaidOff = true;
        debt.payoffMonth = currentMonth;
        
        // Free up the minimum payment for other debts
        const freedBudget = debt.minimumPayment;
        extraBudget += freedBudget;
        
        payoffOrder.push({
          month: currentMonth,
          debtName: debt.name,
          freedBudget
        });
        
        console.log(`\n   🎉 Month ${currentMonth}: ${debt.name} PAID OFF!`);
        console.log(`      Freed Budget: $${freedBudget}/month`);
        console.log(`      New Extra Budget: $${extraBudget.toFixed(2)}/month`);
      }
    });
    
    // Log progress milestones
    if (currentMonth === 1 || currentMonth % 12 === 0) {
      const remainingDebts = debtTrackers.filter(d => !d.isPaidOff);
      const totalRemaining = remainingDebts.reduce((sum, d) => sum + d.remainingBalance, 0);
      
      console.log(`\n   📅 ${currentMonth === 1 ? 'Month 1' : `Year ${currentMonth/12}`} Status:`);
      console.log(`      Active Debts: ${remainingDebts.length}`);
      console.log(`      Total Balance: $${totalRemaining.toFixed(2)}`);
      
      // Show which debts are active
      remainingDebts.forEach(d => {
        const percentPaid = ((1 - d.remainingBalance / d.currentAmount) * 100).toFixed(1);
        console.log(`      - ${d.name}: $${d.remainingBalance.toFixed(2)} (${percentPaid}% paid)`);
      });
    }
  }
  
  // Calculate dates
  const today = new Date();
  const debtFreeDate = new Date(today);
  debtFreeDate.setMonth(debtFreeDate.getMonth() + currentMonth);
  
  // Build individual debt timelines
  const individualDebts: DebtPayoffTimeline[] = debtTrackers.map(debt => {
    const payoffDate = new Date(today);
    payoffDate.setMonth(payoffDate.getMonth() + debt.payoffMonth);
    
    // Calculate average principal percentage
    const avgPrincipalPercent = debt.monthlyPayments.length > 0
      ? debt.monthlyPayments.reduce((sum, p) => sum + parseFloat(p.principalPercentage), 0) / debt.monthlyPayments.length
      : 0;
    
    return {
      debtId: debt.id,
      debtName: debt.name,
      debtType: debt.type as string,
      originalBalance: debt.originalAmount,
      currentBalance: debt.currentAmount,
      minimumPayment: debt.minimumPayment,
      interestRate: debt.interestRate,
      payoffMonth: debt.payoffMonth,
      payoffDate,
      totalInterestPaid: roundAmount(debt.totalInterestPaid),
      totalAmountPaid: roundAmount(debt.totalAmountPaid),
      monthlyPayments: debt.monthlyPayments.slice(0, Math.min(24, debt.monthlyPayments.length)), // First 24 months
      avgPrincipalPercentage: avgPrincipalPercent.toFixed(1),
      warnings: debt.warningsIssued
    };
  });
  
  // Sort by payoff month for display
  individualDebts.sort((a, b) => a.payoffMonth - b.payoffMonth);
  
  // Display individual debt summaries
  console.log('\n📊 INDIVIDUAL DEBT PAYOFF SCHEDULE:');
  console.log('════════════════════════════════════════════════════════════════════');
  
  individualDebts.forEach((debt, index) => {
    const years = Math.floor(debt.payoffMonth / 12);
    const months = debt.payoffMonth % 12;
    const timeStr = years > 0 ? `${years}y ${months}m` : `${months} months`;
    const interestPercent = ((debt.totalInterestPaid / debt.totalAmountPaid) * 100).toFixed(1);
    
    console.log(`\n${index + 1}. ${debt.debtName} (${debt.debtType})`);
    console.log(`   💰 Balance: $${debt.currentBalance.toLocaleString()} @ ${(debt.interestRate * 100).toFixed(1)}%`);
    console.log(`   📅 Payoff: Month ${debt.payoffMonth} (${timeStr}) - ${debt.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`);
    console.log(`   💸 Total Paid: $${debt.totalAmountPaid.toLocaleString()}`);
    console.log(`      - Principal: $${debt.currentBalance.toLocaleString()} (${(100 - parseFloat(interestPercent)).toFixed(1)}%)`);
    console.log(`      - Interest: $${debt.totalInterestPaid.toLocaleString()} (${interestPercent}%)`);
    console.log(`   📈 Monthly Min: $${debt.minimumPayment} (Avg ${debt.avgPrincipalPercentage}% to principal)`);
    
    if (debt.warnings && debt.warnings.length > 0) {
      console.log(`   ⚠️ Warnings: ${debt.warnings.join(', ')}`);
    }
  });
  
  console.log('\n════════════════════════════════════════════════════════════════════');
  
  // Overall summary with more details
  console.log('\n🎯 PAYOFF ORDER & FREED CASHFLOW:');
  let cumulativeFreedBudget = 0;
  payoffOrder.forEach(({ month, debtName, freedBudget }) => {
    cumulativeFreedBudget += freedBudget;
    const date = new Date(today);
    date.setMonth(date.getMonth() + month);
    console.log(`   Month ${month.toString().padStart(3)} (${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}): ${debtName.padEnd(30)} → Frees $${freedBudget}/mo (Total freed: $${cumulativeFreedBudget}/mo)`);
  });
  
  console.log('\n📈 DEBT ELIMINATION SUMMARY:');
  console.log(`   ⏱️  Total Time: ${currentMonth} months (${(currentMonth/12).toFixed(1)} years)`);
  console.log(`   💰 Total Interest Paid: $${roundAmount(totalInterestAllDebts).toLocaleString()}`);
  console.log(`   💸 Total Amount Paid: $${individualDebts.reduce((sum, d) => sum + d.totalAmountPaid, 0).toLocaleString()}`);
  console.log(`   📅 Debt Free Date: ${debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
  
  // Interest efficiency analysis
  const totalPrincipal = allDebts.reduce((sum, d) => sum + d.currentAmount, 0);
  const interestRate = ((totalInterestAllDebts / totalPrincipal) * 100).toFixed(1);
  console.log(`\n💡 EFFICIENCY METRICS:`);
  console.log(`   Interest as % of Principal: ${interestRate}%`);
  console.log(`   Average Monthly Interest: $${(totalInterestAllDebts / currentMonth).toFixed(2)}`);
  console.log(`   Interest Saved vs Minimums: TBD`); // Would need to calculate minimum-only scenario
  
  return {
    individualDebts,
    summary: {
      totalMonths: currentMonth,
      totalInterestPaid: roundAmount(totalInterestAllDebts),
      totalAmountPaid: individualDebts.reduce((sum, d) => sum + d.totalAmountPaid, 0),
      debtFreeDate,
      payoffOrder
    }
  };
};

// Optional: Performance optimization for large debts





// Enhanced Backward DP with 3-Month Lookahead
const optimizeWithBackwardDP = (
  debts: DebtResponse[],
  availableBudget: number,
  startMonth: number = 0,        
  freedUpBudget: number = 0,     
  freedUpAvailableMonth: number = 0
) => {
  console.log('\n⏮️ ENHANCED A* DYNAMIC PROGRAMMING WITH 3-MONTH LOOKAHEAD:');
  console.log(`   💰 Base Budget: $${availableBudget}, Freed Budget: $${freedUpBudget} (available from month ${freedUpAvailableMonth})`);
   const getCurrentBudget = (absoluteMonth: number): number => {
    if (absoluteMonth >= freedUpAvailableMonth) {
      return availableBudget + freedUpBudget;  // After freed budget available
    } else {
      return availableBudget;  // Before freed budget available
    }
  };
  
  const lookaheadDepth = 3; // 
  
  // IMPROVED discretization - adaptive based on balance size
  const discretizeBalance = (balance: number): number => {
    if (balance <= 100) return Math.max(0, Math.round(balance / 10) * 10);
    if (balance <= 1000) return Math.max(0, Math.round(balance / 25) * 25);
    return Math.max(0, Math.round(balance / 50) * 50);
  };
  
  const createStateKey = (balances: number[]): string => {
    const discretized = balances.map(discretizeBalance);
    return discretized.join('_');
  };

  // 🔥 NEW: 3-month lookahead evaluation function
  const evaluateStrategyWithLookahead = (currentBalances: number[], strategy: any) => {
    let tempBalances = [...currentBalances];
    let totalInterestAccumulated = 0;
    let totalPrincipalAccumulated = 0;
    
    // NEW: 3-month lookahead per strategy evaluation
    for (let futureMonth = 1; futureMonth <= lookaheadDepth; futureMonth++) {
      // Expensive calculation for each possible move
      let monthlyInterest = 0;
      let monthlyPrincipal = 0;
      
      // Calculate this month's payments and their effects
      tempBalances = tempBalances.map((balance, i) => {
        if (balance <= 5) return 0;
        
        const payment = Math.min(strategy.payments[i], balance + (balance * debts[i].interestRate / 12));
        const interest = balance * (debts[i].interestRate / 12);
        const principal = payment - interest;
        const newBalance = Math.max(0, balance - principal);
        
        monthlyInterest += interest;
        monthlyPrincipal += principal;
        
        return discretizeBalance(newBalance);
      });
      
      totalInterestAccumulated += monthlyInterest;
      totalPrincipalAccumulated += monthlyPrincipal;
      
      // If all debts paid off in lookahead, that's excellent
      if (tempBalances.every(b => b <= 5)) {
        return {
          score: 1000 - futureMonth, // Reward early completion
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
    
    const score = (balanceReduction * 10) + (interestEfficiency * 5) + totalDebtReduction;
    
    return {
      score,
      totalDebtReduction,
      interestCost: totalInterestAccumulated,
      monthsToComplete: lookaheadDepth + 1,
      balancesAfterLookahead: tempBalances
    };
  };

  const getPaymentStrategies = (balances: number[],currentAbsoluteMonth: number) => {
    const minimums = debts.map(d => d.minimumPayment);
     const effectiveBudget = getCurrentBudget(currentAbsoluteMonth);
    const extraBudget = effectiveBudget - minimums.reduce((a, b) => a + b, 0);
    
    console.log(`     Month ${currentAbsoluteMonth}: Budget $${effectiveBudget} (Extra: $${extraBudget})`);
    
    const strategies = [];
    
    // Strategy 1: All minimums (baseline)
    strategies.push({ payments: [...minimums], name: 'Minimums Only' });
    
    if (extraBudget <= 0) return strategies;
    
    // Get active debts with enhanced analysis
    const activeDebts = balances.map((balance, index) => {
      const monthlyInterest = balance * (debts[index].interestRate / 12);
      const maxPayment = Math.min(extraBudget + minimums[index], balance + monthlyInterest);
      const monthsToPayoff = balance / (maxPayment - monthlyInterest);
      
      return { 
        balance, 
        index,
        efficiency: balance / minimums[index],
        monthlyInterest: monthlyInterest,
        minimumPayment: minimums[index],
        monthsToPayoff: monthsToPayoff,
        cashFlowValue: minimums[index],
        canPayoffSoon: monthsToPayoff <= 3 && balance <= extraBudget * 3
      };
    }).filter(({ balance }) => balance > 10);
    
    if (activeDebts.length === 0) return strategies;

    // =================== CASH FLOW LIBERATION STRATEGIES ===================
    
    // Strategy 2: IMMEDIATE PAYOFF (highest priority)
    const immediatePayoffs = activeDebts.filter(debt => 
      debt.balance <= extraBudget && debt.balance > 0
    );
    
    for (const debt of immediatePayoffs) {
      const liberationPayments = [...minimums];
      liberationPayments[debt.index] = debt.balance + debt.monthlyInterest;
      strategies.push({ 
        payments: liberationPayments, 
        name: `🚀 IMMEDIATE LIBERATION (Debt ${debt.index + 1}) - Frees $${debt.cashFlowValue}/mo`,
        priority: 100
      });
    }
    
    // Strategy 3: RAPID LIBERATION (2-3 month payoffs)
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

    // =================== ENHANCED TRADITIONAL STRATEGIES ===================
    
    // Strategy 4: Smart Avalanche (by absolute interest cost)
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
    
    // Strategy 5: Efficiency Focus (balance/minimum ratio)
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
    
    // Strategy 6: Cash Flow Weighted (combines cash flow value + interest cost)
    const cashFlowWeighted = activeDebts.map(debt => ({
      ...debt,
      cashFlowScore: (debt.cashFlowValue * 12) + debt.monthlyInterest
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

    // Strategy 7: Balanced High-Impact (split between top 2 by combined metrics)
    if (extraBudget >= 100 && activeDebts.length >= 2) {
      const combinedScored = activeDebts.map(debt => ({
        ...debt,
        combinedScore: debt.monthlyInterest + (debt.cashFlowValue * 3) + (debt.efficiency / 10)
      })).sort((a, b) => b.combinedScore - a.combinedScore);
      
      const balancedPayments = [...minimums];
      const split1 = Math.floor(extraBudget * 0.65);
      const split2 = extraBudget - split1;
      
      balancedPayments[combinedScored[0].index] += Math.min(split1, balances[combinedScored[0].index]);
      balancedPayments[combinedScored[1].index] += Math.min(split2, balances[combinedScored[1].index]);
      strategies.push({ 
        payments: balancedPayments, 
        name: 'Balanced High-Impact 65/35',
        priority: 60
      });
    }

    // Strategy 8: Progressive Snowball (smallest debt, but only if reasonable cash flow)
    const smallestWithGoodCashFlow = activeDebts
      .filter(debt => debt.cashFlowValue >= 50)
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
    
    // 🔥 NEW: Evaluate each strategy with 3-month lookahead
    // 🔥 NEW: Only evaluate top 3 strategies with lookahead
const evaluatedStrategies = strategies
  .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  .slice(0, 3)  // Take top 4 by priority first
  .map(strategy => {
    const lookaheadResult = evaluateStrategyWithLookahead(balances, strategy);
    return {
      ...strategy,
      lookaheadScore: lookaheadResult.score,
      lookaheadData: lookaheadResult
    };
  });

// Add remaining strategies without lookahead
const remainingStrategies = strategies
  .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  .slice(3)
  .map(strategy => ({ ...strategy, lookaheadScore: strategy.priority || 0 }));

return [...evaluatedStrategies, ...remainingStrategies]
  .sort((a, b) => (b.lookaheadScore || 0) - (a.lookaheadScore || 0))
  .slice(0, 4);
  };

  // ENHANCED A* Heuristic with Cash Flow Consideration
  const calculateHeuristic = (balances: number[]): number => {
    const totalDebt = balances.reduce((a, b) => a + b, 0);
    if (totalDebt <= 0) return 0;
    
    // Calculate current budget
    let currentBudget = availableBudget;
    
    // Factor in potential freed cash flow from debts close to payoff
    let projectedFreedCashFlow = 0;
    balances.forEach((balance, i) => {
      if (balance > 0 && balance <= currentBudget * 3) {
        const monthlyInterest = balance * (debts[i].interestRate / 12);
        const monthsToPayoff = balance / (currentBudget - monthlyInterest);
        if (monthsToPayoff <= 3) {
          projectedFreedCashFlow += debts[i].minimumPayment;
        }
      }
    });
    
    // Enhanced budget calculation
    const enhancedBudget = currentBudget + (projectedFreedCashFlow * 0.5);
    
    // Weighted average interest rate
    const weightedAvgRate = debts.reduce((sum, debt, i) => {
      return sum + (debt.interestRate * balances[i]);
    }, 0) / totalDebt;
    
    // Estimate monthly principal payment
    const estimatedMonthlyPrincipal = enhancedBudget * 0.75;
    const estimatedMonths = Math.ceil(totalDebt / estimatedMonthlyPrincipal);
    
    // Cash flow complexity penalty
    const activeDemandingDebts = balances.filter((b, i) => b > 0 && debts[i].minimumPayment > 100).length;
    const complexityPenalty = Math.max(0, activeDemandingDebts - 1) * 0.3;
    
    // Liberation bonus (reward for having debts close to payoff)
    const liberationBonus = projectedFreedCashFlow > 100 ? -1 : 0;
    
    return estimatedMonths + complexityPenalty + liberationBonus;
  };

  // Calculate next month's balances with better precision
  const calculateNewBalances = (currentBalances: number[], payments: number[]): number[] => {
    return currentBalances.map((balance, i) => {
      if (balance <= 5) return 0;
      
      const payment = Math.min(payments[i], balance + (balance * debts[i].interestRate / 12));
      const monthlyInterest = balance * (debts[i].interestRate / 12);
      const principal = Math.max(0, payment - monthlyInterest);
      const newBalance = Math.max(0, balance - principal);
      
      return discretizeBalance(newBalance);
    });
  };

  // A* Priority Queue Node
  interface AStarNode {
    balances: number[];
    months: number;
    path: Array<{ month: number, balances: number[], payments: number[], strategy: string }>;
    fScore: number;
    gScore: number;
    hScore: number;
  }

  // 🔥 ENHANCED: A* search with 3-month lookahead but deep search capability
  const calculateOptimalPath = (
    initialBalances: number[],
    startMonth: number,           // NEW: Add this parameter
    freedUpAvailableMonth: number
  ): { 
    months: number, 
    path: Array<{ month: number, balances: number[], payments: number[], strategy: string }> 
  } => {
    const openSet: AStarNode[] = [];
    const closedSet = new Set<string>();
    const gScores = new Map<string, number>();
    
    const startKey = createStateKey(initialBalances);
    const initialHeuristic = calculateHeuristic(initialBalances);
    
    const startNode: AStarNode = { 
      balances: initialBalances, 
      months: 0,
      gScore: 0,
      hScore: initialHeuristic,
      fScore: initialHeuristic,
      path: [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }] 
    };
    
    openSet.push(startNode);
    gScores.set(startKey, 0);
    
    let iterations = 0;
    const MAX_ITERATIONS = 8000000; // 🔥 KEEP HIGH: Thorough search
    const MAX_MONTHS = 370; // 🔥 KEEP DEEP: Complete debt elimination
    let bestSolutionFound: any = null;
    
    console.log(`🔍 A* Deep Search with 3-Month Lookahead: [${initialBalances.map(b => `$${b}`).join(', ')}]`);
    console.log(`🎯 Initial heuristic estimate: ${initialHeuristic} months`);
    
    while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      
      // Get node with lowest fScore (A* priority)
      openSet.sort((a, b) => a.fScore - b.fScore);
      const current = openSet.shift()!;
      const currentKey = createStateKey(current.balances);
      
      // Move to closed set
      closedSet.add(currentKey);
      
      // Base case: all debts paid off
      if (current.balances.every(b => b <= 5)) {
        console.log(`✅ A* Found optimal solution in ${current.months} months after ${iterations} iterations`);
        return { months: current.months, path: current.path };
      }
      
      // Track best partial solution
      const totalDebt = current.balances.reduce((a, b) => a + b, 0);
      if (!bestSolutionFound || totalDebt < bestSolutionFound.totalDebt || 
          (totalDebt === bestSolutionFound.totalDebt && current.months < bestSolutionFound.months)) {
        bestSolutionFound = { months: current.months, path: current.path, totalDebt };
      }
      
      // Don't explore beyond reasonable timeframe
      if (current.months >= MAX_MONTHS) continue;
      
      // 🔥 NEW: Explore strategies with 3-month lookahead evaluation
      const currentAbsoluteMonth = startMonth + current.months;
      const strategies = getPaymentStrategies(current.balances, currentAbsoluteMonth);
      
      for (const strategy of strategies as StrategyWithLookahead[]) {
        const newBalances = calculateNewBalances(current.balances, strategy.payments);
        const newKey = createStateKey(newBalances);
        
        // Skip if no progress made
        const oldTotal = current.balances.reduce((a, b) => a + b, 0);
        const newTotal = newBalances.reduce((a, b) => a + b, 0);
        if (newTotal >= oldTotal) continue;
        
        // Skip if already in closed set
        if (closedSet.has(newKey)) continue;
        
        const tentativeGScore = current.gScore + 1;
        
        // Skip if we've found a better path to this state
        const knownGScore = gScores.get(newKey);
        if (knownGScore !== undefined && tentativeGScore >= knownGScore) continue;
        
        // This is the best path to this state so far
        gScores.set(newKey, tentativeGScore);
        
        // 🔥 NEW: Use 3-month lookahead score as enhanced heuristic
        const baseHeuristic = calculateHeuristic(newBalances);
        const lookaheadBonus = strategy.lookaheadScore ? Math.min(5, strategy.lookaheadScore / 200) : 0;
        const hScore = Math.max(0.5, baseHeuristic - lookaheadBonus);
        const fScore = tentativeGScore + hScore;
        
        const newPath = [...current.path, { 
          month: current.months + 1, 
          balances: newBalances, 
          payments: strategy.payments, 
          strategy: strategy.name 
        }];
        
        // Add to open set
        const neighborNode: AStarNode = {
          balances: newBalances,
          months: current.months + 1,
          gScore: tentativeGScore,
          hScore: hScore,
          fScore: fScore,
          path: newPath
        };
        
        openSet.push(neighborNode);
      }
      
      // Progress logging
      if (iterations % 20000 === 0) {
        const currentDebt = current.balances.reduce((a, b) => a + b, 0);
        console.log(`   🔍 A* Iteration ${iterations}, Queue: ${openSet.length}, Month: ${current.months}, Debt: $${currentDebt}, F: ${current.fScore.toFixed(1)}`);
      }
    }
    
    console.log(`⚠️ A* reached ${iterations} iterations`);
    
    // Return best solution found
    if (bestSolutionFound && bestSolutionFound.path.length > 1) {
      console.log(`📊 Using best solution found: ${bestSolutionFound.months} months, $${bestSolutionFound.totalDebt.toFixed(2)} remaining debt`);
      return bestSolutionFound;
    }
    
    // Fallback strategy
    console.log(`🔄 Using fallback avalanche strategy`);
    const fallbackPath = [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }];
    let currentBalances = [...initialBalances];
    
    for (let month = 1; month <= Math.min(60, MAX_MONTHS); month++) {
       const currentAbsoluteMonth = startMonth + month; 
      const strategies = getPaymentStrategies(currentBalances,currentAbsoluteMonth);
      const avalancheStrategy = strategies.find(s => s.name.includes('Avalanche')) || strategies[0];
      
      fallbackPath.push({
        month,
        balances: [...currentBalances],
        payments: avalancheStrategy.payments,
        strategy: avalancheStrategy.name
      });
      
      currentBalances = calculateNewBalances(currentBalances, avalancheStrategy.payments);
      
      if (currentBalances.every(b => b <= 5)) {
        console.log(`✅ Fallback strategy completes in ${month} months`);
        break;
      }
    }
    
    return { months: fallbackPath.length - 1, path: fallbackPath };
  };

  // Generate detailed projection using actual balances
  const generateDPProjection = (path: any[]) => {
    if (path.length <= 1) {
      console.log(`❌ Path too short, using fallback`);
      return null;
    }
    
    console.log(`\n📊 A* COMPLETE PROJECTION WITH 3-MONTH LOOKAHEAD:`);
    
    let actualBalances = debts.map(debt => debt.currentAmount);
    let totalInterestPaid = 0;
    const projection = [];
    
    for (let month = 1; month < Math.min(path.length, 121); month++) {
      const { payments, strategy } = path[month];
      
      let monthlyInterest = 0;
      const monthlyPayments: Array<{
        debtName: string;
        payment: number;
        interest: number;
        principal: number;
        newBalance: number;
      }> = [];

      actualBalances = actualBalances.map((balance, i) => {
        if (balance <= 0.01) {
          monthlyPayments.push({
            debtName: debts[i].name,
            payment: 0,
            interest: 0,
            principal: 0,
            newBalance: 0
          });
          return 0;
        }

        const payment = payments[i];
        const interest = balance * (debts[i].interestRate / 12);
        const principal = payment - interest;
        const newBalance = Math.max(0, balance - principal);

        monthlyInterest += interest;

        monthlyPayments.push({
          debtName: debts[i].name,
          payment: payment,
          interest: Math.round(interest * 100) / 100,
          principal: Math.round(principal * 100) / 100,
          newBalance: Math.round(newBalance * 100) / 100
        });

        return newBalance;
      });

      totalInterestPaid += monthlyInterest;
      const totalDebtRemaining = actualBalances.reduce((sum, b) => sum + b, 0);

      projection.push({
        month,
        strategy,
        totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
        totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
        payments: monthlyPayments
      });

      // Enhanced logging
      if (month % 6 === 0 || month <= 3 || totalDebtRemaining <= 1000) {
        console.log(`   Month ${month.toString().padStart(2)} (${strategy}): Debt $${totalDebtRemaining.toFixed(2)}, Interest $${totalInterestPaid.toFixed(2)}`);
      }

      if (totalDebtRemaining <= 1) {
        console.log(`🎉 A* Strategy: All debts eliminated in ${month} months!`);
        break;
      }
    }

    return {
      totalMonths: projection.length,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      projection
    };
  };

  // Main execution
  const initialBalances = debts.map(debt => debt.currentAmount);
  const discretizedInitial = initialBalances.map(discretizeBalance);
  
  console.log(`🎯 A* Starting balances: [${discretizedInitial.map(b => `$${b}`).join(', ')}]`);
  console.log(`💰 Available budget: $${availableBudget}, Extra budget: $${availableBudget - debts.reduce((sum, d) => sum + d.minimumPayment, 0)}`);
  
  const optimalResult = calculateOptimalPath(discretizedInitial,startMonth,freedUpAvailableMonth);
  
  console.log(`\n📅 A* COMPLETE STRATEGY (${optimalResult.path.length - 1} months):`);
  
  // Show strategy summary
  const pathToShow = optimalResult.path.slice(1, Math.min(13, optimalResult.path.length));
  if (pathToShow.length > 0) {
    pathToShow.forEach(({ month, balances, payments, strategy }) => {
      const totalDebt = balances.reduce((a, b) => a + b, 0);
      console.log(`   Month ${month.toString().padStart(2)}: ${strategy.padEnd(25)} | Payments=[${payments.map(p => `$${p}`).join(', ')}] | Debt=$${totalDebt}`);
    });
    
    if (optimalResult.path.length > 13) {
      console.log(`   ... (showing first 12 months of ${optimalResult.path.length-1} total months)`);
    }
  }

  const dpProjection = generateDPProjection(optimalResult.path);
  
  console.log(`\n📊 A* FINAL SUMMARY:`);
  if (dpProjection) {
    console.log(`   🎯 Total Months: ${dpProjection.totalMonths}`);
    console.log(`   💰 Total Interest: $${dpProjection.totalInterestPaid}`);
    console.log(`   🚀 Strategy Efficiency: ${dpProjection.projection ? dpProjection.projection.length : 'N/A'} payment periods`);
  } else {
    console.log(`   ❌ Could not generate projection`);
  }
  
  const firstMonthPayments = optimalResult.path.length > 1 ? optimalResult.path[1].payments : debts.map(d => d.minimumPayment);
  
  return {
    months: optimalResult.months,
    payments: firstMonthPayments,
    projection: dpProjection,
    fullStrategy: optimalResult.path
  };
};

const showCompleteStrategy = (dpResult: any) => {
  if (!dpResult || !dpResult.projection) {
    console.log('❌ No DP result to display');
    return;
  }

  console.log('\n🔍 =============== COMPLETE DP STRATEGY ANALYSIS ===============');
  console.log(`📊 Total Strategy Length: ${dpResult.projection.totalMonths} months`);
  console.log(`💰 Total Interest Cost: $${dpResult.projection.totalInterestPaid}`);
  
  // Show every month's strategy (not just first 12)
  if (dpResult.projection.projection) {
    console.log('\n📅 MONTH-BY-MONTH DP DECISIONS WITH 3-MONTH LOOKAHEAD:');
    dpResult.projection.projection.forEach((monthData: any) => {
      const { month, strategy, totalDebtRemaining, payments } = monthData;
      console.log(`   Month ${month.toString().padStart(2)}: ${strategy.padEnd(20)} | Debt: $${totalDebtRemaining.toString().padStart(8)} | Payments: [${payments.map((p: any) => `$${p.payment}`).join(', ')}]`);
    });
  }
  
  console.log('\n🎯 DP STRATEGY TRANSITIONS:');
  if (dpResult.projection.projection) {
    let lastStrategy = '';
    dpResult.projection.projection.forEach((monthData: any) => {
      if (monthData.strategy !== lastStrategy) {
        console.log(`   📍 Month ${monthData.month}: Switched to "${monthData.strategy}"`);
        lastStrategy = monthData.strategy;
      }
    });
  }
};

export const calculateOptimalStrategy = async (userId: string): Promise<any> => {
  try {
    console.log('\n🚀 =============== DEBT OPTIMIZATION START ===============');
    
    // Fetch data
    const [debts, financialProfile] = await Promise.all([
      prisma.debt.findMany({ where: { userId, isActive: true } }),
      prisma.financialProfile.findUnique({ where: { userId } })
    ]);
    
    if (!financialProfile) {
      throw new Error('Financial profile not found');
    }
    
    if (debts.length === 0) {
      console.log('📭 No active debts found');
      return {
        isOptimal: true,
        totalInterestSaved: 0,
        projectedMonths: 0,
        plannedPayments: [],
        monthlyProjection: []
      };
    }

    // Convert to proper format
    const debtResponses: DebtResponse[] = debts.map(debt => ({
      ...debt,
      originalAmount: Number(debt.originalAmount),
      currentAmount: Number(debt.currentAmount),
      interestRate: Number(debt.interestRate),
      minimumPayment: Number(debt.minimumPayment),
      remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
      tenure: debt.tenure ? Number(debt.tenure) : null,
    }));

    const availableBudget = Number(financialProfile.monthly_income) - Number(financialProfile.monthly_expenses);

      // ============ NEW CATEGORIZATION LOGIC ============
    console.log('\n📊 DEBT CATEGORIZATION:');
    const categorized = categorizeDebts(debtResponses);
    const budgetAllocation = allocateBudgetByPriority(categorized, availableBudget);
    
    // Check if we have high-priority debts to optimize
    if (categorized.highPriority.length === 0 && categorized.mediumPriority.length === 0) {
      console.log('⚠️ No optimizable debts (only mortgage/large debts). Paying minimums only.');
      
      // Just return minimum payments for all debts
      const plannedPayments = debtResponses.map(debt => ({
        debtId: debt.id,
        debtName: debt.name,
        amount: debt.minimumPayment,
        minimumPayment: debt.minimumPayment,
        extraAmount: 0
      }));
      
      return {
        isOptimal: true,
        totalInterestSaved: 0,
        projectedMonths: 999, // Large debts take forever with minimums
        plannedPayments,
        monthlyProjection: []
      };
    }
    
    // ============ RUN OPTIMIZATION ONLY ON HIGH/MEDIUM PRIORITY ============
    let optimizationResults: any = null;
    let mediumPriorityResult: any = null;
    const allPlannedPayments: any[] = [];
    let freedUpBudgetFromHighPriority = 0;
    
    // 1. Optimize high-priority debts if any
    if (categorized.highPriority.length > 0) {
      console.log(`\n🔥 OPTIMIZING ${categorized.highPriority.length} HIGH-PRIORITY DEBTS with $${budgetAllocation.highBudget} budget`);
      
      const highPriorityResult = optimizeWithBackwardDP(
        categorized.highPriority, 
        budgetAllocation.highBudget,
        0,0,99999,
      );
      
      // Add high priority payments
      categorized.highPriority.forEach((debt, index) => {
        allPlannedPayments.push({
          debtId: debt.id,
          debtName: debt.name,
          amount: highPriorityResult.payments[index] || debt.minimumPayment,
          minimumPayment: debt.minimumPayment,
          extraAmount: Math.max(0, (highPriorityResult.payments[index] || debt.minimumPayment) - debt.minimumPayment),
          priority: 'HIGH'
        });
      });
      
      optimizationResults = highPriorityResult;
    }
    freedUpBudgetFromHighPriority = budgetAllocation.highBudget;
    
    // 2. Handle medium-priority debts
    if (categorized.mediumPriority.length > 0) {
      console.log(`\n⚖️ OPTIMIZING ${categorized.mediumPriority.length} MEDIUM-PRIORITY DEBTS with $${budgetAllocation.mediumBudget} budget`);
      
      const mediumPriorityResult = optimizeWithBackwardDP(
        categorized.mediumPriority,
        budgetAllocation.mediumBudget,
        0,
        freedUpBudgetFromHighPriority,
        optimizationResults.months
      );
      
      categorized.mediumPriority.forEach((debt, index) => {
        allPlannedPayments.push({
          debtId: debt.id,
          debtName: debt.name,
          amount: mediumPriorityResult.payments[index] || debt.minimumPayment,
          minimumPayment: debt.minimumPayment,
          extraAmount: Math.max(0, (mediumPriorityResult.payments[index] || debt.minimumPayment) - debt.minimumPayment),
          priority: 'MEDIUM'
        });
      });

    }
    
    if (categorized.lowPriority.length > 0) {
      console.log(`\n🏠 OPTIMIZING ${categorized.lowPriority.length} LOW-PRIORITY DEBTS with hybrid avalanche`);
  
      // Calculate when freed budget becomes available
      const highMediumCompletionMonth = Math.max(
        optimizationResults?.months || 0,  // High priority completion
        mediumPriorityResult?.months || 0  // Medium priority completion  
      );
  
      // Calculate total freed budget from high + medium priority debts
  
      freedUpBudgetFromHighPriority = budgetAllocation.highBudget + budgetAllocation.mediumBudget;
  
      const lowPriorityResult = optimizeLowPriorityWithHybridAvalanche(
        categorized.lowPriority,
        budgetAllocation.lowBudget,           // Just minimum payments initially
        0,                                    // Start from month 0 for low priority timeline
        freedUpBudgetFromHighPriority,                     // All freed budget from completed debts
        highMediumCompletionMonth             // When freed budget becomes available
      );
  
      // Add low priority payments to planned payments
      categorized.lowPriority.forEach((debt, index) => {
        allPlannedPayments.push({
          debtId: debt.id,
          debtName: debt.name,
          amount: lowPriorityResult.payments[index] || debt.minimumPayment,
          minimumPayment: debt.minimumPayment,
          extraAmount: Math.max(0, (lowPriorityResult.payments[index] || debt.minimumPayment) - debt.minimumPayment),
          priority: 'LOW'
        });
      });
    }
    
    
    // ============ CALCULATE TOTAL INTEREST SAVED ============
    const calculateCategorizedInterestSavings = () => {
      // Only calculate savings for optimized debts
      const optimizedDebts = [...categorized.highPriority, ...categorized.mediumPriority];
      if (optimizedDebts.length === 0) return 0;
      
      const totalOptimizedDebt = optimizedDebts.reduce((sum, debt) => sum + debt.currentAmount, 0);
      const weightedAvgInterestRate = optimizedDebts.reduce((sum, debt) => 
        sum + (debt.interestRate * debt.currentAmount), 0) / totalOptimizedDebt;
      
      const dpMonths = optimizationResults?.projection?.totalMonths || 24;
      const estimatedMinimumMonths = Math.max(dpMonths * 1.5, dpMonths + 12);
      
      const dpInterest = optimizationResults?.projection?.totalInterestPaid || 0;
      const estimatedMinimumInterest = totalOptimizedDebt * weightedAvgInterestRate * (estimatedMinimumMonths / 12) * 0.6;
      
      return Math.max(0, estimatedMinimumInterest - dpInterest);
    };

    const totalInterestSaved = calculateCategorizedInterestSavings();
    
    // Show complete strategy
    if (optimizationResults) {
      showCompleteStrategy(optimizationResults);
    }
    
    console.log('\n📊 FINAL PAYMENT PLAN:');
    allPlannedPayments.forEach(payment => {
      console.log(`   ${payment.priority} - ${payment.debtName}: $${payment.amount} (Min: $${payment.minimumPayment}, Extra: $${payment.extraAmount})`);
    });
    
    console.log('\n🏁 =============== OPTIMIZATION COMPLETE ===============');

   
    
    const completeTimeline = calculateCompleteDebtTimeline(
  debtResponses,  // ALL debts (high, medium, low priority)
  allPlannedPayments,
  availableBudget
);
    
// Return enhanced result
return {
  isOptimal: true,
  totalInterestSaved: roundAmount(totalInterestSaved),
  projectedMonths: completeTimeline.summary.totalMonths,
  plannedPayments: allPlannedPayments,
  monthlyProjection: optimizationResults?.projection?.projection?.slice(0, 36) || [],
  
  // NEW: Complete debt timeline
  debtTimeline: {
    individualDebts: completeTimeline.individualDebts.map(debt => ({
      debtId: debt.debtId,
      debtName: debt.debtName,
      debtType: debt.debtType,
      balance: debt.currentBalance,
      payoffMonth: debt.payoffMonth,
      payoffDate: debt.payoffDate.toISOString(),
      totalInterest: debt.totalInterestPaid,
      monthlyProgress: debt.monthlyPayments.slice(0, 12) // First year details
    })),
    summary: {
      totalMonths: completeTimeline.summary.totalMonths,
      totalInterest: completeTimeline.summary.totalInterestPaid,
      debtFreeDate: completeTimeline.summary.debtFreeDate.toISOString(),
      payoffSchedule: completeTimeline.summary.payoffOrder
    }
  }
};

  } catch (error) {
    console.error('❌ Optimization failed:', error);
    throw new Error(`Optimization failed: ${error}`);
  }
};

// Additional export for windfall calculations
export const calculateWindfallAllocation = async (userId: string, windfallAmount: number) => {
  try {
    const debts = await prisma.debt.findMany({ where: { userId, isActive: true } });
    
    const debtResponses: DebtResponse[] = debts.map(debt => ({
      ...debt,
      originalAmount: Number(debt.originalAmount),
      currentAmount: Number(debt.currentAmount),
      interestRate: Number(debt.interestRate),
      minimumPayment: Number(debt.minimumPayment),
      remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
      tenure: debt.tenure ? Number(debt.tenure) : null,
    }));

    return optimizeWithBackwardDP(debtResponses, windfallAmount);
  } catch (error) {
    throw new Error(`Windfall calculation failed: ${error}`);
  }
};