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
  console.log(`\n🏠 LOW PRIORITY HYBRID AVALANCHE (Start Month: ${startMonth})`);
  console.log(`   💰 Minimum Budget: $${minimumBudget}, Freed Budget: $${freedUpBudget} (available month ${freedUpAvailableMonth})`);
  
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
  
  // ✅ FIX: Track budget increases for NEXT month
  let nextMonthBudgetIncrease = 0;

  while (currentBalances.some(balance => balance > 1) && month < MAX_MONTHS) {
    month++;
    const currentAbsoluteMonth = startMonth + month;
    
    // ✅ FIX: Apply budget increases from previous month's debt payoffs
    currentBudget += nextMonthBudgetIncrease;
    nextMonthBudgetIncrease = 0; // Reset for this month
    
    // Update budget when external freed budget becomes available
    if (currentAbsoluteMonth >= freedUpAvailableMonth) {
      currentBudget = Math.max(currentBudget, minimumBudget + freedUpBudget);
    }
    
    // Find target debt: highest monthly interest
    const targetIndex = selectTargetByMonthlyInterest(currentBalances, lowPriorityDebts);
    
    // Calculate minimum payments for active debts only
    const minimumTotal = lowPriorityDebts
      .map((debt, i) => currentBalances[i] > 1 ? debt.minimumPayment : 0)
      .reduce((sum, payment) => sum + payment, 0);
    
    // Calculate available extra budget
    const extraBudget = Math.max(0, currentBudget - minimumTotal);
    
    // Start with minimum payments
    const monthlyPayments = lowPriorityDebts.map((debt, i) => 
      currentBalances[i] > 1 ? debt.minimumPayment : 0
    );
    
    // ✅ FIX: Distribute extra budget to target debt (allow full payoff)
    if (extraBudget > 0 && currentBalances[targetIndex] > 1) {
      const interest = currentBalances[targetIndex] * (lowPriorityDebts[targetIndex].interestRate / 12);
      const totalNeededForPayoff = currentBalances[targetIndex] + interest;
      const maxUsefulExtra = Math.max(0, totalNeededForPayoff - monthlyPayments[targetIndex]);
      
      const extraToApply = Math.min(extraBudget, maxUsefulExtra);
      monthlyPayments[targetIndex] += extraToApply;
      
      console.log(`   🎯 Month ${currentAbsoluteMonth}: Target ${lowPriorityDebts[targetIndex].name}, Extra: $${extraToApply}`);
    }

    // Process payments and update balances
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
      
      // ✅ FIX: Proper principal calculation
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

      // ✅ FIX: Liberation Effect - freed budget available NEXT month
      if (balance > 1 && newBalance <= 1) {
        timeline.push({
          month: currentAbsoluteMonth,
          debtName: lowPriorityDebts[i].name,
          debtType: lowPriorityDebts[i].type,
          originalBalance: lowPriorityDebts[i].currentAmount,
          finalPayment: payment,
          freedCashFlow: lowPriorityDebts[i].minimumPayment
        });
        
        // ✅ FIX: Add freed budget for NEXT month
        nextMonthBudgetIncrease += lowPriorityDebts[i].minimumPayment;
        
        console.log(`   ✅ ${lowPriorityDebts[i].name} PAID OFF at month ${currentAbsoluteMonth}!`);
        console.log(`   🚀 Budget Liberation: +$${lowPriorityDebts[i].minimumPayment} available from month ${currentAbsoluteMonth + 1}`);
      }

      return newBalance;
    });

    totalInterestPaid += monthlyInterest;
    const totalDebtRemaining = currentBalances.reduce((sum, b) => sum + b, 0);
    
    // ✅ FIX: Show actual budget used (sum of actual payments)
    const actualBudgetUsed = monthlyPaymentDetails.reduce((sum, p) => sum + p.payment, 0);

    projection.push({
      month: currentAbsoluteMonth,
      strategy: 'Hybrid Avalanche (Monthly Interest Priority)',
      totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      budgetUsed: Math.round(actualBudgetUsed * 100) / 100, // ✅ FIX: Actual budget used
      availableBudget: Math.round(currentBudget * 100) / 100, // ✅ ADD: Available budget for clarity
      targetDebt: lowPriorityDebts[targetIndex].name,
      nextMonthBudgetIncrease: Math.round(nextMonthBudgetIncrease * 100) / 100, // ✅ ADD: Show upcoming budget increase
      payments: monthlyPaymentDetails
    });

    // Log progress every 12 months or major events
    if (month % 12 === 0 || nextMonthBudgetIncrease > 0) {
      console.log(`   Month ${currentAbsoluteMonth}: Debt $${totalDebtRemaining.toFixed(2)}, Budget Used: $${actualBudgetUsed.toFixed(2)}/$${currentBudget.toFixed(2)}`);
      if (nextMonthBudgetIncrease > 0) {
        console.log(`   📈 Next month budget increase: +$${nextMonthBudgetIncrease} → $${(currentBudget + nextMonthBudgetIncrease).toFixed(2)}`);
      }
    }

    if (totalDebtRemaining <= 1) {
      console.log(`🎉 All low-priority debts eliminated in ${month} months!`);
      break;
    }
  }

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
  const activeDebts = currentBalances
    .map((balance, index) => {
      if (balance <= 1) return null;
      
      const monthlyInterest = balance * (debts[index].interestRate / 12);
      return {
        index,
        balance,
        monthlyInterest,
        interestRate: debts[index].interestRate,
        debtName: debts[index].name
      };
    })
    .filter(debt => debt !== null);

  if (activeDebts.length === 0) return 0;

  // Sort by monthly interest (primary), then by interest rate (tie-breaker)
  const sortedDebts = activeDebts.sort((a, b) => {
    const monthlyInterestDiff = b.monthlyInterest - a.monthlyInterest;
    
    // If monthly interest difference is less than $5, use interest rate
    if (Math.abs(monthlyInterestDiff) < 5) {
      return b.interestRate - a.interestRate;
    }
    
    return monthlyInterestDiff;
  });

  const target = sortedDebts[0];
  console.log(`   🎯 Target: ${target.debtName} ($${target.monthlyInterest.toFixed(2)}/mo interest)`);
  
  return target.index;
};