// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult, StrategyWithLookahead } from '../types/optimization';
import { optimizeLowPriorityWithHybridAvalanche } from './highpriority.optimization.service';
import { createBoundedMinHeap, pushToHeap, popFromHeap, isHeapEmpty, getHeapLength } from '../utils/priorityQueue';
import { generateOptimizationExcel, generateOptimizationExcelFilename } from '../utils/excelGenerator';

// Import extracted utility modules
import { 
  calculateMonthlyInterestRate, 
  calculateMonthlyInterest 
} from './optimization/utils/interestCalculations';
import { 
  categorizeDebts, 
  CategorizedDebts,
  DEFAULT_CATEGORIZATION_CONFIG,
  DebtCategorizationConfig 
} from './optimization/utils/debtCategorization';
import { 
  allocateBudgetByPriority,
  BudgetAllocation,
  DEFAULT_BUDGET_ALLOCATION_CONFIG,
  BudgetAllocationConfig 
} from './optimization/utils/budgetAllocation';
import { 
  discretizeBalance,
  calculateNewBalances,
  createStateKey,
  calculateTotalDebt,
  areAllDebtsPaidOff,
  calculateBalanceReduction,
  DEFAULT_DISCRETIZATION_CONFIG,
  DiscretizationConfig 
} from './optimization/utils/balanceCalculations';

const prisma = new PrismaClient();

const optimizeWithBackwardDP = (
  debts: DebtResponse[],
  availableBudget: number,
  startMonth: number = 0,        
  freedUpBudget: number = 0,     
  freedUpAvailableMonth: number = 0
) => {
  // console.log('\n⏮️ ENHANCED A* DYNAMIC PROGRAMMING WITH 3-MONTH LOOKAHEAD:');
  // console.log(`   💰 Base Budget: $${availableBudget}, Freed Budget: $${freedUpBudget} (available from month ${freedUpAvailableMonth})`);
   const getCurrentBudget = (absoluteMonth: number): number => {
    if (absoluteMonth >= freedUpAvailableMonth) {
      return availableBudget + freedUpBudget;  // After freed budget available
    } else {
      return availableBudget;  // Before freed budget available
    }
  };
  
  const lookaheadDepth = 3; // 

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
    
    // console.log(`     Month ${currentAbsoluteMonth}: Budget $${effectiveBudget} (Extra: $${extraBudget})`);
    
    const strategies = [];
    
    // Strategy 1: All minimums (baseline)
    strategies.push({ payments: [...minimums], name: 'Minimums Only' });
    
    if (extraBudget <= 0) return strategies;
    
    // Get active debts with enhanced analysis
    const activeDebts = balances.map((balance, index) => {
      const monthlyInterest = calculateMonthlyInterest(balance, debts[index].interestRate);
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
      const actualBalance = debts[debt.index].currentAmount; // Use real balance
      const actualInterest = calculateMonthlyInterest(actualBalance, debts[debt.index].interestRate);
      const totalNeeded = actualBalance + actualInterest;
      liberationPayments[debt.index] = Math.min(totalNeeded, availableBudget);
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
        const monthlyInterest = calculateMonthlyInterest(balance, debts[i].interestRate);
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
      return sum + (calculateMonthlyInterestRate(debt.interestRate) * balances[i]);
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
  startMonth: number,
  freedUpAvailableMonth: number
): { 
  months: number, 
  path: Array<{ month: number, balances: number[], payments: number[], strategy: string }> 
} => {
  // 🚀 OPTIMIZED: MinHeap Priority Queue instead of array sorting
  let openSet = createBoundedMinHeap<AStarNode>((a, b) => a.fScore - b.fScore, 5000, 'batch');
  const closedSet = new Set<number>();
  const gScores = new Map<number, number>();
  
  const startKey = createStateKey(initialBalances, debts.length);
  const initialHeuristic = calculateHeuristic(initialBalances);
  
  const startNode: AStarNode = { 
    balances: initialBalances, 
    months: 0,
    gScore: 0,
    hScore: initialHeuristic,
    fScore: initialHeuristic,
    path: [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }] 
  };
  
  // 🚀 OPTIMIZED: O(log n) insertion instead of O(n) push
  pushToHeap(openSet, startNode);
  gScores.set(startKey, 0);
  
  let iterations = 0;
  const MAX_ITERATIONS = 8000000; // Keep your high quality threshold
  const MAX_MONTHS = 370;
  let bestSolutionFound: any = null;
  
  console.log(`🔍 A* Deep Search with 3-Month Lookahead: [${initialBalances.map(b => `$${b}`).join(', ')}]`);
  console.log(`🎯 Initial heuristic estimate: ${initialHeuristic} months`);
  
  // 🚀 OPTIMIZED: No more expensive array sorting!
  while (!isHeapEmpty(openSet) && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // 🚀 OPTIMIZED: O(log n) extraction instead of O(n log n) sort + O(n) shift
    const current = popFromHeap(openSet)!;
    const currentKey = createStateKey(current.balances, debts.length);
    
    // Move to closed set
    closedSet.add(currentKey);
    
    // Base case: all debts paid off - SAME OPTIMAL LOGIC
    if (current.balances.every((b: number) => b <= 5)) {
      console.log(`✅ A* Found optimal solution in ${current.months} months after ${iterations} iterations`);
      return { months: current.months, path: current.path };
    }
    
    // Track best partial solution - SAME QUALITY TRACKING
    const totalDebt = current.balances.reduce((a: number, b: number) => a + b, 0);
    if (!bestSolutionFound || totalDebt < bestSolutionFound.totalDebt || 
        (totalDebt === bestSolutionFound.totalDebt && current.months < bestSolutionFound.months)) {
      bestSolutionFound = { months: current.months, path: current.path, totalDebt };
    }
    
    // Don't explore beyond reasonable timeframe
    if (current.months >= MAX_MONTHS) continue;
    
    // SAME STRATEGY GENERATION - No quality loss
    const currentAbsoluteMonth = startMonth + current.months;
    const strategies = getPaymentStrategies(current.balances, currentAbsoluteMonth);
    
    for (const strategy of strategies as StrategyWithLookahead[]) {
      const newBalances = calculateNewBalances(current.balances, strategy.payments, debts);
      const newKey = createStateKey(newBalances, debts.length);
      
      // SAME PRUNING LOGIC - Maintains optimality
      const oldTotal = current.balances.reduce((a: number, b: number) => a + b, 0);
      const newTotal = newBalances.reduce((a: number, b: number) => a + b, 0);
      if (newTotal >= oldTotal) continue;
      
      if (closedSet.has(newKey)) continue;
      
      const tentativeGScore = current.gScore + 1;
      
      const knownGScore = gScores.get(newKey);
      if (knownGScore !== undefined && tentativeGScore >= knownGScore) continue;
      
      // SAME OPTIMAL PATH TRACKING
      gScores.set(newKey, tentativeGScore);
      
      // SAME HEURISTIC CALCULATION - No quality loss
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
      
      const neighborNode: AStarNode = {
        balances: newBalances,
        months: current.months + 1,
        gScore: tentativeGScore,
        hScore: hScore,
        fScore: fScore,
        path: newPath
      };
      
      // 🚀 OPTIMIZED: O(log n) insertion maintains heap property automatically
      pushToHeap(openSet, neighborNode);
    }
    
    // Progress logging - show queue size improvement
    if (iterations % 20000 === 0) {
      const currentDebt = current.balances.reduce((a: number, b: number) => a + b, 0);
      console.log(`   🔍 A* Iteration ${iterations}, Queue: ${getHeapLength(openSet)}, Month: ${current.months}, Debt: $${currentDebt}, F: ${current.fScore.toFixed(1)}`);
    }
  }
  
  console.log(`⚠️ A* reached ${iterations} iterations`);
  
  // SAME FALLBACK LOGIC - No quality compromise
  if (bestSolutionFound && bestSolutionFound.path.length > 1) {
    console.log(`📊 Using best solution found: ${bestSolutionFound.months} months, $${bestSolutionFound.totalDebt.toFixed(2)} remaining debt`);
    return bestSolutionFound;
  }
  
  // Same fallback strategy
  console.log(`🔄 Using fallback avalanche strategy`);
  const fallbackPath = [{ month: 0, balances: initialBalances, payments: [0, 0, 0], strategy: 'Initial' }];
  let currentBalances = [...initialBalances];
  
  for (let month = 1; month <= Math.min(60, MAX_MONTHS); month++) {
    const currentAbsoluteMonth = startMonth + month; 
    const strategies = getPaymentStrategies(currentBalances, currentAbsoluteMonth);
    const avalancheStrategy = strategies.find(s => s.name.includes('Avalanche')) || strategies[0];
    
    fallbackPath.push({
      month,
      balances: [...currentBalances],
      payments: avalancheStrategy.payments,
      strategy: avalancheStrategy.name
    });
    
    currentBalances = calculateNewBalances(currentBalances, avalancheStrategy.payments, debts);
    
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
      const interest = calculateMonthlyInterest(balance, debts[i].interestRate);

      let principal, newBalance;

      if (payment < interest) {
        // Debt grows - allow strategic growth
        principal = payment - interest; // This will be negative
        newBalance = balance - principal; // This increases the balance
      } else {
        // Normal payment - debt shrinks
        principal = payment - interest;
        newBalance = Math.max(0, balance - principal);
      }

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

    // ✅ CRITICAL FIX: Add month to projection FIRST
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

    // ✅ THEN check for completion with UNIFIED logic
    const allDebtsCompleted = actualBalances.every(b => b <= 5.0); // Unified 5.0 threshold
    const totalVerySmall = totalDebtRemaining <= 5.0;

    if (allDebtsCompleted && totalVerySmall) {
      console.log(`🎉 TRUE COMPLETION: All debts eliminated in ${month} months!`);
      console.log(`Final balances: [${actualBalances.map(b => `$${b.toFixed(2)}`).join(', ')}]`);
      console.log(`Total debt remaining: $${totalDebtRemaining.toFixed(2)}`);
      break;
    }

    // Safety break for infinite loops
    if (month >= 120) {
      console.log(`⚠️ Reached maximum iterations at month ${month}`);
      console.log(`Remaining debt: $${totalDebtRemaining.toFixed(2)}`);
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
  const discretizedInitial = initialBalances.map(balance => 
  discretizeBalance(balance, debts.length)
);
  
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
    
 
    
    // ============ RUN OPTIMIZATION ONLY ON HIGH/MEDIUM PRIORITY ============
    let optimizationResults: any = null;
    let mediumPriorityResult: any = null;
    let lowPriorityResult: any = null;
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
        optimizationResults.months?optimizationResults.months:0
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
  
       lowPriorityResult = optimizeLowPriorityWithHybridAvalanche(
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
    // Show complete strategy
     if (optimizationResults) {
       showCompleteStrategy(optimizationResults);
    //   //showCompleteStrategy(mediumPriorityResult);
    //   //showCompleteStrategy(lowPriorityResult);
    }
  
    
    // console.log('\n📊 FINAL PAYMENT PLAN:');
    // allPlannedPayments.forEach(payment => {
    //   console.log(`   ${payment.priority} - ${payment.debtName}: $${payment.amount} (Min: $${payment.minimumPayment}, Extra: $${payment.extraAmount})`);
    // });
    
    console.log('\n🏁 =============== OPTIMIZATION COMPLETE ===============');

    return {
      optimizationResults,
      mediumPriorityResult,
      lowPriorityResult  
};

  } catch (error) {
    console.error('❌ Optimization failed:', error);
    throw new Error(`Optimization failed: ${error}`);
  }
};

/**
 * Generate Excel file with complete optimization analysis
 */
export const generateOptimizationExcelReport = async (userId: string): Promise<{ filename: string; buffer: Buffer }> => {
  try {
    console.log('\n📊 =============== GENERATING EXCEL REPORT ===============');

    // Get the optimization results
    const optimizationData = await calculateOptimalStrategy(userId);

    // Fetch fresh data for Excel report
    const [debts, financialProfile] = await Promise.all([
      prisma.debt.findMany({ where: { userId, isActive: true } }),
      prisma.financialProfile.findUnique({ where: { userId } })
    ]);

    if (!financialProfile) {
      throw new Error('Financial profile not found');
    }

    if (debts.length === 0) {
      throw new Error('No active debts found for Excel generation');
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

    // Create a comprehensive projection that includes ALL debt timelines
    const createCompleteProjection = () => {
      // Combine all projections from high, medium, and low priority optimizations
      let allProjections: any[] = [];
      let totalMonths = 0;
      let totalInterestPaid = 0;

      // Add high priority projection data
      if (optimizationData.optimizationResults?.projection?.projection) {
        allProjections = [...optimizationData.optimizationResults.projection.projection];
        totalMonths = Math.max(totalMonths, optimizationData.optimizationResults.projection.totalMonths || 0);
        totalInterestPaid += optimizationData.optimizationResults.projection.totalInterestPaid || 0;
      }

      // Add medium priority projection data
      if (optimizationData.mediumPriorityResult?.projection?.projection) {
        const mediumProjections = optimizationData.mediumPriorityResult.projection.projection;
        // Merge medium priority data into existing months or extend timeline
        mediumProjections.forEach((mediumMonth: any) => {
          const existingMonth = allProjections.find(p => p.month === mediumMonth.month);
          if (existingMonth) {
            // Merge payments for medium priority debts, preserving completed debt status
            mediumMonth.payments.forEach((payment: any) => {
              const existingPayment = existingMonth.payments.find((p: any) => p.debtName === payment.debtName);
              if (!existingPayment) {
                existingMonth.payments.push(payment);
              } else if (existingPayment.newBalance <= 0.01) {
                // Don't overwrite completed debts - keep them at 0
                // The existing payment already shows completion, so don't merge
              } else {
                // Update with medium priority payment if original debt is still active
                Object.assign(existingPayment, payment);
              }
            });
          } else {
            allProjections.push(mediumMonth);
          }
        });
        totalMonths = Math.max(totalMonths, optimizationData.mediumPriorityResult.projection.totalMonths || 0);
        totalInterestPaid += optimizationData.mediumPriorityResult.projection.totalInterestPaid || 0;
      }

      // Add low priority projection data
      if (optimizationData.lowPriorityResult?.projection?.projection) {
        const lowProjections = optimizationData.lowPriorityResult.projection.projection;
        // Merge low priority data into existing months or extend timeline
        lowProjections.forEach((lowMonth: any) => {
          const existingMonth = allProjections.find(p => p.month === lowMonth.month);
          if (existingMonth) {
            // Merge payments for low priority debts, preserving completed debt status
            lowMonth.payments.forEach((payment: any) => {
              const existingPayment = existingMonth.payments.find((p: any) => p.debtName === payment.debtName);
              if (!existingPayment) {
                existingMonth.payments.push(payment);
              } else if (existingPayment.newBalance <= 0.01) {
                // Don't overwrite completed debts - keep them at 0
                // The existing payment already shows completion, so don't merge
              } else {
                // Update with low priority payment if original debt is still active
                Object.assign(existingPayment, payment);
              }
            });
          } else {
            allProjections.push(lowMonth);
          }
        });
        totalMonths = Math.max(totalMonths, optimizationData.lowPriorityResult.projection.totalMonths || 0);
        totalInterestPaid += optimizationData.lowPriorityResult.projection.totalInterestPaid || 0;
      }

      // Sort projections by month and ensure all debts are represented in each month
      allProjections.sort((a, b) => a.month - b.month);
      
      // Track debt balances to ensure accurate reporting after completion
      const debtBalances = new Map<string, number>();
      
      // Initialize debt balances with current amounts
      debtResponses.forEach(debt => {
        debtBalances.set(debt.name, debt.currentAmount);
      });
      
      // Process each month to track debt completion accurately
      allProjections.forEach(monthData => {
        // Update balances based on actual payments in this month
        monthData.payments.forEach((payment: any) => {
          if (payment.newBalance !== undefined && payment.newBalance >= 0) {
            debtBalances.set(payment.debtName, payment.newBalance);
          }
        });

        // Ensure all debts are represented in this month with correct balances
        debtResponses.forEach(debt => {
          const existingPayment = monthData.payments.find((p: any) => p.debtName === debt.name);
          const currentBalance = debtBalances.get(debt.name) || 0;
          
          if (!existingPayment) {
            // If debt is completed (balance <= 0), show 0 values
            if (currentBalance <= 0.01) {
              monthData.payments.push({
                debtName: debt.name,
                payment: 0,
                interest: 0,
                principal: 0,
                newBalance: 0
              });
            } else {
              // If debt still has balance, show minimum payment
              const monthlyInterest = (currentBalance * debt.interestRate / 100) / 12;
              const principal = Math.max(0, debt.minimumPayment - monthlyInterest);
              const newBalance = Math.max(0, currentBalance - principal);
              
              monthData.payments.push({
                debtName: debt.name,
                payment: debt.minimumPayment,
                interest: Math.round(monthlyInterest * 100) / 100,
                principal: Math.round(principal * 100) / 100,
                newBalance: Math.round(newBalance * 100) / 100
              });
              
              // Update tracked balance
              debtBalances.set(debt.name, newBalance);
            }
          }
        });
      });

      return {
        totalMonths,
        totalInterestPaid,
        projection: allProjections
      };
    };

    const completeProjection = createCompleteProjection();

    // Prepare data for Excel generation (without exposing internal categorization)
    const excelData = {
      userInfo: {
        userId,
        monthlyIncome: Number(financialProfile.monthly_income),
        monthlyExpenses: Number(financialProfile.monthly_expenses),
        availableBudget,
        generatedAt: new Date()
      },
      debts: debtResponses,
      completeProjection
    };

    // Generate Excel file
    console.log('📝 Creating Excel workbook with user-friendly sheets...');
    const buffer = await generateOptimizationExcel(excelData);
    const filename = generateOptimizationExcelFilename(userId);

    console.log(`✅ Excel report generated successfully: ${filename}`);
    console.log(`📁 File size: ${(buffer.length / 1024).toFixed(2)} KB`);
    console.log(`📊 Timeline includes ${completeProjection.projection.length} months of projections`);

    return { filename, buffer };

  } catch (error) {
    console.error('❌ Excel generation failed:', error);
    throw new Error(`Excel generation failed: ${error}`);
  }
};

