// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult, StrategyWithLookahead } from '../types/optimization';
import { optimizeLowPriorityWithHybridAvalanche } from './highpriority.optimization.service';
import { MinHeap } from '../utils/priorityQueue';

const prisma = new PrismaClient();
interface CategorizedDebts {
  highPriority: DebtResponse[];   // Credit cards, medical, high-interest
  lowPriority: DebtResponse[];    // Mortgage, large auto loans
  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto
}

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
  
 if (categories.highPriority.length === 0 && categories.mediumPriority.length === 0) {
    highPercentage = 0.0;
    mediumPercentage = 0.0;
    lowPercentage = 1.0;  // All extra budget goes to low priority
  }
  // NEW: Handle case where only high priority debts exist  
  else if (categories.mediumPriority.length === 0 && categories.lowPriority.length === 0) {
    highPercentage = 1.0;  // All extra budget goes to high priority
    mediumPercentage = 0.0;
    lowPercentage = 0.0;
  }
  // Handle case where only medium priority debts exist
  else if (categories.highPriority.length === 0 && categories.mediumPriority.length > 0) {
    highPercentage = 0.0;
    mediumPercentage = 1.0;  // All extra budget goes to medium priority
  }
  // NEW: Handle case where only high and low exist (no medium)
  else if (categories.mediumPriority.length === 0) {
    highPercentage = 0.8;   // Keep most for high priority
    mediumPercentage = 0.0;
    lowPercentage = 0.2;    // Some for low priority
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
  
  // IMPROVED discretization - adaptive based on balance size
 const discretizeBalance = (balance: number): number => {
  if (balance <= 1) return 0;
  if (balance <= 500) return Math.round(balance / 25) * 25;    // $25 steps for small
  if (balance <= 5000) return Math.round(balance / 100) * 100; // $100 steps for medium  
  return Math.round(balance / 250) * 250;                      // $250 steps for large
};
  
  const createStateKey = (balances: number[]): number => {
     let hash1 = 0;
  const primes = [982451653, 982451679, 982451707, 982451719, 982451783];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash1 = (hash1 + (discretized * primes[i % primes.length])) >>> 0;
  }
  
  // Level 2: Bit rotation with Fibonacci numbers
  let hash2 = 0;
  const fibonacci = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash2 = ((hash2 << 7) - hash2 + (discretized * fibonacci[i % fibonacci.length])) >>> 0;
  }
  
  // Level 3: XOR with golden ratio multiplication
  let hash3 = 0;
  const goldenRatio = 0x9e3779b9; // (√5 - 1) / 2 * 2^32
  
  for (let i = 0; i < balances.length; i++) {
    const discretized = discretizeBalance(balances[i]);
    hash3 = (hash3 ^ (discretized * goldenRatio)) >>> 0;
  }
  
  // Combine all three levels with bit mixing
  const combined = hash1 ^ (hash2 << 11) ^ (hash3 << 21);
  return combined >>> 0; // E
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
    
    // console.log(`     Month ${currentAbsoluteMonth}: Budget $${effectiveBudget} (Extra: $${extraBudget})`);
    
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
      const actualBalance = debts[debt.index].currentAmount; // Use real balance
      const actualInterest = actualBalance * (debts[debt.index].interestRate / 12);
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
      const principal = payment - monthlyInterest;
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
  startMonth: number,
  freedUpAvailableMonth: number
): { 
  months: number, 
  path: Array<{ month: number, balances: number[], payments: number[], strategy: string }> 
} => {
  // 🚀 OPTIMIZED: MinHeap Priority Queue instead of array sorting
  const openSet = new MinHeap<AStarNode>((a, b) => a.fScore - b.fScore);
  const closedSet = new Set<number>();
  const gScores = new Map<number, number>();
  
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
  
  // 🚀 OPTIMIZED: O(log n) insertion instead of O(n) push
  openSet.push(startNode);
  gScores.set(startKey, 0);
  
  let iterations = 0;
  const MAX_ITERATIONS = 8000000; // Keep your high quality threshold
  const MAX_MONTHS = 370;
  let bestSolutionFound: any = null;
  
  console.log(`🔍 A* Deep Search with 3-Month Lookahead: [${initialBalances.map(b => `$${b}`).join(', ')}]`);
  console.log(`🎯 Initial heuristic estimate: ${initialHeuristic} months`);
  
  // 🚀 OPTIMIZED: No more expensive array sorting!
  while (!openSet.isEmpty() && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // 🚀 OPTIMIZED: O(log n) extraction instead of O(n log n) sort + O(n) shift
    const current = openSet.pop()!;
    const currentKey = createStateKey(current.balances);
    
    // Move to closed set
    closedSet.add(currentKey);
    
    // Base case: all debts paid off - SAME OPTIMAL LOGIC
    if (current.balances.every(b => b <= 5)) {
      console.log(`✅ A* Found optimal solution in ${current.months} months after ${iterations} iterations`);
      return { months: current.months, path: current.path };
    }
    
    // Track best partial solution - SAME QUALITY TRACKING
    const totalDebt = current.balances.reduce((a, b) => a + b, 0);
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
      const newBalances = calculateNewBalances(current.balances, strategy.payments);
      const newKey = createStateKey(newBalances);
      
      // SAME PRUNING LOGIC - Maintains optimality
      const oldTotal = current.balances.reduce((a, b) => a + b, 0);
      const newTotal = newBalances.reduce((a, b) => a + b, 0);
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
      openSet.push(neighborNode);
    }
    
    // Progress logging - show queue size improvement
    if (iterations % 20000 === 0) {
      const currentDebt = current.balances.reduce((a, b) => a + b, 0);
      console.log(`   🔍 A* Iteration ${iterations}, Queue: ${openSet.length}, Month: ${current.months}, Debt: $${currentDebt}, F: ${current.fScore.toFixed(1)}`);
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
    // if (optimizationResults) {
    //   showCompleteStrategy(optimizationResults);
    //   //showCompleteStrategy(mediumPriorityResult);
    //   //showCompleteStrategy(lowPriorityResult);
    // }
  
    
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