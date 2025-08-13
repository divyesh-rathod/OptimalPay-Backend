[1mdiff --git a/src/services/optimization.service.ts b/src/services/optimization.service.ts[m
[1mindex e474ec4..1965603 100644[m
[1m--- a/src/services/optimization.service.ts[m
[1m+++ b/src/services/optimization.service.ts[m
[36m@@ -1,16 +1,14 @@[m
// src/services/optimization.service.ts[m
import { PrismaClient } from '@prisma/client';[m
import { DebtResponse } from '../types/debts';[m
import { OptimizationResult, [31mStrategyWithLookahead[m[32mStrategyWithLookahead,AStarNode,CategorizedDebts[m } from '../types/optimization';
import { optimizeLowPriorityWithHybridAvalanche } from './highpriority.optimization.service';[m
import { MinHeap } from '../utils/priorityQueue';[m


const prisma = new PrismaClient();[m
[31minterface CategorizedDebts {[m
[31m  highPriority: DebtResponse[];   // Credit cards, medical, high-interest[m
[31m  lowPriority: DebtResponse[];    // Mortgage, large auto loans[m
[31m  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto[m
[31m}[m


const categorizeDebts = (debts: DebtResponse[]): CategorizedDebts => {[m
  const highPriority: DebtResponse[] = [];[m
[36m@@ -220,61 +218,93 @@[m [mconst optimizeWithBackwardDP = ([m

  // 🔥 NEW: 3-month lookahead evaluation function[m
  const evaluateStrategyWithLookahead = (currentBalances: number[], strategy: any) => {[m
  [31mlet[m[32m// 🔥 OPTIMIZATION 1: Pre-allocate arrays instead of spreading[m
[32m  const[m tempBalances = [31m[...currentBalances];[m[32mnew Array(currentBalances.length);[m
[32m  for (let i = 0; i < currentBalances.length; i++) {[m
[32m    tempBalances[i] = currentBalances[i];[m
[32m  }[m
  
  let totalInterestAccumulated = 0;
  let totalPrincipalAccumulated = 0;
  
  [32m// 🔥 OPTIMIZATION 2: Pre-calculate debt count and initial total[m
[32m  const debtCount = currentBalances.length;[m
[32m  let initialTotal = 0;[m
[32m  for (let i = 0; i < debtCount; i++) {[m
[32m    initialTotal += currentBalances[i];[m
[32m  }[m
[32m  [m
[32m  // 🔥 OPTIMIZATION 3: Pre-calculate interest rates to avoid property access[m
[32m  const interestRates = new Array(debtCount);[m
[32m  for (let i = 0; i < debtCount; i++) {[m
[32m    interestRates[i] = debts[i].interestRate / 12; // Pre-calculate monthly rate[m
[32m  }[m
[32m  [m
[32m  for (let futureMonth = 1; futureMonth <= lookaheadDepth; futureMonth++) {[m
[32m    let monthlyInterest = 0;[m
[32m    let monthlyPrincipal = 0;[m
[32m    let allDebtsCleared = true;[m
    [m
    // [31mNEW: 3-month lookahead per strategy evaluation[m[32m🔥 OPTIMIZATION 4: Replace map() with[m for [31m(let futureMonth = 1; futureMonth <= lookaheadDepth; futureMonth++) {[m
[31m      // Expensive calculation[m[32mloop (much faster)[m
    for [31meach possible move[m
[31m      let monthlyInterest[m[32m(let i[m = 0; [31mlet monthlyPrincipal[m[32mi < debtCount; i++) {[m
[32m      const balance[m = [31m0;[m[32mtempBalances[i];[m
      [m
[31m// Calculate this month's payments and their effects[m
[31m      tempBalances = tempBalances.map((balance, i) => {[m      if (balance <= 5) [31mreturn 0;[m
[31m        [m
[31m        const payment = Math.min(strategy.payments[i], balance + (balance * debts[i].interestRate / 12));[m
[31m        const interest = balance * (debts[i].interestRate / 12);[m
[31m        const principal = payment - interest;[m
[31m        const newBalance[m[32m{[m
[32m        tempBalances[i][m = [31mMath.max(0, balance - principal);[m
[31m        [m
[31m        monthlyInterest += interest;[m
[31m        monthlyPrincipal += principal;[m
[31m        [m
[31m        return discretizeBalance(newBalance);[m
[31m      });[m[32m0;[m
[32m        continue;[m
[32m      }[m
      [m
      [31mtotalInterestAccumulated += monthlyInterest;[m
[31m      totalPrincipalAccumulated += monthlyPrincipal;[m[32mallDebtsCleared = false;[m
      [m
      // [31mIf all debts paid off in lookahead, that's excellent[m
[31m      if (tempBalances.every(b => b <= 5)) {[m
[31m        return {[m
[31m          score: 1000[m[32m🔥 OPTIMIZATION 5: Replace Math.min with conditional (faster)[m
[32m      const maxPayment = balance + (balance * interestRates[i]);[m
[32m      const payment = strategy.payments[i] < maxPayment ? strategy.payments[i] : maxPayment;[m
[32m      [m
[32m      const interest = balance * interestRates[i];[m
[32m      const principal = payment[m - [31mfutureMonth,[m[32minterest;[m
      
      // [31mReward early completion[m
[31m          totalDebtReduction: totalPrincipalAccumulated,[m
[31m          interestCost: totalInterestAccumulated,[m
[31m          monthsToComplete: futureMonth,[m
[31m          balancesAfterLookahead: tempBalances[m
[31m        };[m
[31m      }[m[32m🔥 OPTIMIZATION 6: Replace Math.max with conditional[m
[32m      const newBalance = balance - principal;[m
[32m      tempBalances[i] = newBalance > 0 ? discretizeBalance(newBalance) : 0;[m
[32m      [m
[32m      monthlyInterest += interest;[m
[32m      monthlyPrincipal += principal;[m
    }[m
    [m
    [31m// Calculate final lookahead score[m
[31m    const totalDebtReduction = totalPrincipalAccumulated;[m
[31m    const interestEfficiency = totalDebtReduction / Math.max(1, totalInterestAccumulated);[m
[31m    const balanceReduction = currentBalances.reduce((a, b) => a + b, 0) - tempBalances.reduce((a, b) => a + b, 0);[m[32mtotalInterestAccumulated += monthlyInterest;[m
[32m    totalPrincipalAccumulated += monthlyPrincipal;[m
    [m
    [32m// 🔥 OPTIMIZATION 7: Early termination with pre-calculated flag[m
[32m    if (allDebtsCleared) {[m
[32m      return {[m
[32m        score: 1000 - futureMonth,[m
[32m        totalDebtReduction: totalPrincipalAccumulated,[m
[32m        interestCost: totalInterestAccumulated,[m
[32m        monthsToComplete: futureMonth,[m
[32m        balancesAfterLookahead: tempBalances[m
[32m      };[m
[32m    }[m
[32m  }[m
[32m  [m
[32m  // 🔥 OPTIMIZATION 8: Calculate final total with single loop instead of reduce[m
[32m  let finalTotal = 0;[m
[32m  for (let i = 0; i < debtCount; i++) {[m
[32m    finalTotal += tempBalances[i];[m
[32m  }[m
[32m  [m
[32m  // 🔥 OPTIMIZATION 9: Pre-calculate common values[m
[32m  const balanceReduction = initialTotal - finalTotal;[m
[32m  const interestEfficiency = totalPrincipalAccumulated / (totalInterestAccumulated || 1); // Avoid division by zero[m
  const score = (balanceReduction * 10) + (interestEfficiency * 5) + [31mtotalDebtReduction;[m[32mtotalPrincipalAccumulated;[m
  
  return {
    score,
    [31mtotalDebtReduction,[m[32mtotalDebtReduction: totalPrincipalAccumulated,[m
    interestCost: totalInterestAccumulated,
    monthsToComplete: lookaheadDepth + 1,
    balancesAfterLookahead: tempBalances[31m};[m
  };[m
[32m};[m

  const getPaymentStrategies = (balances: number[],currentAbsoluteMonth: number) => {[m
    const minimums = debts.map(d => d.minimumPayment);[m
[36m@@ -448,7 +478,9 @@[m [mconst remainingStrategies = strategies[m

return [...evaluatedStrategies, ...remainingStrategies][m
  .sort((a, b) => (b.lookaheadScore || 0) - (a.lookaheadScore || 0))[m
      .slice(0, 4);
    
      
  };[m

  // ENHANCED A* Heuristic with Cash Flow Consideration[m
[36m@@ -507,15 +539,7 @@[m [mreturn [...evaluatedStrategies, ...remainingStrategies][m
    });[m
  };[m

[31m// A* Priority Queue Node[m
[31m  interface AStarNode {[m
[31m    balances: number[];[m
[31m    months: number;[m
[31m    path: Array<{ month: number, balances: number[], payments: number[], strategy: string }>;[m
[31m    fScore: number;[m
[31m    gScore: number;[m
[31m    hScore: number;[m
[31m  }[m 

  // 🔥 ENHANCED: A* search with 3-month lookahead but deep search capability[m
 const calculateOptimalPath = ([m
[36m@@ -827,37 +851,6 @@[m [mreturn [...evaluatedStrategies, ...remainingStrategies][m
  };[m
};[m

[31mconst showCompleteStrategy = (dpResult: any) => {[m
[31m  if (!dpResult || !dpResult.projection) {[m
[31m    console.log('❌ No DP result to display');[m
[31m    return;[m
[31m  }[m

[31m  console.log('\n🔍 =============== COMPLETE DP STRATEGY ANALYSIS ===============');[m
[31m  console.log(`📊 Total Strategy Length: ${dpResult.projection.totalMonths} months`);[m
[31m  console.log(`💰 Total Interest Cost: $${dpResult.projection.totalInterestPaid}`);[m
[31m  [m
[31m  // Show every month's strategy (not just first 12)[m
[31m  if (dpResult.projection.projection) {[m
[31m    console.log('\n📅 MONTH-BY-MONTH DP DECISIONS WITH 3-MONTH LOOKAHEAD:');[m
[31m    dpResult.projection.projection.forEach((monthData: any) => {[m
[31m      const { month, strategy, totalDebtRemaining, payments } = monthData;[m
[31m      console.log(`   Month ${month.toString().padStart(2)}: ${strategy.padEnd(20)} | Debt: $${totalDebtRemaining.toString().padStart(8)} | Payments: [${payments.map((p: any) => `$${p.payment}`).join(', ')}]`);[m
[31m    });[m
[31m  }[m
[31m  [m
[31m  console.log('\n🎯 DP STRATEGY TRANSITIONS:');[m
[31m  if (dpResult.projection.projection) {[m
[31m    let lastStrategy = '';[m
[31m    dpResult.projection.projection.forEach((monthData: any) => {[m
[31m      if (monthData.strategy !== lastStrategy) {[m
[31m        console.log(`   📍 Month ${monthData.month}: Switched to "${monthData.strategy}"`);[m
[31m        lastStrategy = monthData.strategy;[m
[31m      }[m
[31m    });[m
[31m  }[m
[31m};[m

export const calculateOptimalStrategy = async (userId: string): Promise<any> => {[m
  try {[m
    console.log('\n🚀 =============== DEBT OPTIMIZATION START ===============');[m
