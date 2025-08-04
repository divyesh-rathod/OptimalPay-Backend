// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';



const prisma = new PrismaClient();


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

// Enhanced Backward DP with Full Month-by-Month Strategy
const optimizeWithBackwardDP = (debts: DebtResponse[], availableBudget: number) => {
  console.log('\n⏮️ ENHANCED A* DYNAMIC PROGRAMMING:');
  
  // IMPROVED discretization - adaptive based on balance size
  const discretizeBalance = (balance: number): number => {
    if (balance <= 100) return Math.max(0, Math.round(balance / 10) * 10); // $10 increments for small balances  
    if (balance <= 1000) return Math.max(0, Math.round(balance / 25) * 25); // $25 increments for medium balances
    return Math.max(0, Math.round(balance / 50) * 50); // $50 increments for large balances
  };
  
  const createStateKey = (balances: number[]): string => {
    const discretized = balances.map(discretizeBalance);
    return discretized.join('_');
  };

  const getPaymentStrategies = (balances: number[]) => {
  const minimums = debts.map(d => d.minimumPayment);
  const extraBudget = availableBudget - minimums.reduce((a, b) => a + b, 0);
  
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
      cashFlowValue: minimums[index], // What gets freed up when paid off
      canPayoffSoon: monthsToPayoff <= 3 && balance <= extraBudget * 3
    };
  }).filter(({ balance }) => balance > 10);
  
  if (activeDebts.length === 0) return strategies;

  // =================== CASH FLOW LIBERATION STRATEGIES ===================
  
  // Strategy 2: IMMEDIATE PAYOFF (highest priority)
  // If any debt can be paid off THIS MONTH, do it!
  const immediatePayoffs = activeDebts.filter(debt => 
    debt.balance <= extraBudget && debt.balance > 0
  );
  
  for (const debt of immediatePayoffs) {
    const liberationPayments = [...minimums];
    liberationPayments[debt.index] = debt.balance + debt.monthlyInterest; // Pay it off completely
    strategies.push({ 
      payments: liberationPayments, 
      name: `🚀 IMMEDIATE LIBERATION (Debt ${debt.index + 1}) - Frees $${debt.cashFlowValue}/mo`,
      priority: 100 // HIGHEST PRIORITY
    });
  }
  
  // Strategy 3: RAPID LIBERATION (2-3 month payoffs)
  const rapidPayoffs = activeDebts.filter(debt => 
    debt.monthsToPayoff <= 3 && 
    debt.balance <= extraBudget * 2.5 &&
    !immediatePayoffs.includes(debt)
  ).sort((a, b) => b.cashFlowValue - a.cashFlowValue); // Sort by cash flow value
  
  for (const debt of rapidPayoffs.slice(0, 2)) { // Top 2 rapid payoffs
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
    cashFlowScore: (debt.cashFlowValue * 12) + debt.monthlyInterest // Annual cash flow value + monthly interest
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
    .filter(debt => debt.cashFlowValue >= 50) // Only debts with decent cash flow liberation
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
  
  // Sort by priority and return top strategies
  return strategies
    .filter(s => s.priority || 0) // Only prioritized strategies
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, 6); // Top 6 strategies to avoid noise
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
    if (balance > 0 && balance <= currentBudget * 3) { // Payable within 3 months
      const monthlyInterest = balance * (debts[i].interestRate / 12);
      const monthsToPayoff = balance / (currentBudget - monthlyInterest);
      if (monthsToPayoff <= 3) {
        projectedFreedCashFlow += debts[i].minimumPayment;
      }
    }
  });
  
  // Enhanced budget calculation
  const enhancedBudget = currentBudget + (projectedFreedCashFlow * 0.5); // 50% weight to projected freed cash
  
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
      if (balance <= 5) return 0; // Lower threshold for completion
      
      const payment = Math.min(payments[i], balance + (balance * debts[i].interestRate / 12)); // Can't pay more than balance + interest
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
    fScore: number; // g + h (actual cost + heuristic)
    gScore: number; // actual months so far
    hScore: number; // heuristic estimate
  }

  // Enhanced A* search algorithm
  const calculateOptimalPath = (initialBalances: number[]): { 
    months: number, 
    path: Array<{ month: number, balances: number[], payments: number[], strategy: string }> 
  } => {
    // Priority queue for A* (sorted by fScore)
    const openSet: AStarNode[] = [];
    const closedSet = new Set<string>();
    const gScores = new Map<string, number>(); // Best known cost to reach each state
    
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
    const MAX_ITERATIONS = 75000; // Balanced for performance vs quality
    const MAX_MONTHS = 100;
    let bestSolutionFound: any = null;
    
    console.log(`🔍 A* Search Starting: Initial state [${initialBalances.map(b => `$${b}`).join(', ')}]`);
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
      
      // Explore all possible strategies
      const strategies = getPaymentStrategies(current.balances);
      
      for (const { payments, name } of strategies) {
        const newBalances = calculateNewBalances(current.balances, payments);
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
        
        const hScore = calculateHeuristic(newBalances);
        const fScore = tentativeGScore + hScore;
        
        const newPath = [...current.path, { 
          month: current.months + 1, 
          balances: newBalances, 
          payments, 
          strategy: name 
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
      if (iterations % 15000 === 0) {
        const currentDebt = current.balances.reduce((a, b) => a + b, 0);
        console.log(`   🔍 A* Iteration ${iterations}, Queue: ${openSet.length}, Month: ${current.months}, Debt: $${currentDebt}, F: ${current.fScore.toFixed(1)}`);
      }
    }
    
    console.log(`⚠️  A* reached ${iterations} iterations`);
    
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
      const strategies = getPaymentStrategies(currentBalances);
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
    
    console.log(`\n📊 A* DETAILED MONTH-BY-MONTH PROJECTION:`);
    
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
        const principal = Math.max(0, payment - interest);
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
  
  const optimalResult = calculateOptimalPath(discretizedInitial);
  
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
    
    // 🔥 ONLY RUN DP OPTIMIZATION
    const dpResult = optimizeWithBackwardDP(debtResponses, availableBudget);
    
    // Show complete DP strategy analysis
    showCompleteStrategy(dpResult);
    
    console.log('\n🏁 =============== OPTIMIZATION COMPLETE ===============');
    
    // 🔥 NEW: Transform DP results to controller format
    const plannedPayments = debtResponses.map((debt, index) => ({
      debtId: debt.id,
      debtName: debt.name,
      amount: dpResult.payments[index] || debt.minimumPayment,
      minimumPayment: debt.minimumPayment,
      extraAmount: Math.max(0, (dpResult.payments[index] || debt.minimumPayment) - debt.minimumPayment)
    }));
    
    const calculateSimpleInterestSavings = () => {
      const totalDebt = debtResponses.reduce((sum, debt) => sum + debt.currentAmount, 0);
      const weightedAvgInterestRate = debtResponses.reduce((sum, debt) => 
    sum + (debt.interestRate * debt.currentAmount), 0) / totalDebt;
      
  // Estimate savings: DP eliminates debt faster = less total interest
  const dpMonths = dpResult.projection?.totalMonths || 24;
  const estimatedMinimumMonths = Math.max(dpMonths * 1.5, dpMonths + 12); // Conservative estimate
  
  const dpInterest = dpResult.projection?.totalInterestPaid || 0;
  const estimatedMinimumInterest = totalDebt * weightedAvgInterestRate * (estimatedMinimumMonths / 12) * 0.6; // 60% of simple interest
  
  return Math.max(0, estimatedMinimumInterest - dpInterest);
};

const totalInterestSaved = calculateSimpleInterestSavings();

// 🔥 Return DP results only
return {
  isOptimal: true,
  totalInterestSaved: roundAmount(totalInterestSaved),
  projectedMonths: dpResult.projection?.totalMonths || 0,
  plannedPayments: plannedPayments,
  monthlyProjection: dpResult.projection?.projection?.slice(0, 36) || []
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

