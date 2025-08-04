// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';

import { InternalServerError, ValidationError ,throwInternalError} from '../utils/error'

const prisma = new PrismaClient();
// Fix the import issue
import solver from 'javascript-lp-solver';

interface OptimizationResult {
  isOptimal: boolean;
  totalInterestSaved: number;
  projectedMonths: number;
  plannedPayments: Array<{
    debtId: string;
    debtName: string;
    amount: number;
    minimumPayment: number;
    extraAmount: number;
  }>;
  monthlyProjection: Array<{
    month: number;
    totalDebtRemaining: number;
    totalInterestPaid: number;
    payments: Array<{
      debtName: string;
      payment: number;
      interest: number;
      principal: number;
      newBalance: number;
    }>;
  }>;
}

const roundAmount = (amount: number): number => Math.round(amount * 100) / 100;

const calculateMonthlyInterest = (balance: number, annualRate: number): number => {
  if (balance <= 0) return 0;
  return roundAmount(balance * (annualRate / 12));
};

// Primary optimization method - Improved Efficiency Algorithm
const generateOptimalStrategy = (debts: DebtResponse[], availableBudget: number) => {
  const totalMinimums = debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
  const extraBudget = availableBudget - totalMinimums;

  console.log(`🎯 OPTIMIZATION ENGINE:`);
  console.log(`   Available Budget: $${availableBudget}`);
  console.log(`   Total Minimums: $${totalMinimums}`);
  console.log(`   Extra Budget: $${extraBudget}`);

  // Initialize with minimum payments
  const strategy = debts.map(debt => ({
    debtId: debt.id,
    debtName: debt.name,
    amount: debt.minimumPayment,
    minimumPayment: debt.minimumPayment,
    extraAmount: 0
  }));

  if (extraBudget <= 0) {
    console.log(`   ⚠️  No extra budget available - using minimums only`);
    return strategy;
  }

  // Check interest rate variance
  const rates = debts.map(d => d.interestRate);
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - avgRate, 2), 0) / rates.length;
  const hasSignificantRateVariance = variance > 0.001; // 0.1% variance threshold

  let remainingExtra = extraBudget;

  if (hasSignificantRateVariance) {
    // Use avalanche method for different rates
    console.log(`   📈 Using AVALANCHE: Significant rate variance detected`);
    const sortedByRate = debts
      .map((debt, index) => ({ debt, index, rate: debt.interestRate }))
      .sort((a, b) => b.rate - a.rate);

    for (const { debt, index } of sortedByRate) {
      if (remainingExtra <= 0) break;
      
      const maxAllocation = Math.min(remainingExtra, debt.currentAmount);
      if (maxAllocation > 0) {
        strategy[index].amount += maxAllocation;
        strategy[index].extraAmount = maxAllocation;
        remainingExtra -= maxAllocation;
        
        console.log(`   ✅ ${debt.name}: +$${maxAllocation} (${(debt.interestRate * 100).toFixed(2)}% rate)`);
      }
    }
  } else {
    // Use efficiency method for similar rates
    console.log(`   ⚖️  Using EFFICIENCY: Similar rates (avg: ${(avgRate * 100).toFixed(2)}%)`);
    
    // Calculate efficiency: balance / minimum payment ratio
    const sortedByEfficiency = debts
      .map((debt, index) => ({ 
        debt, 
        index, 
        efficiency: debt.currentAmount / debt.minimumPayment 
      }))
      .sort((a, b) => b.efficiency - a.efficiency);

    console.log(`   📊 Efficiency Rankings:`);
    sortedByEfficiency.forEach(({ debt, efficiency }) => {
      console.log(`      ${debt.name}: ${efficiency.toFixed(1)}x efficiency`);
    });

    for (const { debt, index, efficiency } of sortedByEfficiency) {
      if (remainingExtra <= 0) break;
      
      const maxAllocation = Math.min(remainingExtra, debt.currentAmount);
      if (maxAllocation > 0) {
        strategy[index].amount += maxAllocation;
        strategy[index].extraAmount = maxAllocation;
        remainingExtra -= maxAllocation;
        
        console.log(`   ✅ ${debt.name}: +$${maxAllocation} (${efficiency.toFixed(1)}x efficiency)`);
      }
    }
  }

  console.log(`   💰 Remaining Budget: $${remainingExtra}`);
  return strategy;
};

// Generate complete debt elimination projection
const generateFullProjection = (debts: DebtResponse[], monthlyStrategy: any[]) => {
  console.log(`\n📅 DEBT ELIMINATION PROJECTION:`);
  
  let balances = debts.map(debt => debt.currentAmount);
  let totalInterestPaid = 0;
  let month = 1;
  const projection = [];
  const maxMonths = 600;

  while (balances.some(b => b > 0.01) && month <= maxMonths) {
    let monthlyInterest = 0;
    let monthlyPrincipal = 0;
    const monthlyPayments: Array<{
      debtName: string;
      payment: number;
      interest: number;
      principal: number;
      newBalance: number;
    }> = [];

    // Apply payments
    balances = balances.map((balance, i) => {
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

      const payment = monthlyStrategy[i].amount;
      const interest = calculateMonthlyInterest(balance, debts[i].interestRate);
      const principal = Math.max(0, payment - interest);
      const newBalance = Math.max(0, roundAmount(balance - principal));

      monthlyInterest += interest;
      monthlyPrincipal += principal;

      monthlyPayments.push({
        debtName: debts[i].name,
        payment: payment,
        interest: roundAmount(interest),
        principal: roundAmount(principal),
        newBalance: roundAmount(newBalance)
      });

      return newBalance;
    });

    totalInterestPaid += monthlyInterest;
    const totalDebtRemaining = balances.reduce((sum, b) => sum + b, 0);

    projection.push({
      month,
      totalDebtRemaining: roundAmount(totalDebtRemaining),
      totalInterestPaid: roundAmount(totalInterestPaid),
      payments: monthlyPayments
    });

    // Log every 6 months for readability
    if (month % 6 === 0 || month <= 3) {
      console.log(`   Month ${month}: Debt $${totalDebtRemaining.toFixed(2)}, Interest $${totalInterestPaid.toFixed(2)}`);
    }

    month++;
  }

  console.log(`\n📊 PROJECTION COMPLETE:`);
  console.log(`   Total Months: ${month - 1}`);
  console.log(`   Total Interest: $${totalInterestPaid.toFixed(2)}`);
  console.log(`   Final Balance: $${balances.reduce((sum, b) => sum + b, 0).toFixed(2)}`);

  return {
    totalMonths: month - 1,
    totalInterestPaid: roundAmount(totalInterestPaid),
    projection
  };
};



// Enhanced Backward DP with Full Month-by-Month Strategy


// const optimizeWithBackwardDP = (debts: DebtResponse[], availableBudget: number) => {
//   console.log('\n⏮️ ENHANCED A* DYNAMIC PROGRAMMING:');
  
//   // IMPROVED discretization - adaptive based on balance size
//   const discretizeBalance = (balance: number): number => {
//     if (balance <= 100) return Math.max(0, Math.round(balance / 10) * 10); // $10 increments for small balances
//     if (balance <= 1000) return Math.max(0, Math.round(balance / 25) * 25); // $25 increments for medium balances
//     return Math.max(0, Math.round(balance / 50) * 50); // $50 increments for large balances
//   };
  
//   const createStateKey = (balances: number[]): string => {
//     const discretized = balances.map(discretizeBalance);
//     return discretized.join('_');
//   };

//   // A* Heuristic: Estimate remaining months to debt freedom
//   // const calculateHeuristic = (balances: number[]): number => {
//   //   const totalDebt = balances.reduce((a, b) => a + b, 0);
//   //   if (totalDebt <= 0) return 0;
    
//   //   // Weighted average interest rate based on current balances
//   //   const weightedAvgRate = debts.reduce((sum, debt, i) => {
//   //     return sum + (debt.interestRate * balances[i]);
//   //   }, 0) / totalDebt;
    
//   //   // Estimate monthly principal payment (80% of budget goes to principal on average)
//   //   const estimatedMonthlyPrincipal = availableBudget * 0.75;
//   //   const estimatedMonths = Math.ceil(totalDebt / estimatedMonthlyPrincipal);
    
//   //   // Add small penalty for number of active debts (encourages payoff)
//   //   const activeDebts = balances.filter(b => b > 10).length;
//   //   const complexityPenalty = Math.max(0, activeDebts - 1) * 0.5;
    
//   //   return estimatedMonths + complexityPenalty;
//   // };

//   // ENHANCED payment strategies - generate 5-7 different approaches
// //   const getPaymentStrategies = (balances: number[]) => {
// //     const minimums = debts.map(d => d.minimumPayment);
// //     const extraBudget = availableBudget - minimums.reduce((a, b) => a + b, 0);
    
// //     const strategies = [];
    
// //     // Strategy 1: All minimums (always include as baseline)
// //     strategies.push({ payments: [...minimums], name: 'Minimums Only' });
    
// //     if (extraBudget <= 0) return strategies;
    
// //     // Get active debts (balance > $10)
// //     const activeDebts = balances.map((balance, index) => ({ balance, index }))
// //       .filter(({ balance }) => balance > 10);
    
// //     if (activeDebts.length === 0) return strategies;
    
// //     // Strategy 2: Pure Avalanche (highest interest rate)
// // const rates = debts.map(d => d.interestRate);

// // // Calculate absolute monthly interest cost for each debt
// // const interestCosts = rates.map((rate, i) => ({
// //   index: i,
// //   rate: rate,
// //   monthlyInterest: balances[i] * (rate / 12),
// //   balance: balances[i]
// // })).filter(debt => debt.balance > 10); // Only active debts

// // if (interestCosts.length > 0) {
// //   // Sort by monthly interest cost (highest first)
// //   const maxInterestDebt = interestCosts.reduce((max, curr) =>
// //     curr.monthlyInterest > max.monthlyInterest ? curr : max
// //   );
  
// //   const avalanchePayments = [...minimums];
// //   avalanchePayments[maxInterestDebt.index] += Math.min(extraBudget, balances[maxInterestDebt.index]);
// //   strategies.push({
// //     payments: avalanchePayments,
// //     name: `Avalanche (Debt ${maxInterestDebt.index + 1} - $${maxInterestDebt.monthlyInterest.toFixed(2)}/mo interest)`
// //   });
// // }
    
// //     // Strategy 3: Pure Snowball (smallest balance)
// //     const smallestDebt = activeDebts.reduce((min, curr) =>
// //       curr.balance < min.balance ? curr : min
// //     );
// //     const snowballPayments = [...minimums];
// //     snowballPayments[smallestDebt.index] += Math.min(extraBudget, balances[smallestDebt.index]);
// //     strategies.push({ payments: snowballPayments, name: `Snowball (Debt ${smallestDebt.index + 1})` });
    
// //     // Strategy 4: Efficiency Focus (highest balance/minimum payment ratio)
// //     const efficiencies = activeDebts.map(({ balance, index }) => ({
// //       index,
// //       balance,
// //       efficiency: balance / minimums[index]
// //     })).sort((a, b) => b.efficiency - a.efficiency);
    
// //     if (efficiencies.length > 0) {
// //       const efficiencyPayments = [...minimums];
// //       efficiencyPayments[efficiencies[0].index] += Math.min(extraBudget, balances[efficiencies[0].index]);
// //       strategies.push({ payments: efficiencyPayments, name: `Efficiency (Debt ${efficiencies[0].index + 1})` });
// //     }
    
// //     // Strategy 5: Balanced Split (divide extra between top 2 highest rate debts)
// //     if (extraBudget >= 100 && activeDebts.length >= 2) {
// //       const sortedByRate = activeDebts
// //         .map(({balance, index}) => ({balance, index, rate: rates[index]}))
// //         .sort((a, b) => b.rate - a.rate);
      
// //       const balancedPayments = [...minimums];
// //       const split1 = Math.floor(extraBudget * 0.7);
// //       const split2 = extraBudget - split1;
      
// //       balancedPayments[sortedByRate[0].index] += Math.min(split1, balances[sortedByRate[0].index]);
// //       balancedPayments[sortedByRate[1].index] += Math.min(split2, balances[sortedByRate[1].index]);
// //       strategies.push({ payments: balancedPayments, name: 'Balanced 70/30 Split' });
// //     }
    
// //     // Strategy 6: Hybrid Avalanche-Snowball (60% to highest rate, 40% to smallest balance)
// //     if (extraBudget >= 50 && activeDebts.length >= 2) {
// //       const highestRateDebt = activeDebts.reduce((max, curr) =>
// //         rates[curr.index] > rates[max.index] ? curr : max
// //       );
// //       const smallestBalanceDebt = activeDebts.reduce((min, curr) =>
// //         curr.balance < min.balance ? curr : min
// //       );
      
// //       if (highestRateDebt.index !== smallestBalanceDebt.index) {
// //         const hybridPayments = [...minimums];
// //         const toHighRate = Math.floor(extraBudget * 0.6);
// //         const toSmallBal = extraBudget - toHighRate;
        
// //         hybridPayments[highestRateDebt.index] += Math.min(toHighRate, balances[highestRateDebt.index]);
// //         hybridPayments[smallestBalanceDebt.index] += Math.min(toSmallBal, balances[smallestBalanceDebt.index]);
// //         strategies.push({ payments: hybridPayments, name: 'Hybrid Avalanche-Snowball' });
// //       }
// //     }
    
// //     // Strategy 7: Quick Win (if any debt can be paid off this month)
// //     for (const {balance, index} of activeDebts) {
// //       if (balance <= extraBudget && balance <= 2000) { // Quick win for debts under $2000
// //         const quickWinPayments = [...minimums];
// //         quickWinPayments[index] = minimums[index] + balance;
// //         strategies.push({ payments: quickWinPayments, name: `Quick Payoff (Debt ${index + 1})` });
// //         break; // Only one quick win strategy
// //       }
// //     }
    
// //     return strategies;
// //     };


//   const getPaymentStrategies = (balances: number[]) => {
//   const minimums = debts.map(d => d.minimumPayment);
//   const extraBudget = availableBudget - minimums.reduce((a, b) => a + b, 0);
  
//   const strategies = [];
  
//   // Strategy 1: All minimums (baseline)
//   strategies.push({ payments: [...minimums], name: 'Minimums Only' });
  
//   if (extraBudget <= 0) return strategies;
  
//   // Get active debts with enhanced analysis
//   const activeDebts = balances.map((balance, index) => {
//     const monthlyInterest = balance * (debts[index].interestRate / 12);
//     const maxPayment = Math.min(extraBudget + minimums[index], balance + monthlyInterest);
//     const monthsToPayoff = balance / (maxPayment - monthlyInterest);
    
//     return {
//       balance,
//       index,
//       efficiency: balance / minimums[index],
//       monthlyInterest: monthlyInterest,
//       minimumPayment: minimums[index],
//       monthsToPayoff: monthsToPayoff,
//       cashFlowValue: minimums[index], // What gets freed up when paid off
//       canPayoffSoon: monthsToPayoff <= 3 && balance <= extraBudget * 3
//     };
//   }).filter(({ balance }) => balance > 10);
  
//   if (activeDebts.length === 0) return strategies;

//   // =================== CASH FLOW LIBERATION STRATEGIES ===================
  
//   // Strategy 2: IMMEDIATE PAYOFF (highest priority)
//   // If any debt can be paid off THIS MONTH, do it!
//   const immediatePayoffs = activeDebts.filter(debt =>
//     debt.balance <= extraBudget && debt.balance > 0
//   );
  
//   for (const debt of immediatePayoffs) {
//     const liberationPayments = [...minimums];
//     liberationPayments[debt.index] = debt.balance + debt.monthlyInterest; // Pay it off completely
//     strategies.push({
//       payments: liberationPayments,
//       name: `🚀 IMMEDIATE LIBERATION (Debt ${debt.index + 1}) - Frees $${debt.cashFlowValue}/mo`,
//       priority: 100 // HIGHEST PRIORITY
//     });
//   }
  
//   // Strategy 3: RAPID LIBERATION (2-3 month payoffs)
//   const rapidPayoffs = activeDebts.filter(debt =>
//     debt.monthsToPayoff <= 3 &&
//     debt.balance <= extraBudget * 2.5 &&
//     !immediatePayoffs.includes(debt)
//   ).sort((a, b) => b.cashFlowValue - a.cashFlowValue); // Sort by cash flow value
  
//   for (const debt of rapidPayoffs.slice(0, 2)) { // Top 2 rapid payoffs
//     const rapidPayments = [...minimums];
//     rapidPayments[debt.index] += Math.min(extraBudget, debt.balance);
//     strategies.push({
//       payments: rapidPayments,
//       name: `⚡ RAPID LIBERATION (Debt ${debt.index + 1}) - ${debt.monthsToPayoff.toFixed(1)} months to freedom`,
//       priority: 90
//     });
//   }

//   // =================== ENHANCED TRADITIONAL STRATEGIES ===================
  
//   // Strategy 4: Smart Avalanche (by absolute interest cost)
//   const maxInterestDebt = activeDebts.reduce((max, curr) =>
//     curr.monthlyInterest > max.monthlyInterest ? curr : max
//   );
  
//   const avalanchePayments = [...minimums];
//   avalanchePayments[maxInterestDebt.index] += Math.min(extraBudget, balances[maxInterestDebt.index]);
//   strategies.push({
//     payments: avalanchePayments,
//     name: `Avalanche (Debt ${maxInterestDebt.index + 1} - $${maxInterestDebt.monthlyInterest.toFixed(2)}/mo interest)`,
//     priority: 80
//   });
  
//   // Strategy 5: Efficiency Focus (balance/minimum ratio)
//   const maxEfficiencyDebt = activeDebts.reduce((max, curr) =>
//     curr.efficiency > max.efficiency ? curr : max
//   );
  
//   const efficiencyPayments = [...minimums];
//   efficiencyPayments[maxEfficiencyDebt.index] += Math.min(extraBudget, balances[maxEfficiencyDebt.index]);
//   strategies.push({
//     payments: efficiencyPayments,
//     name: `Efficiency (Debt ${maxEfficiencyDebt.index + 1} - ${maxEfficiencyDebt.efficiency.toFixed(1)}x)`,
//     priority: 75
//   });
  
//   // Strategy 6: Cash Flow Weighted (combines cash flow value + interest cost)
//   const cashFlowWeighted = activeDebts.map(debt => ({
//     ...debt,
//     cashFlowScore: (debt.cashFlowValue * 12) + debt.monthlyInterest // Annual cash flow value + monthly interest
//   })).reduce((max, curr) =>
//     curr.cashFlowScore > max.cashFlowScore ? curr : max
//   );
  
//   const cashFlowPayments = [...minimums];
//   cashFlowPayments[cashFlowWeighted.index] += Math.min(extraBudget, balances[cashFlowWeighted.index]);
//   strategies.push({
//     payments: cashFlowPayments,
//     name: `Cash Flow Weighted (Debt ${cashFlowWeighted.index + 1} - $${cashFlowWeighted.cashFlowScore.toFixed(0)} score)`,
//     priority: 70
//   });

//   // Strategy 7: Balanced High-Impact (split between top 2 by combined metrics)
//   if (extraBudget >= 100 && activeDebts.length >= 2) {
//     const combinedScored = activeDebts.map(debt => ({
//       ...debt,
//       combinedScore: debt.monthlyInterest + (debt.cashFlowValue * 3) + (debt.efficiency / 10)
//     })).sort((a, b) => b.combinedScore - a.combinedScore);
    
//     const balancedPayments = [...minimums];
//     const split1 = Math.floor(extraBudget * 0.65);
//     const split2 = extraBudget - split1;
    
//     balancedPayments[combinedScored[0].index] += Math.min(split1, balances[combinedScored[0].index]);
//     balancedPayments[combinedScored[1].index] += Math.min(split2, balances[combinedScored[1].index]);
//     strategies.push({
//       payments: balancedPayments,
//       name: 'Balanced High-Impact 65/35',
//       priority: 60
//     });
//   }

//   // Strategy 8: Progressive Snowball (smallest debt, but only if reasonable cash flow)
//   const smallestWithGoodCashFlow = activeDebts
//     .filter(debt => debt.cashFlowValue >= 50) // Only debts with decent cash flow liberation
//     .reduce((min, curr) => curr.balance < min.balance ? curr : min, activeDebts[0]);
  
//   if (smallestWithGoodCashFlow) {
//     const progressivePayments = [...minimums];
//     progressivePayments[smallestWithGoodCashFlow.index] += Math.min(extraBudget, balances[smallestWithGoodCashFlow.index]);
//     strategies.push({
//       payments: progressivePayments,
//       name: `Progressive Snowball (Debt ${smallestWithGoodCashFlow.index + 1}) - Frees $${smallestWithGoodCashFlow.cashFlowValue}/mo`,
//       priority: 50
//     });
//   }
  
//   // Sort by priority and return top strategies
//   return strategies
//     .filter(s => s.priority || 0) // Only prioritized strategies
//     .sort((a, b) => (b.priority || 0) - (a.priority || 0))
//     .slice(0, 6); // Top 6 strategies to avoid noise
// };

// // ENHANCED A* Heuristic with Cash Flow Consideration
// const calculateHeuristic = (balances: number[]): number => {
//   const totalDebt = balances.reduce((a, b) => a + b, 0);
//   if (totalDebt <= 0) return 0;
  
//   // Calculate current budget
//   let currentBudget = availableBudget;
  
//   // Factor in potential freed cash flow from debts close to payoff
//   let projectedFreedCashFlow = 0;
//   balances.forEach((balance, i) => {
//     if (balance > 0 && balance <= currentBudget * 3) { // Payable within 3 months
//       const monthlyInterest = balance * (debts[i].interestRate / 12);
//       const monthsToPayoff = balance / (currentBudget - monthlyInterest);
//       if (monthsToPayoff <= 3) {
//         projectedFreedCashFlow += debts[i].minimumPayment;
//       }
//     }
//   });
  
//   // Enhanced budget calculation
//   const enhancedBudget = currentBudget + (projectedFreedCashFlow * 0.5); // 50% weight to projected freed cash
  
//   // Weighted average interest rate
//   const weightedAvgRate = debts.reduce((sum, debt, i) => {
//     return sum + (debt.interestRate * balances[i]);
//   }, 0) / totalDebt;
  
//   // Estimate monthly principal payment
//   const estimatedMonthlyPrincipal = enhancedBudget * 0.75;
//   const estimatedMonths = Math.ceil(totalDebt / estimatedMonthlyPrincipal);
  
//   // Cash flow complexity penalty
//   const activeDemandingDebts = balances.filter((b, i) => b > 0 && debts[i].minimumPayment > 100).length;
//   const complexityPenalty = Math.max(0, activeDemandingDebts - 1) * 0.3;
  
//   // Liberation bonus (reward for having debts close to payoff)
//   const liberationBonus = projectedFreedCashFlow > 100 ? -1 : 0;
  
//   return estimatedMonths + complexityPenalty + liberationBonus;
// };



//   // Calculate next month's balances with better precision
//   const calculateNewBalances = (currentBalances: number[], payments: number[]): number[] => {
//     return currentBalances.map((balance, i) => {
//       if (balance <= 5) return 0; // Lower threshold for completion
      
//       const payment = Math.min(payments[i], balance + (balance * debts[i].interestRate / 12)); // Can't pay more than balance + interest
//       const monthlyInterest = balance * (debts[i].interestRate / 12);
//       const principal = Math.max(0, payment - monthlyInterest);
//       const newBalance = Math.max(0, balance - principal);
      
//       return discretizeBalance(newBalance);
//     });
//   };

//   // A* Priority Queue Node
//   interface AStarNode {
//     balances: number[];
//     months: number;
//     path: Array<{ month: number, balances: number[], payments: number[], strategy: string }>;
//     fScore: number; // g + h (actual cost + heuristic)
//     gScore: number; // actual months so far
//     hScore: number; // heuristic estimate
//   }

//   // Enhanced A* search algorithm
//   const calculateOptimalPath = (initialBalances: number[]): {
//     months: number,
//     path: Array<{ month: number, balances: number[], payments: number[], strategy: string }>
//   } => {
//     // Priority queue for A* (sorted by fScore)
//     const openSet: AStarNode[] = [];
//     const closedSet = new Set<string>();
//     const gScores = new Map<string, number>(); // Best known cost to reach each state
    
//     const startKey = createStateKey(initialBalances);
//     const initialHeuristic = calculateHeuristic(initialBalances);
    
//     const startNode: AStarNode = {
//       balances: initialBalances,
//       months: 0,
//       gScore: 0,
//       hScore: initialHeuristic,
//       fScore: initialHeuristic,
//       path: [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }]
//     };
    
//     openSet.push(startNode);
//     gScores.set(startKey, 0);
    
//     let iterations = 0;
//     const MAX_ITERATIONS = 75000; // Balanced for performance vs quality
//     const MAX_MONTHS = 100;
//     let bestSolutionFound: any = null;
    
//     console.log(`🔍 A* Search Starting: Initial state [${initialBalances.map(b => `$${b}`).join(', ')}]`);
//     console.log(`🎯 Initial heuristic estimate: ${initialHeuristic} months`);
    
//     while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
//       iterations++;
      
//       // Get node with lowest fScore (A* priority)
//       openSet.sort((a, b) => a.fScore - b.fScore);
//       const current = openSet.shift()!;
//       const currentKey = createStateKey(current.balances);
      
//       // Move to closed set
//       closedSet.add(currentKey);
      
//       // Base case: all debts paid off
//       if (current.balances.every(b => b <= 5)) {
//         console.log(`✅ A* Found optimal solution in ${current.months} months after ${iterations} iterations`);
//         return { months: current.months, path: current.path };
//       }
      
//       // Track best partial solution
//       const totalDebt = current.balances.reduce((a, b) => a + b, 0);
//       if (!bestSolutionFound || totalDebt < bestSolutionFound.totalDebt ||
//           (totalDebt === bestSolutionFound.totalDebt && current.months < bestSolutionFound.months)) {
//         bestSolutionFound = { months: current.months, path: current.path, totalDebt };
//       }
      
//       // Don't explore beyond reasonable timeframe
//       if (current.months >= MAX_MONTHS) continue;
      
//       // Explore all possible strategies
//       const strategies = getPaymentStrategies(current.balances);
      
//       for (const { payments, name } of strategies) {
//         const newBalances = calculateNewBalances(current.balances, payments);
//         const newKey = createStateKey(newBalances);
        
//         // Skip if no progress made
//         const oldTotal = current.balances.reduce((a, b) => a + b, 0);
//         const newTotal = newBalances.reduce((a, b) => a + b, 0);
//         if (newTotal >= oldTotal) continue;
        
//         // Skip if already in closed set
//         if (closedSet.has(newKey)) continue;
        
//         const tentativeGScore = current.gScore + 1;
        
//         // Skip if we've found a better path to this state
//         const knownGScore = gScores.get(newKey);
//         if (knownGScore !== undefined && tentativeGScore >= knownGScore) continue;
        
//         // This is the best path to this state so far
//         gScores.set(newKey, tentativeGScore);
        
//         const hScore = calculateHeuristic(newBalances);
//         const fScore = tentativeGScore + hScore;
        
//         const newPath = [...current.path, {
//           month: current.months + 1,
//           balances: newBalances,
//           payments,
//           strategy: name
//         }];
        
//         // Add to open set
//         const neighborNode: AStarNode = {
//           balances: newBalances,
//           months: current.months + 1,
//           gScore: tentativeGScore,
//           hScore: hScore,
//           fScore: fScore,
//           path: newPath
//         };
        
//         openSet.push(neighborNode);
//       }
      
//       // Progress logging
//       if (iterations % 15000 === 0) {
//         const currentDebt = current.balances.reduce((a, b) => a + b, 0);
//         console.log(`   🔍 A* Iteration ${iterations}, Queue: ${openSet.length}, Month: ${current.months}, Debt: $${currentDebt}, F: ${current.fScore.toFixed(1)}`);
//       }
//     }
    
//     console.log(`⚠️  A* reached ${iterations} iterations`);
    
//     // Return best solution found
//     if (bestSolutionFound && bestSolutionFound.path.length > 1) {
//       console.log(`📊 Using best solution found: ${bestSolutionFound.months} months, $${bestSolutionFound.totalDebt.toFixed(2)} remaining debt`);
//       return bestSolutionFound;
//     }
    
//     // Fallback strategy
//     console.log(`🔄 Using fallback avalanche strategy`);
//     const fallbackPath = [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }];
//     let currentBalances = [...initialBalances];
    
//     for (let month = 1; month <= Math.min(60, MAX_MONTHS); month++) {
//       const strategies = getPaymentStrategies(currentBalances);
//       const avalancheStrategy = strategies.find(s => s.name.includes('Avalanche')) || strategies[0];
      
//       fallbackPath.push({
//         month,
//         balances: [...currentBalances],
//         payments: avalancheStrategy.payments,
//         strategy: avalancheStrategy.name
//       });
      
//       currentBalances = calculateNewBalances(currentBalances, avalancheStrategy.payments);
      
//       if (currentBalances.every(b => b <= 5)) {
//         console.log(`✅ Fallback strategy completes in ${month} months`);
//         break;
//       }
//     }
    
//     return { months: fallbackPath.length - 1, path: fallbackPath };
//   };

//   // Generate detailed projection using actual balances
//   const generateDPProjection = (path: any[]) => {
//     if (path.length <= 1) {
//       console.log(`❌ Path too short, using fallback`);
//       return null;
//     }
    
//     console.log(`\n📊 A* DETAILED MONTH-BY-MONTH PROJECTION:`);
    
//     let actualBalances = debts.map(debt => debt.currentAmount);
//     let totalInterestPaid = 0;
//     const projection = [];
    
//     for (let month = 1; month < Math.min(path.length, 121); month++) {
//       const { payments, strategy } = path[month];
      
//       let monthlyInterest = 0;
//       const monthlyPayments: Array<{
//         debtName: string;
//         payment: number;
//         interest: number;
//         principal: number;
//         newBalance: number;
//       }> = [];

//       actualBalances = actualBalances.map((balance, i) => {
//         if (balance <= 0.01) {
//           monthlyPayments.push({
//             debtName: debts[i].name,
//             payment: 0,
//             interest: 0,
//             principal: 0,
//             newBalance: 0
//           });
//           return 0;
//         }

//         const payment = payments[i];
//         const interest = balance * (debts[i].interestRate / 12);
//         const principal = Math.max(0, payment - interest);
//         const newBalance = Math.max(0, balance - principal);

//         monthlyInterest += interest;

//         monthlyPayments.push({
//           debtName: debts[i].name,
//           payment: payment,
//           interest: Math.round(interest * 100) / 100,
//           principal: Math.round(principal * 100) / 100,
//           newBalance: Math.round(newBalance * 100) / 100
//         });

//         return newBalance;
//       });

//       totalInterestPaid += monthlyInterest;
//       const totalDebtRemaining = actualBalances.reduce((sum, b) => sum + b, 0);

//       projection.push({
//         month,
//         strategy,
//         totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
//         totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
//         payments: monthlyPayments
//       });

//       // Enhanced logging
//       if (month % 6 === 0 || month <= 3 || totalDebtRemaining <= 1000) {
//         console.log(`   Month ${month.toString().padStart(2)} (${strategy}): Debt $${totalDebtRemaining.toFixed(2)}, Interest $${totalInterestPaid.toFixed(2)}`);
//       }

//       if (totalDebtRemaining <= 1) {
//         console.log(`🎉 A* Strategy: All debts eliminated in ${month} months!`);
//         break;
//       }
//     }

//     return {
//       totalMonths: projection.length,
//       totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
//       projection
//     };
//   };

//   // Main execution
//   const initialBalances = debts.map(debt => debt.currentAmount);
//   const discretizedInitial = initialBalances.map(discretizeBalance);
  
//   console.log(`🎯 A* Starting balances: [${discretizedInitial.map(b => `$${b}`).join(', ')}]`);
//   console.log(`💰 Available budget: $${availableBudget}, Extra budget: $${availableBudget - debts.reduce((sum, d) => sum + d.minimumPayment, 0)}`);
  
//   const optimalResult = calculateOptimalPath(discretizedInitial);
  
//   console.log(`\n📅 A* COMPLETE STRATEGY (${optimalResult.path.length - 1} months):`);
  
//   // Show strategy summary
//   const pathToShow = optimalResult.path.slice(1, Math.min(13, optimalResult.path.length));
//   if (pathToShow.length > 0) {
//     pathToShow.forEach(({ month, balances, payments, strategy }) => {
//       const totalDebt = balances.reduce((a, b) => a + b, 0);
//       console.log(`   Month ${month.toString().padStart(2)}: ${strategy.padEnd(25)} | Payments=[${payments.map(p => `$${p}`).join(', ')}] | Debt=$${totalDebt}`);
//     });
    
//     if (optimalResult.path.length > 13) {
//       console.log(`   ... (showing first 12 months of ${optimalResult.path.length-1} total months)`);
//     }
//   }

//   const dpProjection = generateDPProjection(optimalResult.path);
  
//   console.log(`\n📊 A* FINAL SUMMARY:`);
//   if (dpProjection) {
//     console.log(`   🎯 Total Months: ${dpProjection.totalMonths}`);
//     console.log(`   💰 Total Interest: $${dpProjection.totalInterestPaid}`);
//     console.log(`   🚀 Strategy Efficiency: ${dpProjection.projection ? dpProjection.projection.length : 'N/A'} payment periods`);
//   } else {
//     console.log(`   ❌ Could not generate projection`);
//   }
  
//   const firstMonthPayments = optimalResult.path.length > 1 ? optimalResult.path[1].payments : debts.map(d => d.minimumPayment);
  
//   return {
//     months: optimalResult.months,
//     payments: firstMonthPayments,
//     projection: dpProjection,
//     fullStrategy: optimalResult.path
//   };
// };

// Enhanced Multi-Objective Debt Optimization Algorithm
// Improvements: Timeline-Aware, Multi-Step Lookahead, Parallel Path Exploration, Multi-Objective

const optimizeWithEnhancedDP = (debts:DebtResponse[], availableBudget: number, optimizationGoal = 'balanced') => {
  console.log('\n⏮️ ENHANCED MULTI-OBJECTIVE A* OPTIMIZATION:');
  
  // =================== MULTI-OBJECTIVE WEIGHTS ===================
  const getObjectiveWeights = (goal:any) => {
    const weights = {
      'fastest_payoff': { α: 0.8, β: 0.1, γ: 0.1 },      // Minimize months
      'min_interest': { α: 0.1, β: 0.8, γ: 0.1 },        // Minimize interest  
      'cash_flow': { α: 0.2, β: 0.2, γ: 0.6 },           // Maximize cash flow acceleration
      'balanced': { α: 0.4, β: 0.4, γ: 0.2 },            // Balanced approach
      'conservative': { α: 0.3, β: 0.5, γ: 0.2 }         // Interest-focused
    };
    return weights[goal] || weights['balanced'];
  };

  const objectiveWeights = getObjectiveWeights(optimizationGoal);
  console.log(`🎯 Optimization Goal: ${optimizationGoal} | Weights: α=${objectiveWeights.α} β=${objectiveWeights.β} γ=${objectiveWeights.γ}`);

  // =================== ENHANCED DISCRETIZATION ===================
  const discretizeBalance = (balance) => {
    if (balance <= 100) return Math.max(0, Math.round(balance / 10) * 10);
    if (balance <= 1000) return Math.max(0, Math.round(balance / 25) * 25);
    return Math.max(0, Math.round(balance / 50) * 50);
  };
  
  const createStateKey = (balances) => {
    return balances.map(discretizeBalance).join('_');
  };

  // =================== MULTI-STEP LOOKAHEAD STRATEGIES ===================
  const getPaymentStrategiesWithLookahead = (balances, lookaheadDepth = 2) => {
    const minimums = debts.map(d => d.minimumPayment);
    const extraBudget = availableBudget - minimums.reduce((a, b) => a + b, 0);
    
    const strategies = [];
    strategies.push({ payments: [...minimums], name: 'Minimums Only', score: 0 });
    
    if (extraBudget <= 0) return strategies;
    
    // Enhanced debt analysis with lookahead
    const activeDebts = balances.map((balance, index) => {
      if (balance <= 10) return null;
      
      const monthlyInterest = balance * (debts[index].interestRate / 12);
      const maxPayment = Math.min(extraBudget + minimums[index], balance + monthlyInterest);
      const monthsToPayoff = balance / (maxPayment - monthlyInterest);
      
      // LOOKAHEAD: Calculate compound cash flow effect over next 2-3 months
      let projectedCashFlowValue = 0;
      let currentBalance = balance;
      let availableBudgetFuture = availableBudget;
      
      for (let futureMonth = 1; futureMonth <= lookaheadDepth; futureMonth++) {
        const futureInterest = currentBalance * (debts[index].interestRate / 12);
        const maxFuturePayment = Math.min(availableBudgetFuture, currentBalance + futureInterest);
        
        if (maxFuturePayment >= currentBalance + futureInterest) {
          // Debt gets paid off in this future month
          projectedCashFlowValue += minimums[index] * (lookaheadDepth - futureMonth + 1);
          break;
        } else {
          const futurePrincipal = maxFuturePayment - futureInterest;
          currentBalance = Math.max(0, currentBalance - futurePrincipal);
        }
      }
      
      return { 
        balance, 
        index,
        efficiency: balance / minimums[index],
        monthlyInterest: monthlyInterest,
        minimumPayment: minimums[index],
        monthsToPayoff: monthsToPayoff,
        cashFlowValue: minimums[index],
        projectedCashFlowValue: projectedCashFlowValue, // NEW: Lookahead value
        canPayoffSoon: monthsToPayoff <= 3 && balance <= extraBudget * 3,
        lookaheadScore: projectedCashFlowValue + (monthlyInterest * lookaheadDepth) // Combined future value
      };
    }).filter(debt => debt !== null);
    
    if (activeDebts.length === 0) return strategies;

    // =================== ENHANCED LIBERATION STRATEGIES ===================
    
    // Strategy 1: IMMEDIATE PAYOFF with lookahead consideration
    const immediatePayoffs = activeDebts.filter(debt => 
      debt.balance <= extraBudget && debt.balance > 0
    ).sort((a, b) => b.projectedCashFlowValue - a.projectedCashFlowValue); // Sort by future value
    
    for (const debt of immediatePayoffs.slice(0, 2)) { // Top 2 immediate payoffs
      const liberationPayments = [...minimums];
      liberationPayments[debt.index] = debt.balance + debt.monthlyInterest;
      strategies.push({ 
        payments: liberationPayments, 
        name: `🚀 IMMEDIATE LIBERATION (Debt ${debt.index + 1}) - Future Value $${debt.projectedCashFlowValue.toFixed(0)}`,
        priority: 100,
        score: debt.projectedCashFlowValue * 2 // High score for immediate payoffs
      });
    }
    
    // Strategy 2: RAPID LIBERATION with enhanced lookahead scoring
    const rapidPayoffs = activeDebts.filter(debt => 
      debt.monthsToPayoff <= 3 && 
      debt.balance <= extraBudget * 2.5 &&
      !immediatePayoffs.includes(debt)
    ).sort((a, b) => b.lookaheadScore - a.lookaheadScore); // Sort by lookahead score
    
    for (const debt of rapidPayoffs.slice(0, 2)) {
      const rapidPayments = [...minimums];
      rapidPayments[debt.index] += Math.min(extraBudget, debt.balance);
      strategies.push({ 
        payments: rapidPayments, 
        name: `⚡ RAPID LIBERATION (Debt ${debt.index + 1}) - ${debt.monthsToPayoff.toFixed(1)}mo | Future: $${debt.projectedCashFlowValue.toFixed(0)}`,
        priority: 90,
        score: debt.lookaheadScore
      });
    }

    // Strategy 3: COMPOUND CASH FLOW (best lookahead score)
    const bestLookaheadDebt = activeDebts.reduce((max, curr) => 
      curr.lookaheadScore > max.lookaheadScore ? curr : max
    );
    
    const compoundPayments = [...minimums];
    compoundPayments[bestLookaheadDebt.index] += Math.min(extraBudget, balances[bestLookaheadDebt.index]);
    strategies.push({ 
      payments: compoundPayments, 
      name: `💰 COMPOUND CASH FLOW (Debt ${bestLookaheadDebt.index + 1}) - Score: ${bestLookaheadDebt.lookaheadScore.toFixed(0)}`,
      priority: 85,
      score: bestLookaheadDebt.lookaheadScore
    });

    // Strategy 4: Smart Avalanche (by absolute interest cost)
    const maxInterestDebt = activeDebts.reduce((max, curr) => 
      curr.monthlyInterest > max.monthlyInterest ? curr : max
    );
    
    const avalanchePayments = [...minimums];
    avalanchePayments[maxInterestDebt.index] += Math.min(extraBudget, balances[maxInterestDebt.index]);
    strategies.push({ 
      payments: avalanchePayments, 
      name: `Avalanche (Debt ${maxInterestDebt.index + 1} - $${maxInterestDebt.monthlyInterest.toFixed(2)}/mo interest)`,
      priority: 80,
      score: maxInterestDebt.monthlyInterest * 12 // Annual interest savings
    });
    
    // Strategy 5: Cash Flow Weighted with Lookahead
    const cashFlowWeighted = activeDebts.map(debt => ({
      ...debt,
      enhancedCashFlowScore: (debt.projectedCashFlowValue * 2) + debt.monthlyInterest + (debt.cashFlowValue * 6)
    })).reduce((max, curr) => 
      curr.enhancedCashFlowScore > max.enhancedCashFlowScore ? curr : max
    );
    
    const cashFlowPayments = [...minimums];
    cashFlowPayments[cashFlowWeighted.index] += Math.min(extraBudget, balances[cashFlowWeighted.index]);
    strategies.push({ 
      payments: cashFlowPayments, 
      name: `Cash Flow Weighted (Debt ${cashFlowWeighted.index + 1} - Enhanced Score: ${cashFlowWeighted.enhancedCashFlowScore.toFixed(0)})`,
      priority: 70,
      score: cashFlowWeighted.enhancedCashFlowScore
    });

    // Strategy 6: Balanced High-Impact with Lookahead
    if (extraBudget >= 100 && activeDebts.length >= 2) {
      const combinedScored = activeDebts.map(debt => ({
        ...debt,
        multiObjectiveScore: debt.monthlyInterest + (debt.projectedCashFlowValue * 0.5) + (debt.efficiency / 10)
      })).sort((a, b) => b.multiObjectiveScore - a.multiObjectiveScore);
      
      const balancedPayments = [...minimums];
      const split1 = Math.floor(extraBudget * 0.65);
      const split2 = extraBudget - split1;
      
      balancedPayments[combinedScored[0].index] += Math.min(split1, balances[combinedScored[0].index]);
      balancedPayments[combinedScored[1].index] += Math.min(split2, balances[combinedScored[1].index]);
      strategies.push({ 
        payments: balancedPayments, 
        name: 'Balanced High-Impact 65/35 + Lookahead',
        priority: 60,
        score: combinedScored[0].multiObjectiveScore + combinedScored[1].multiObjectiveScore
      });
    }
    
    // Return strategies sorted by enhanced scoring
    return strategies
      .filter(s => s.priority || 0)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 8); // More strategies for better exploration
  };

  // =================== ENHANCED HEURISTIC WITH LOOKAHEAD ===================
  const calculateHeuristicWithLookahead = (balances, monthsAhead = 3) => {
    const totalDebt = balances.reduce((a, b) => a + b, 0);
    if (totalDebt <= 0) return 0;
    
    let currentBudget = availableBudget;
    let projectedFreedCashFlow = 0;
    let simulatedBalances = [...balances];
    
    // MULTI-STEP LOOKAHEAD: Simulate next 3 months to predict cash flow liberation
    for (let futureMonth = 1; futureMonth <= monthsAhead; futureMonth++) {
      simulatedBalances.forEach((balance, i) => {
        if (balance > 0 && balance <= currentBudget * futureMonth) {
          const monthlyInterest = balance * (debts[i].interestRate / 12);
          const monthsToPayoff = balance / (currentBudget - monthlyInterest);
          if (monthsToPayoff <= futureMonth) {
            projectedFreedCashFlow += debts[i].minimumPayment;
            simulatedBalances[i] = 0; // Mark as paid off in simulation
          }
        }
      });
      
      // Update budget for next simulation month
      currentBudget += projectedFreedCashFlow;
    }
    
    // Enhanced budget calculation with compound effect
    const enhancedBudget = currentBudget + (projectedFreedCashFlow * 0.7); // Increased weight for lookahead
    
    // Multi-objective heuristic calculation
    const weightedAvgRate = debts.reduce((sum, debt, i) => {
      return sum + (debt.interestRate * balances[i]);
    }, 0) / totalDebt;
    
    const estimatedMonthlyPrincipal = enhancedBudget * 0.8; // Higher efficiency with lookahead
    const estimatedMonths = Math.ceil(totalDebt / estimatedMonthlyPrincipal);
    
    // Enhanced penalties and bonuses
    const activeDemandingDebts = balances.filter((b, i) => b > 0 && debts[i].minimumPayment > 100).length;
    const complexityPenalty = Math.max(0, activeDemandingDebts - 1) * 0.2; // Reduced penalty
    
    // Lookahead liberation bonus (stronger reward for detected cash flow acceleration)
    const liberationBonus = projectedFreedCashFlow > 200 ? -2 : (projectedFreedCashFlow > 100 ? -1 : 0);
    
    // Cash flow acceleration factor
    const cashFlowAcceleration = projectedFreedCashFlow / Math.max(availableBudget, 100);
    
    return estimatedMonths + complexityPenalty + liberationBonus - (cashFlowAcceleration * 0.5);
  };

  // =================== MULTI-OBJECTIVE SCORING FUNCTION ===================
  const calculateMultiObjectiveScore = (months, totalInterest, cashFlowAcceleration) => {
    const { α, β, γ } = objectiveWeights;
    
    // Normalize metrics (scale to 0-1 range)
    const normalizedMonths = Math.min(months / 60, 1); // Max 60 months
    const normalizedInterest = Math.min(totalInterest / 50000, 1); // Max $50k interest
    const normalizedCashFlowDelay = Math.max(0, 1 - cashFlowAcceleration); // Higher acceleration = lower penalty
    
    // Lower score is better
    return α * normalizedMonths + β * normalizedInterest + γ * normalizedCashFlowDelay;
  };

  // =================== PARALLEL PATH EXPLORATION ===================
  const maintainTopPaths = (paths, maxPaths = 5) => {
    return paths
      .sort((a, b) => a.multiObjectiveScore - b.multiObjectiveScore) // Lower score = better
      .slice(0, maxPaths);
  };

  // =================== ENHANCED PAYMENT STRATEGIES ===================
  const getPaymentStrategies = (balances) => {
    return getPaymentStrategiesWithLookahead(balances, 3); // Use 3-month lookahead
  };

  // =================== ENHANCED HEURISTIC ===================
  const calculateHeuristic = (balances) => {
    return calculateHeuristicWithLookahead(balances, 3); // Use 3-month lookahead
  };

  // =================== ENHANCED BALANCE CALCULATION ===================
  const calculateNewBalances = (currentBalances, payments) => {
    return currentBalances.map((balance, i) => {
      if (balance <= 5) return 0;
      
      const payment = Math.min(payments[i], balance + (balance * debts[i].interestRate / 12));
      const monthlyInterest = balance * (debts[i].interestRate / 12);
      const principal = Math.max(0, payment - monthlyInterest);
      const newBalance = Math.max(0, balance - principal);
      
      return discretizeBalance(newBalance);
    });
  };

  // =================== PARALLEL A* WITH MULTIPLE OBJECTIVES ===================
  const calculateOptimalPathWithParallelExploration = (initialBalances) => {
    // Enhanced node structure for parallel exploration
    interface EnhancedAStarNode {
      balances: number[];
      months: number;
      totalInterest: number;
      cashFlowAcceleration: number;
      path: Array<{ month: number, balances: number[], payments: number[], strategy: string, interest: number }>;
      fScore: number;
      gScore: number;
      hScore: number;
      multiObjectiveScore: number;
    }

    const openSet = [];
    const closedSet = new Set();
    const gScores = new Map();
    
    // Track multiple best paths simultaneously
    let topPaths = [];
    
    const startKey = createStateKey(initialBalances);
    const initialHeuristic = calculateHeuristic(initialBalances);
    
    const startNode = { 
      balances: initialBalances, 
      months: 0,
      totalInterest: 0,
      cashFlowAcceleration: 0,
      gScore: 0,
      hScore: initialHeuristic,
      fScore: initialHeuristic,
      multiObjectiveScore: calculateMultiObjectiveScore(0, 0, 0),
      path: [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial', interest: 0 }] 
    };
    
    openSet.push(startNode);
    gScores.set(startKey, 0);
    
    let iterations = 0;
    const MAX_ITERATIONS = 50000; // Increased for better exploration
    const MAX_MONTHS = 80;
    
    console.log(`🔍 Enhanced A* Search Starting: [${initialBalances.map(b => `$${b}`).join(', ')}]`);
    console.log(`🎯 Initial heuristic: ${initialHeuristic} months | Multi-objective mode: ${optimizationGoal}`);
    
    while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      
      // Sort by multi-objective score for better exploration
      openSet.sort((a, b) => a.multiObjectiveScore - b.multiObjectiveScore);
      const current = openSet.shift();
      const currentKey = createStateKey(current.balances);
      
      closedSet.add(currentKey);
      
      // Goal state: all debts paid off
      if (current.balances.every(b => b <= 5)) {
        console.log(`✅ Enhanced A* Found solution in ${current.months} months after ${iterations} iterations`);
        console.log(`💰 Total interest: $${current.totalInterest.toFixed(2)} | Multi-objective score: ${current.multiObjectiveScore.toFixed(3)}`);
        return { months: current.months, path: current.path, totalInterest: current.totalInterest };
      }
      
      // PARALLEL PATH TRACKING: Maintain top 5 partial solutions
      const totalDebt = current.balances.reduce((a, b) => a + b, 0);
      topPaths.push({
        months: current.months,
        totalDebt: totalDebt,
        totalInterest: current.totalInterest,
        multiObjectiveScore: current.multiObjectiveScore,
        path: current.path
      });
      topPaths = maintainTopPaths(topPaths, 5);
      
      if (current.months >= MAX_MONTHS) continue;
      
      // Explore strategies with enhanced scoring
      const strategies = getPaymentStrategies(current.balances);
      
      for (const { payments, name, score = 0 } of strategies) {
        const newBalances = calculateNewBalances(current.balances, payments);
        const newKey = createStateKey(newBalances);
        
        // Calculate interest paid this month
        const monthlyInterest = current.balances.reduce((sum, balance, i) => {
          return sum + (balance * (debts[i].interestRate / 12));
        }, 0);
        
        // Skip if no meaningful progress
        const oldTotal = current.balances.reduce((a, b) => a + b, 0);
        const newTotal = newBalances.reduce((a, b) => a + b, 0);
        if (newTotal >= oldTotal * 0.99) continue; // Must reduce debt by at least 1%
        
        if (closedSet.has(newKey)) continue;
        
        const tentativeGScore = current.gScore + 1;
        const knownGScore = gScores.get(newKey);
        if (knownGScore !== undefined && tentativeGScore >= knownGScore) continue;
        
        gScores.set(newKey, tentativeGScore);
        
        // Enhanced metrics calculation
        const newTotalInterest = current.totalInterest + monthlyInterest;
        const freedCashFlow = current.balances.reduce((freed, balance, i) => {
          return freed + (balance > 5 && newBalances[i] <= 5 ? debts[i].minimumPayment : 0);
        }, 0);
        const newCashFlowAcceleration = current.cashFlowAcceleration + (freedCashFlow / Math.max(availableBudget, 100));
        
        const hScore = calculateHeuristic(newBalances);
        const fScore = tentativeGScore + hScore;
        const multiObjectiveScore = calculateMultiObjectiveScore(
          current.months + 1, 
          newTotalInterest, 
          newCashFlowAcceleration
        );
        
        const newPath = [...current.path, { 
          month: current.months + 1, 
          balances: newBalances, 
          payments, 
          strategy: name,
          interest: monthlyInterest
        }];
        
        const neighborNode = {
          balances: newBalances,
          months: current.months + 1,
          totalInterest: newTotalInterest,
          cashFlowAcceleration: newCashFlowAcceleration,
          gScore: tentativeGScore,
          hScore: hScore,
          fScore: fScore,
          multiObjectiveScore: multiObjectiveScore,
          path: newPath
        };
        
        openSet.push(neighborNode);
      }
      
      // Enhanced progress logging
      if (iterations % 10000 === 0) {
        const currentDebt = current.balances.reduce((a, b) => a + b, 0);
        const bestTopPath = topPaths[0];
        console.log(`   🔍 Iteration ${iterations} | Queue: ${openSet.length} | Month: ${current.months} | Debt: $${currentDebt} | Best Multi-Obj: ${bestTopPath ? bestTopPath.multiObjectiveScore.toFixed(3) : 'N/A'}`);
      }
    }
    
    console.log(`⚠️  Enhanced A* reached ${iterations} iterations`);
    
    // Return best path from parallel exploration
    if (topPaths.length > 0) {
      const bestPath = topPaths[0];
      console.log(`📊 Using best parallel path: ${bestPath.months} months, Multi-objective score: ${bestPath.multiObjectiveScore.toFixed(3)}`);
      return { months: bestPath.months, path: bestPath.path, totalInterest: bestPath.totalInterest };
    }
    
    // Fallback to avalanche strategy
    console.log(`🔄 Using enhanced fallback strategy`);
    const fallbackPath = [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial', interest: 0 }];
    let currentBalances = [...initialBalances];
    let totalFallbackInterest = 0;
    
    for (let month = 1; month <= 60; month++) {
      const strategies = getPaymentStrategies(currentBalances);
      const bestStrategy = strategies[0]; // Top priority strategy
      
      const monthlyInterest = currentBalances.reduce((sum, balance, i) => {
        return sum + (balance * (debts[i].interestRate / 12));
      }, 0);
      totalFallbackInterest += monthlyInterest;
      
      fallbackPath.push({
        month,
        balances: [...currentBalances],
        payments: bestStrategy.payments,
        strategy: bestStrategy.name,
        interest: monthlyInterest
      });
      
      currentBalances = calculateNewBalances(currentBalances, bestStrategy.payments);
      
      if (currentBalances.every(b => b <= 5)) {
        console.log(`✅ Enhanced fallback completes in ${month} months`);
        break;
      }
    }
    
    return { months: fallbackPath.length - 1, path: fallbackPath, totalInterest: totalFallbackInterest };
  };

  // =================== ENHANCED PROJECTION GENERATION ===================
  const generateEnhancedProjection = (path) => {
    if (path.length <= 1) return null;
    
    console.log(`\n📊 ENHANCED A* DETAILED PROJECTION:`);
    
    let actualBalances = debts.map(debt => debt.currentAmount);
    let totalInterestPaid = 0;
    let totalCashFlowFreed = 0;
    const projection = [];
    
    for (let month = 1; month < Math.min(path.length, 121); month++) {
      const { payments, strategy } = path[month];
      
      let monthlyInterest = 0;
      let monthlyPrincipal = 0;
      let cashFlowFreedThisMonth = 0;
      
      actualBalances = actualBalances.map((balance, i) => {
        if (balance <= 0.01) return 0;

        const payment = payments[i];
        const interest = balance * (debts[i].interestRate / 12);
        const principal = Math.max(0, payment - interest);
        const newBalance = Math.max(0, balance - principal);

        monthlyInterest += interest;
        monthlyPrincipal += principal;
        
        // Track cash flow liberation
        if (balance > 0.01 && newBalance <= 0.01) {
          cashFlowFreedThisMonth += debts[i].minimumPayment;
        }

        return newBalance;
      });

      totalInterestPaid += monthlyInterest;
      totalCashFlowFreed += cashFlowFreedThisMonth;
      const totalDebtRemaining = actualBalances.reduce((sum, b) => sum + b, 0);
      
      // Calculate cash flow acceleration
      const cashFlowAcceleration = totalCashFlowFreed / Math.max(availableBudget, 100);
      
      // Multi-objective score for this month
      const monthMultiObjectiveScore = calculateMultiObjectiveScore(month, totalInterestPaid, cashFlowAcceleration);

      projection.push({
        month,
        strategy,
        totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
        totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
        monthlyPrincipal: Math.round(monthlyPrincipal * 100) / 100,
        cashFlowFreedThisMonth: cashFlowFreedThisMonth,
        totalCashFlowFreed: totalCashFlowFreed,
        cashFlowAcceleration: Math.round(cashFlowAcceleration * 100) / 100,
        multiObjectiveScore: Math.round(monthMultiObjectiveScore * 1000) / 1000,
        payments: payments
      });

      // Enhanced logging with multi-objective metrics
      if (month % 6 === 0 || month <= 3 || totalDebtRemaining <= 1000 || cashFlowFreedThisMonth > 0) {
        console.log(`   Month ${month.toString().padStart(2)} (${strategy}): Debt $${totalDebtRemaining.toFixed(2)} | Interest $${totalInterestPaid.toFixed(2)} | CashFlow: $${totalCashFlowFreed} | Score: ${monthMultiObjectiveScore.toFixed(3)}`);
      }

      if (totalDebtRemaining <= 1) {
        console.log(`🎉 Enhanced A*: All debts eliminated in ${month} months!`);
        break;
      }
    }

    const finalCashFlowAcceleration = totalCashFlowFreed / Math.max(availableBudget, 100);
    const finalMultiObjectiveScore = calculateMultiObjectiveScore(projection.length, totalInterestPaid, finalCashFlowAcceleration);

    return {
      totalMonths: projection.length,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      totalCashFlowFreed: totalCashFlowFreed,
      finalCashFlowAcceleration: Math.round(finalCashFlowAcceleration * 100) / 100,
      finalMultiObjectiveScore: Math.round(finalMultiObjectiveScore * 1000) / 1000,
      projection
    };
  };

  // =================== MAIN EXECUTION ===================
  const initialBalances = debts.map(debt => debt.currentAmount);
  const discretizedInitial = initialBalances.map(discretizeBalance);
  
  console.log(`🎯 Enhanced A* Starting: [${discretizedInitial.map(b => `$${b}`).join(', ')}]`);
  console.log(`💰 Budget: $${availableBudget} | Extra: $${availableBudget - debts.reduce((sum, d) => sum + d.minimumPayment, 0)}`);
  
  const optimalResult = calculateOptimalPathWithParallelExploration(discretizedInitial);
  
  console.log(`\n📅 ENHANCED A* COMPLETE STRATEGY (${optimalResult.path.length - 1} months):`);
  
  // Show strategy summary with enhanced info
  const pathToShow = optimalResult.path.slice(1, Math.min(13, optimalResult.path.length));
  pathToShow.forEach(({ month, balances, payments, strategy }) => {
    const totalDebt = balances.reduce((a, b) => a + b, 0);
    console.log(`   Month ${month.toString().padStart(2)}: ${strategy.substring(0, 35).padEnd(35)} | Payments=[${payments.map(p => `$${p}`).join(', ')}] | Debt=$${totalDebt}`);
  });
  
  if (optimalResult.path.length > 13) {
    console.log(`   ... (showing first 12 months of ${optimalResult.path.length-1} total months)`);
  }

  const enhancedProjection = generateEnhancedProjection(optimalResult.path);
  
  console.log(`\n📊 ENHANCED A* FINAL SUMMARY:`);
  if (enhancedProjection) {
    console.log(`   🎯 Total Months: ${enhancedProjection.totalMonths}`);
    console.log(`   💰 Total Interest: $${enhancedProjection.totalInterestPaid}`);
    console.log(`   🚀 Cash Flow Freed: $${enhancedProjection.totalCashFlowFreed}/month`);
    console.log(`   📈 Cash Flow Acceleration: ${enhancedProjection.finalCashFlowAcceleration}x`);
    console.log(`   🎯 Multi-Objective Score: ${enhancedProjection.finalMultiObjectiveScore} (lower = better)`);
  }
  
  const firstMonthPayments = optimalResult.path.length > 1 ? optimalResult.path[1].payments : debts.map(d => d.minimumPayment);
  
  return {
    months: optimalResult.months,
    payments: firstMonthPayments,
    projection: enhancedProjection,
    fullStrategy: optimalResult.path,
    optimizationGoal: optimizationGoal,
    multiObjectiveScore: enhancedProjection ? enhancedProjection.finalMultiObjectiveScore : null,
    totalInterest: optimalResult.totalInterest || 0
  };
};

// =================== USAGE EXAMPLES ===================

// Example usage with different optimization goals:
// const resultFastest = optimizeWithEnhancedDP(debts, availableBudget, 'fastest_payoff');
// const resultMinInterest = optimizeWithEnhancedDP(debts, availableBudget, 'min_interest');
// const resultCashFlow = optimizeWithEnhancedDP(debts, availableBudget, 'cash_flow');
// const resultBalanced = optimizeWithEnhancedDP(debts, availableBudget, 'balanced');

const showCompleteStrategy = (dpResult: any) => {
  if (!dpResult || !dpResult.projection) {
    console.log('❌ No DP result to display');
    return;
  }

  console.log('\n🔍 =============== COMPLETE DP STRATEGY ANALYSIS ===============');
  console.log(`📊 Total Strategy Length: ${dpResult.projection.totalMonths} months`);
  console.log(`💰 Total Interest Saved: $${dpResult.projection.totalInterestPaid}`);
  
  // Show every month's strategy (not just first 12)
  if (dpResult.projection.projection) {
    console.log('\n📅 MONTH-BY-MONTH DP DECISIONS:');
    dpResult.projection.projection.forEach((monthData: any) => {
      const { month, strategy, totalDebtRemaining, payments } = monthData;
      console.log(`   Month ${month.toString().padStart(2)}: ${strategy.padEnd(20)} | Debt: $${totalDebtRemaining.toString().padStart(8)} | Payments: [${payments.map((p: any) => `$${p.payment}`).join(', ')}]`);
    });
  }
  
  console.log('\n🎯 DP STRATEGY TRANSITIONS:');
  if (dpResult.projection.projection) {
    let lastStrategy = '';
    dpResult.projection.projection.forEach((monthData: any, index: number) => {
      if (monthData.strategy !== lastStrategy) {
        console.log(`   📍 Month ${monthData.month}: Switched to "${monthData.strategy}"`);
        lastStrategy = monthData.strategy;
      }
    });
  }
};

export const calculateOptimalStrategy = async (userId: string): Promise<OptimizationResult> => {
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

    console.log(`💼 Portfolio: ${debts.length} debts, $${debtResponses.reduce((sum, d) => sum + d.currentAmount, 0).toFixed(2)} total`);

    // Check feasibility
    const totalMinimums = debtResponses.reduce((sum, debt) => sum + debt.minimumPayment, 0);
    if (availableBudget < totalMinimums) {
      throw new Error(`Insufficient budget: Need $${totalMinimums}, have $${availableBudget}`);
    }

    // Run primary optimization
    const primaryStrategy = generateOptimalStrategy(debtResponses, availableBudget);
    const fastest = optimizeWithEnhancedDP(debtResponses, availableBudget, 'fastest_payoff');
const cheapest = optimizeWithEnhancedDP(debtResponses, availableBudget, 'min_interest'); 
const cashFlow = optimizeWithEnhancedDP(debtResponses, availableBudget, 'cash_flow');

    
    // Run DP optimization  
    //const dpResult = optimizeWithBackwardDP(debtResponses, availableBudget);

    // 🔥 NEW: Show complete DP strategy analysis
    //showCompleteStrategy(dpResult);

    // console.log(`\n🆚 STRATEGY COMPARISON:`);
    // if (dpResult.projection) {
    //   console.log(`DP Strategy: ${dpResult.projection.totalMonths} months, $${dpResult.projection.totalInterestPaid} interest`);
    // }

    // Use primary strategy (efficiency-based)
    const finalStrategy = primaryStrategy;

    // Generate projection
    const projectionResult = generateFullProjection(debtResponses, finalStrategy);

    console.log(`Efficiency Greedy: ${projectionResult.totalMonths} months, $${projectionResult.totalInterestPaid} interest`);

    // 🔥 NEW: Show detailed comparison
    // console.log('\n📈 =============== DETAILED STRATEGY COMPARISON ===============');
    // console.log(`🎯 DP Strategy:          ${dpResult.projection?.totalMonths || 'N/A'} months, $${dpResult.projection?.totalInterestPaid || 'N/A'} interest`);
    // console.log(`🎯 Efficiency Strategy:  ${projectionResult.totalMonths} months, $${projectionResult.totalInterestPaid} interest`);
    
    // if (dpResult.projection) {
    //   const timeSaved = projectionResult.totalMonths - dpResult.projection.totalMonths;
    //   const interestSaved = projectionResult.totalInterestPaid - dpResult.projection.totalInterestPaid;
    //   console.log(`💡 DP Advantage:         ${timeSaved} months faster, $${interestSaved.toFixed(2)} less interest`);
    // }

    console.log('\n🏁 =============== OPTIMIZATION COMPLETE ===============');

    return {
      isOptimal: true,
      totalInterestSaved: 0,
      projectedMonths: projectionResult.totalMonths,
      plannedPayments: finalStrategy,
      monthlyProjection: projectionResult.projection.slice(0, 36)
    };

  } catch (error) {
    console.error('❌ Optimization failed:', error);
    throw new Error(`Optimization failed: ${error}`);
  }
};

// Main export function
// export const calculateOptimalStrategy = async (userId: string): Promise<OptimizationResult> => {
//   try {
//     console.log('\n🚀 =============== DEBT OPTIMIZATION START ===============');
    
//     // Fetch data
//     const [debts, financialProfile] = await Promise.all([
//       prisma.debt.findMany({ where: { userId, isActive: true } }),
//       prisma.financialProfile.findUnique({ where: { userId } })
//     ]);

//     if (!financialProfile) {
//       throw new Error('Financial profile not found');
//     }

//     if (debts.length === 0) {
//       console.log('📭 No active debts found');
//       return {
//         isOptimal: true,
//         totalInterestSaved: 0,
//         projectedMonths: 0,
//         plannedPayments: [],
//         monthlyProjection: []
//       };
//     }

//     // Convert to proper format
//     const debtResponses: DebtResponse[] = debts.map(debt => ({
//       ...debt,
//       originalAmount: Number(debt.originalAmount),
//       currentAmount: Number(debt.currentAmount),
//       interestRate: Number(debt.interestRate),
//       minimumPayment: Number(debt.minimumPayment),
//       remainingTenure: debt.remainingTenure ? Number(debt.remainingTenure) : null,
//       tenure: debt.tenure ? Number(debt.tenure) : null,
//     }));

//     const availableBudget = Number(financialProfile.monthly_income) - Number(financialProfile.monthly_expenses);

//     console.log(`💼 Portfolio: ${debts.length} debts, $${debtResponses.reduce((sum, d) => sum + d.currentAmount, 0).toFixed(2)} total`);

//     // Check feasibility
//     const totalMinimums = debtResponses.reduce((sum, debt) => sum + debt.minimumPayment, 0);
//     if (availableBudget < totalMinimums) {
//       throw new Error(`Insufficient budget: Need $${totalMinimums}, have $${availableBudget}`);
//     }

//     // Run primary optimization
//     const primaryStrategy = generateOptimalStrategy(debtResponses, availableBudget);
    
//     // Run DP optimization  
//       const dpResult = optimizeWithBackwardDP(debtResponses, availableBudget);
      

//     console.log(`\n🆚 STRATEGY COMPARISON:`);
//     if (dpResult.projection) {
//       console.log(`DP Strategy: ${dpResult.projection.totalMonths} months, $${dpResult.projection.totalInterestPaid} interest`);
//     }

//     // Use primary strategy (efficiency-based)
//     const finalStrategy = primaryStrategy;

//     // Generate projection
//       const projectionResult = generateFullProjection(debtResponses, finalStrategy);
      
      

//     console.log(`Efficiency Greedy: ${projectionResult.totalMonths} months, $${projectionResult.totalInterestPaid} interest`);

//     console.log('\n🏁 =============== OPTIMIZATION COMPLETE ===============');

//     return {
//       isOptimal: true,
//       totalInterestSaved: 0, // Can calculate vs minimum payments scenario
//       projectedMonths: projectionResult.totalMonths,
//       plannedPayments: finalStrategy,
//       monthlyProjection: projectionResult.projection.slice(0, 36) // Limit to 3 years for API response
//     };

//   } catch (error) {
//     console.error('❌ Optimization failed:', error);
//     throw new Error(`Optimization failed: ${error}`);
//   }
// };

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

    return generateOptimalStrategy(debtResponses, windfallAmount);
  } catch (error) {
    throw new Error(`Windfall calculation failed: ${error}`);
  }
};