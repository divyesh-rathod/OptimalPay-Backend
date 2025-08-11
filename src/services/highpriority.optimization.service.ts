import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult, StrategyWithLookahead } from '../types/optimization';

const prisma = new PrismaClient();

interface TimelineEntry {
  month: number;
  debtName: string;
  debtType: string;
  originalBalance: number;
  finalPayment: number;
  freedCashFlow: number;
}

interface MonthlyPaymentDetail {
  debtName: string;
  payment: number;
  interest: number;
  principal: number;
  newBalance: number;
}

export const optimizeLowPriorityWithHybridAvalanche = (
  lowPriorityDebts: DebtResponse[],
  minimumBudget: number,           
  startMonth: number,              
  freedUpBudget: number,
  freedUpAvailableMonth: number
) => {
//   console.log(`\n🏠 LOW PRIORITY HYBRID AVALANCHE (Start Month: ${startMonth})`);
//   console.log(`   💰 Minimum Budget: $${minimumBudget}, Freed Budget: $${freedUpBudget} (available month ${freedUpAvailableMonth})`);
  
  if (lowPriorityDebts.length === 0) {
    return {
      months: 0,
      payments: [],
      timeline: [],
      totalInterest: 0,
      projection: null
    };
  }

  let currentBalances = lowPriorityDebts.map(debt => debt.currentAmount);
  let currentBudget = minimumBudget;
  let totalInterestPaid = 0;
  const projection = [];
  const timeline: TimelineEntry[] = [];
  let month = 0;
  const MAX_MONTHS = 500;
  
  // ✅ Track budget increases for NEXT month
  let nextMonthBudgetIncrease = 0;

  while (currentBalances.some(balance => balance > 1) && month < MAX_MONTHS) {
    month++;
    const currentAbsoluteMonth = startMonth + month;
    
    // ✅ Apply budget increases from previous month's debt payoffs
    currentBudget += nextMonthBudgetIncrease;
    nextMonthBudgetIncrease = 0;
    
    // ✅ PERFECT PRECISION: Calculate minimum payments for active debts
    const minimumTotal = lowPriorityDebts
      .map((debt, i) => currentBalances[i] > 1 ? debt.minimumPayment : 0)
      .reduce((sum, payment) => sum + payment, 0);

    // ✅ PERFECT PRECISION: Determine exact budget and strategy based on timing
    let extraBudget = 0;
    let effectiveBudget = minimumTotal;
    let targetIndex = 0;
    let monthlyPayments: number[];
    let strategyName: string;

    if (currentAbsoluteMonth > freedUpAvailableMonth) {
      // ✅ HIGH-PRIORITY DEBTS COMPLETED: Use full optimization
      currentBudget = Math.max(currentBudget, minimumBudget + freedUpBudget);
      effectiveBudget = currentBudget;
      extraBudget = Math.max(0, currentBudget - minimumTotal);
      
      // Find target debt for optimization
      targetIndex = selectTargetByMonthlyInterest(currentBalances, lowPriorityDebts);
      
      // Start with minimum payments
      monthlyPayments = lowPriorityDebts.map((debt, i) => 
        currentBalances[i] > 1 ? debt.minimumPayment : 0
      );
      
      // Add extra budget to target debt
      if (extraBudget > 0 && currentBalances[targetIndex] > 1) {
        const interest = currentBalances[targetIndex] * (lowPriorityDebts[targetIndex].interestRate / 12);
        const totalNeededForPayoff = currentBalances[targetIndex] + interest;
        const maxUsefulExtra = Math.max(0, totalNeededForPayoff - monthlyPayments[targetIndex]);
        
        const extraToApply = Math.min(extraBudget, maxUsefulExtra);
        monthlyPayments[targetIndex] += extraToApply;
        
        // console.log(`   🎯 Month ${currentAbsoluteMonth}: HIGH-PRIORITY COMPLETE! Target ${lowPriorityDebts[targetIndex].name}, Extra: $${extraToApply}`);
      }
      
      strategyName = 'Hybrid Avalanche (Monthly Interest Priority)';
      
    } else {
      // ✅ HIGH-PRIORITY DEBTS STILL RUNNING: MINIMUMS ONLY
      effectiveBudget = minimumTotal;
      extraBudget = 0;
      
      // Use ONLY minimum payments - no optimization yet
      monthlyPayments = lowPriorityDebts.map((debt, i) => 
        currentBalances[i] > 1 ? debt.minimumPayment : 0
      );
      
      strategyName = 'Minimum Payments Only (Waiting for High-Priority Completion)';
      
    //   console.log(`   ⏳ Month ${currentAbsoluteMonth}: HIGH-PRIORITY STILL RUNNING (completes month ${freedUpAvailableMonth}). Using minimums only: $${minimumTotal.toFixed(2)}`);
    }

    // ✅ Process payments and update balances
    let monthlyInterest = 0;
    const monthlyPaymentDetails: MonthlyPaymentDetail[] = [];
    
    currentBalances = currentBalances.map((balance, i) => {
      if (balance <= 1) {
        monthlyPaymentDetails.push({
          debtName: lowPriorityDebts[i].name,
          payment: 0,
          interest: 0,
          principal: 0,
          newBalance: 0
        });
        return 0;
      }

      const payment = monthlyPayments[i];
      const interest = balance * (lowPriorityDebts[i].interestRate / 12);
      
      // ✅ Proper principal calculation
      let principal, newBalance;
      if (payment >= balance + interest) {
        // Full payoff
        principal = balance;
        newBalance = 0;
      } else {
        principal = Math.max(0, payment - interest);
        newBalance = Math.max(0, balance - principal);
      }

      monthlyInterest += interest;

      monthlyPaymentDetails.push({
        debtName: lowPriorityDebts[i].name,
        payment: Math.round(payment * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        principal: Math.round(principal * 100) / 100,
        newBalance: Math.round(newBalance * 100) / 100
      });

      // ✅ Liberation Effect - freed budget available NEXT month
      if (balance > 1 && newBalance <= 1) {
        timeline.push({
          month: currentAbsoluteMonth,
          debtName: lowPriorityDebts[i].name,
          debtType: lowPriorityDebts[i].type,
          originalBalance: lowPriorityDebts[i].currentAmount,
          finalPayment: payment,
          freedCashFlow: lowPriorityDebts[i].minimumPayment
        });
        
        // ✅ Add freed budget for NEXT month
        nextMonthBudgetIncrease += lowPriorityDebts[i].minimumPayment;
        
        // console.log(`   ✅ ${lowPriorityDebts[i].name} PAID OFF at month ${currentAbsoluteMonth}!`);
        // console.log(`   🚀 Budget Liberation: +$${lowPriorityDebts[i].minimumPayment} available from month ${currentAbsoluteMonth + 1}`);
      }

      return newBalance;
    });

    totalInterestPaid += monthlyInterest;
    const totalDebtRemaining = currentBalances.reduce((sum, b) => sum + b, 0);
    
    // ✅ Show actual budget used (sum of actual payments)
    const actualBudgetUsed = monthlyPaymentDetails.reduce((sum, p) => sum + p.payment, 0);

    projection.push({
      month: currentAbsoluteMonth,
      strategy: strategyName, // ✅ Dynamic strategy name
      totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      budgetUsed: Math.round(actualBudgetUsed * 100) / 100,
      availableBudget: Math.round(effectiveBudget * 100) / 100,
      highPriorityCompleted: currentAbsoluteMonth > freedUpAvailableMonth, // ✅ Status flag
      targetDebt: extraBudget > 0 ? lowPriorityDebts[targetIndex].name : 'None (Minimums Only)',
      nextMonthBudgetIncrease: Math.round(nextMonthBudgetIncrease * 100) / 100,
      payments: monthlyPaymentDetails
    });

   
  }

  // ✅ Return comprehensive results
  return {
    months: month,
    payments: month === 0 ? lowPriorityDebts.map(d => d.minimumPayment) : projection[0].payments.map(p => p.payment),
    timeline,
    totalInterest: Math.round(totalInterestPaid * 100) / 100,
    projection: {
      totalMonths: month,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      projection: projection.slice(0, 600),
      liberationSequence: timeline
    }
  };
};

const selectTargetByMonthlyInterest = (
  currentBalances: number[],
  debts: DebtResponse[]
) => {
  let bestTargetIndex = 0;
  let bestMonthlyInterest = -1;
  let bestInterestRate = -1;
  let foundAnyActive = false;

  for (let i = 0; i < currentBalances.length; i++) {
    const balance = currentBalances[i];
    
    // Skip inactive debts
    if (balance <= 1) continue;
    
    const monthlyInterest = balance * (debts[i].interestRate / 12);
    const interestRate = debts[i].interestRate;
    
    // First active debt found
    if (!foundAnyActive) {
      bestTargetIndex = i;
      bestMonthlyInterest = monthlyInterest;
      bestInterestRate = interestRate;
      foundAnyActive = true;
      continue;
    }
    
    // Compare with current best using SAME LOGIC as before
    const monthlyInterestDiff = monthlyInterest - bestMonthlyInterest;
    
    // If monthly interest difference is less than $5, use interest rate
    if (Math.abs(monthlyInterestDiff) < 5) {
      if (interestRate > bestInterestRate) {
        bestTargetIndex = i;
        bestMonthlyInterest = monthlyInterest;
        bestInterestRate = interestRate;
      }
    } else if (monthlyInterest > bestMonthlyInterest) {
      bestTargetIndex = i;
      bestMonthlyInterest = monthlyInterest;
      bestInterestRate = interestRate;
    }
  }

  return bestTargetIndex;
};