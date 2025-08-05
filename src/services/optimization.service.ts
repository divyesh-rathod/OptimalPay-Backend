// src/services/optimization.service.ts
import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult,StrategyWithLookahead } from '../types/optimization';

const prisma = new PrismaClient();

const roundAmount = (amount: number): number => Math.round(amount * 100) / 100;

// Add this at the TOP of your optimization.service.ts file

interface CategorizedDebts {
  highPriority: DebtResponse[];   // Credit cards, medical, high-interest
  lowPriority: DebtResponse[];    // Mortgage, large auto loans
  mediumPriority: DebtResponse[]; // Student loans, personal loans, normal auto
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


const calculateMortgagePayoff = (
  mortgage: DebtResponse,
  monthlyPayment: number,
  startingMonth: number = 0
): { months: number; totalInterest: number; timeline: any[] } => {
  let balance = mortgage.currentAmount;
  const monthlyRate = mortgage.interestRate / 12;
  let totalInterest = 0;
  const timeline = [];
  let month = startingMonth;
  
  while (balance > 0.01 && month < 600) { // Max 50 years
    month++;
    const interestCharge = balance * monthlyRate;
    const principal = Math.min(monthlyPayment - interestCharge, balance);
    
    if (principal <= 0) {
      console.log('⚠️ Payment doesn\'t cover interest! Need higher payment.');
      break;
    }
    
    balance = Math.max(0, balance - principal);
    totalInterest += interestCharge;
    
    // Log key milestones
    if (month % 60 === 0 || balance === 0) {
      timeline.push({
        month,
        balance: roundAmount(balance),
        principal: roundAmount(principal),
        interest: roundAmount(interestCharge),
        totalInterest: roundAmount(totalInterest)
      });
    }
  }
  
  return { 
    months: month - startingMonth, 
    totalInterest: roundAmount(totalInterest),
    timeline 
  };
};


const calculateCompleteDebtPlan = (
  categorized: CategorizedDebts,
  phase1Result: any,
  availableBudget: number
): CompleteDebtPlan => {
  console.log('\n🏡 =============== COMPLETE DEBT ELIMINATION PLAN ===============');
  
  // PHASE 1: High/Medium priority debts
  const phase1Months = phase1Result?.projection?.totalMonths || 0;
  const phase1Interest = phase1Result?.projection?.totalInterestPaid || 0;
  const highPriorityPayments = categorized.highPriority.reduce((sum, d) => sum + d.minimumPayment, 0);
  const mediumPriorityPayments = categorized.mediumPriority.reduce((sum, d) => sum + d.minimumPayment, 0);
  const freedBudgetAfterPhase1 = highPriorityPayments + mediumPriorityPayments;
  
  console.log('\n📊 PHASE 1: Credit Cards & High-Priority Debts');
  console.log(`   Duration: ${phase1Months} months`);
  console.log(`   Debts: ${[...categorized.highPriority, ...categorized.mediumPriority].map(d => d.name).join(', ')}`);
  console.log(`   Total Interest: $${phase1Interest.toFixed(2)}`);
  console.log(`   Budget Freed After Phase 1: $${freedBudgetAfterPhase1.toFixed(2)}/month`);
  
  // PHASE 2: Mortgage/Low priority with freed budget
  let phase2Months = 0;
  let phase2Interest = 0;
  let mortgageStrategy = 'Minimum payments only';
  let interestSaved = 0;
  
  if (categorized.lowPriority.length > 0) {
    const mortgage = categorized.lowPriority[0]; // Assuming one mortgage
    
    // Calculate mortgage payoff with MINIMUM payments only
    const minimumOnlyPayoff = calculateMortgagePayoff(mortgage, mortgage.minimumPayment);
    
    // Calculate ACCELERATED payoff after Phase 1
    const acceleratedPayment = mortgage.minimumPayment + freedBudgetAfterPhase1;
    const acceleratedPayoff = calculateMortgagePayoff(mortgage, acceleratedPayment, phase1Months);
    
    // Calculate mortgage interest DURING Phase 1 (minimum payments)
    const phase1MortgageInterest = phase1Months * mortgage.currentAmount * (mortgage.interestRate / 12);
    
    phase2Months = acceleratedPayoff.months;
    phase2Interest = acceleratedPayoff.totalInterest + phase1MortgageInterest;
    interestSaved = (minimumOnlyPayoff.totalInterest - phase2Interest);
    
    console.log('\n🏠 PHASE 2: Mortgage Acceleration');
    console.log(`   Starting Month: ${phase1Months + 1}`);
    console.log(`   Mortgage Balance at Start: $${(mortgage.currentAmount - (phase1Months * 1000)).toFixed(2)} (estimate)`);
    console.log(`   Accelerated Payment: $${acceleratedPayment.toFixed(2)}/month`);
    console.log(`   - Previous Minimum: $${mortgage.minimumPayment.toFixed(2)}`);
    console.log(`   - Added from freed budget: $${freedBudgetAfterPhase1.toFixed(2)}`);
    console.log(`   Duration: ${phase2Months} months`);
    console.log(`   Total Mortgage Interest: $${phase2Interest.toFixed(2)}`);
    
    console.log('\n💰 MORTGAGE COMPARISON:');
    console.log(`   Minimum Payments Only: ${minimumOnlyPayoff.months} months, $${minimumOnlyPayoff.totalInterest.toFixed(2)} interest`);
    console.log(`   With Acceleration: ${phase1Months + phase2Months} months total`);
    console.log(`   Time Saved: ${minimumOnlyPayoff.months - (phase1Months + phase2Months)} months`);
    console.log(`   Interest Saved: $${interestSaved.toFixed(2)}`);
    
    mortgageStrategy = `Accelerated after month ${phase1Months}`;
    
    // Show mortgage milestones
    if (acceleratedPayoff.timeline.length > 0) {
      console.log('\n📍 MORTGAGE MILESTONES:');
      acceleratedPayoff.timeline.forEach(milestone => {
        const percentPaid = ((mortgage.currentAmount - milestone.balance) / mortgage.currentAmount * 100).toFixed(1);
        console.log(`   Month ${milestone.month}: Balance $${milestone.balance.toFixed(2)} (${percentPaid}% paid off)`);
      });
    }
  }
  
  const totalMonths = phase1Months + phase2Months;
  const totalInterest = phase1Interest + phase2Interest;
  
  console.log('\n🎯 =============== COMPLETE TIMELINE SUMMARY ===============');
  console.log(`   📅 TOTAL TIME TO DEBT FREEDOM: ${totalMonths} months (${(totalMonths/12).toFixed(1)} years)`);
  console.log(`   💰 TOTAL INTEREST PAID: $${totalInterest.toFixed(2)}`);
  console.log(`   📊 BREAKDOWN:`);
  console.log(`      Phase 1 (Credit Cards): ${phase1Months} months`);
  console.log(`      Phase 2 (Mortgage): ${phase2Months} months`);
  console.log(`   🚀 STRATEGY: Avalanche → Mortgage Acceleration`);
  
  // Calculate milestone dates
  const today = new Date();
  const creditCardsFreeDate = new Date(today);
  creditCardsFreeDate.setMonth(creditCardsFreeDate.getMonth() + phase1Months);
  const completelyDebtFreeDate = new Date(today);
  completelyDebtFreeDate.setMonth(completelyDebtFreeDate.getMonth() + totalMonths);
  
  console.log(`\n📅 KEY DATES:`);
  console.log(`   Credit Cards Paid Off: ${creditCardsFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
  console.log(`   Completely Debt Free: ${completelyDebtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
  
  return {
    phase1: {
      months: phase1Months,
      debts: [...categorized.highPriority, ...categorized.mediumPriority].map(d => d.name),
      freedBudget: freedBudgetAfterPhase1,
      totalInterest: phase1Interest
    },
    phase2: {
      months: phase2Months,
      debts: categorized.lowPriority.map(d => d.name),
      acceleratedPayment: categorized.lowPriority[0]?.minimumPayment + freedBudgetAfterPhase1 || 0,
      interestSaved,
      totalInterest: phase2Interest
    },
    totalMonths,
    totalInterest,
    mortgageStrategy
  };
};

// Optional: Performance optimization for large debts
const shouldOptimizeDebt = (debt: DebtResponse): boolean => {
  // Don't optimize mortgages
  if (debt.type === 'MORTGAGE') return false;
  
  // Don't optimize very large auto loans
  if (debt.type === 'AUTO_LOAN' && debt.currentAmount > 50000) return false;
  
  // Don't optimize low-rate student loans over $50k
  if (debt.type === 'STUDENT_LOAN' && debt.currentAmount > 50000 && debt.interestRate < 0.05) return false;
  
  // Optimize everything else
  return true;
};



// Enhanced Backward DP with 3-Month Lookahead
const optimizeWithBackwardDP = (debts: DebtResponse[], availableBudget: number) => {
  console.log('\n⏮️ ENHANCED A* DYNAMIC PROGRAMMING WITH 3-MONTH LOOKAHEAD:');
  
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
  const calculateOptimalPath = (initialBalances: number[]): { 
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
      const strategies = getPaymentStrategies(current.balances);
      
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
    const allPlannedPayments: any[] = [];
    
    // 1. Optimize high-priority debts if any
    if (categorized.highPriority.length > 0) {
      console.log(`\n🔥 OPTIMIZING ${categorized.highPriority.length} HIGH-PRIORITY DEBTS with $${budgetAllocation.highBudget} budget`);
      
      const highPriorityResult = optimizeWithBackwardDP(
        categorized.highPriority, 
        budgetAllocation.highBudget
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
    
    // 2. Handle medium-priority debts
    if (categorized.mediumPriority.length > 0) {
      console.log(`\n⚖️ OPTIMIZING ${categorized.mediumPriority.length} MEDIUM-PRIORITY DEBTS with $${budgetAllocation.mediumBudget} budget`);
      
      const mediumPriorityResult = optimizeWithBackwardDP(
        categorized.mediumPriority,
        budgetAllocation.mediumBudget
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
    
    // 3. Low-priority debts get ONLY minimum payments
    categorized.lowPriority.forEach(debt => {
      allPlannedPayments.push({
        debtId: debt.id,
        debtName: debt.name + ' (Minimum Only)',
        amount: debt.minimumPayment,
        minimumPayment: debt.minimumPayment,
        extraAmount: 0,
        priority: 'LOW'
      });
    });
    
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

    const completeDebtPlan = calculateCompleteDebtPlan(
  categorized,
  optimizationResults,
  availableBudget
);
    
   // Enhanced return with complete timeline
return {
  isOptimal: true,
  totalInterestSaved: roundAmount(totalInterestSaved),
  projectedMonths: completeDebtPlan.totalMonths, // CHANGED: Use total months including mortgage
  plannedPayments: allPlannedPayments,
  monthlyProjection: optimizationResults?.projection?.projection?.slice(0, 36) || [],
  
  // NEW: Add complete debt elimination info
  completeDebtPlan: {
    phase1: {
      months: completeDebtPlan.phase1.months,
      description: 'High-priority debt elimination',
      freedBudget: completeDebtPlan.phase1.freedBudget
    },
    phase2: {
      months: completeDebtPlan.phase2.months,
      description: 'Mortgage acceleration with freed budget',
      monthlyPayment: completeDebtPlan.phase2.acceleratedPayment,
      interestSaved: completeDebtPlan.phase2.interestSaved
    },
    totalTimeline: `${completeDebtPlan.totalMonths} months (${(completeDebtPlan.totalMonths/12).toFixed(1)} years)`,
    totalInterest: completeDebtPlan.totalInterest,
    strategy: completeDebtPlan.mortgageStrategy
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