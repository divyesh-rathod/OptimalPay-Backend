import { PrismaClient } from '@prisma/client';
import { DebtResponse } from '../types/debts';
import { OptimizationResult,StrategyWithLookahead } from '../types/optimization';

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

interface ProjectionEntry {
  month: number;
  strategy: string;
  totalDebtRemaining: number;
  totalInterestPaid: number;
  budgetUsed: number;
  targetDebt?: string;
  payments: MonthlyPaymentDetail[];
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

// const optimizeHighPriorityWithCompoundLiberation = (
//   highPriorityDebts: DebtResponse[],
//   availableBudget: number,
//   startMonth: number = 0,
//   freedUpBudget: number = 0,
//   freedUpAvailableMonth: number = 0
// ) => {
//   console.log(`\n🚀 HIGH PRIORITY COMPOUND LIBERATION OPTIMIZATION`);
//   console.log(`   💰 Budget: $${availableBudget}, Freed: $${freedUpBudget} (month ${freedUpAvailableMonth})`);
//   console.log(`   🎯 Testing ${highPriorityDebts.length} debt sequences for optimal cascade...`);
  
//   if (highPriorityDebts.length === 0) {
//     return {
//       months: 0,
//       payments: [],
//       timeline: [],
//       totalInterest: 0,
//       projection: null
//     };
//   }

//   // Step 1: Test each debt as first target and simulate complete cascade
//   const cascadeResults = highPriorityDebts.map((targetDebt, targetIndex) => {
//     console.log(`\n   🔍 Testing cascade starting with: ${targetDebt.name}`);
//     return simulateCompoundLiberationCascade(
//       targetIndex,
//       highPriorityDebts,
//       availableBudget,
//       freedUpBudget,
//       freedUpAvailableMonth,
//       startMonth
//     );
//   });

//   // Step 2: Choose the optimal cascade sequence
//   const optimalCascade = cascadeResults.reduce((best, current) => {
//     if (current.totalMonths < best.totalMonths) return current;
//     if (current.totalMonths === best.totalMonths && current.totalInterest < best.totalInterest) return current;
//     return best;
//   });

//   console.log(`\n🏆 OPTIMAL CASCADE SEQUENCE:`);
//   console.log(`   📅 Total Months: ${optimalCascade.totalMonths}`);
//   console.log(`   💰 Total Interest: $${optimalCascade.totalInterest.toFixed(2)}`);
//   console.log(`   🎯 Sequence: ${optimalCascade.sequence.map(s => s.debtName).join(' → ')}`);

//   // Step 3: Generate execution plan for first month
//   return generateCompoundLiberationPlan(optimalCascade, highPriorityDebts);
// };

// // const simulateCompoundLiberationCascade = (
// //   firstTargetIndex: number,
// //   debts: DebtResponse[],
// //   baseBudget: number,
// //   freedUpBudget: number,
// //   freedUpAvailableMonth: number,
// //   startMonth: number
// // ) => {
// //   let currentBalances = debts.map(debt => debt.currentAmount);
// //   let totalInterestPaid = 0;
// //   let month = 0;
// //   const sequence = [];
// //   const timeline = [];
// //   let currentAvailableBudget = baseBudget;
  
// //   // Track which debts are still active
// //   let activeDebtIndices = debts.map((_, index) => index);
  
// //   while (activeDebtIndices.length > 0 && month < 200) {
// //     month++;
// //     const absoluteMonth = startMonth + month;
    
// //     // Update budget when freed budget becomes available
// //     if (absoluteMonth >= freedUpAvailableMonth) {
// //       currentAvailableBudget = baseBudget + freedUpBudget;
// //     }
    
// //     // Calculate current target using multi-factor hybrid avalanche
// //     const targetIndex = selectOptimalTarget(
// //       activeDebtIndices,
// //       currentBalances,
// //       debts,
// //       currentAvailableBudget
// //     );
    
// //     // Calculate payments for this month
// //     const monthlyPayments = debts.map(debt => debt.minimumPayment);
// //     const minimumTotal = activeDebtIndices.reduce((sum, i) => sum + debts[i].minimumPayment, 0);
// //     const extraBudget = Math.max(0, currentAvailableBudget - minimumTotal);
    
// //     // Apply extra budget to target debt
// //     if (extraBudget > 0 && currentBalances[targetIndex] > 1) {
// //       const maxExtra = Math.min(extraBudget, currentBalances[targetIndex]);
// //       monthlyPayments[targetIndex] += maxExtra;
// //     }
    
// //     // Process payments and update balances
// //     let monthlyInterest = 0;
// //     const completedDebts = [];
    
// //     activeDebtIndices.forEach(debtIndex => {
// //       const balance = currentBalances[debtIndex];
// //       if (balance <= 1) return;
      
// //       const payment = monthlyPayments[debtIndex];
// //       const interest = balance * (debts[debtIndex].interestRate / 12);
// //       const principal = Math.min(payment - interest, balance);
// //       const newBalance = Math.max(0, balance - principal);
      
// //       monthlyInterest += interest;
// //       currentBalances[debtIndex] = newBalance;
      
// //       // Check if debt is completed
// //       if (balance > 1 && newBalance <= 1) {
// //         completedDebts.push({
// //           index: debtIndex,
// //           name: debts[debtIndex].name,
// //           freedCashFlow: debts[debtIndex].minimumPayment,
// //           month: absoluteMonth
// //         });
// //       }
// //     });
    
// //     totalInterestPaid += monthlyInterest;
    
// //     // Handle completed debts - COMPOUND LIBERATION EFFECT!
// //     if (completedDebts.length > 0) {
// //       completedDebts.forEach(completed => {
// //         sequence.push({
// //           month: absoluteMonth,
// //           debtIndex: completed.index,
// //           debtName: completed.name,
// //           freedCashFlow: completed.freedCashFlow
// //         });
        
// //         timeline.push({
// //           month: absoluteMonth,
// //           debtName: completed.name,
// //           freedCashFlow: completed.freedCashFlow
// //         });
        
// //         // Remove from active debts
// //         activeDebtIndices = activeDebtIndices.filter(i => i !== completed.index);
        
// //         // ADD FREED CASH FLOW TO AVAILABLE BUDGET - COMPOUND EFFECT!
// //         currentAvailableBudget += completed.freedCashFlow;
        
// //         console.log(`   ✅ ${completed.name} PAID OFF! Budget increased by $${completed.freedCashFlow} → New budget: $${currentAvailableBudget}`);
// //       });
// //     }
    
// //     // Check if all debts are paid off
// //     if (activeDebtIndices.length === 0) {
// //       console.log(`   🎉 All high-priority debts eliminated in ${month} months!`);
// //       break;
// //     }
// //   }
  
// //   return {
// //     firstTargetIndex,
// //     totalMonths: month,
// //     totalInterest: totalInterestPaid,
// //     sequence,
// //     timeline,
// //     finalBudgetFreed: currentAvailableBudget - baseBudget - freedUpBudget
// //   };
// // };

// const selectOptimalTarget = (
//   activeIndices: number[],
//   currentBalances: number[],
//   debts: DebtResponse[],
//   availableBudget: number
// ) => {
//   const minimumTotal = activeIndices.reduce((sum, i) => sum + debts[i].minimumPayment, 0);
//   const extraBudget = Math.max(0, availableBudget - minimumTotal);
  
//   if (extraBudget <= 0) {
//     // No extra budget - just return first active debt
//     return activeIndices[0];
//   }
  
//   // Multi-factor hybrid avalanche scoring
//   const scoredDebts = activeIndices.map(debtIndex => {
//     const debt = debts[debtIndex];
//     const balance = currentBalances[debtIndex];
//     const monthlyInterest = balance * (debt.interestRate / 12);
//     const maxPayment = Math.min(extraBudget + debt.minimumPayment, balance + monthlyInterest);
//     const monthsToPayoff = balance / Math.max(1, maxPayment - monthlyInterest);
    
//     // MULTI-FACTOR SCORING SYSTEM
//     const interestRateScore = debt.interestRate * 1000;           // Weight: 1000 (primary)
//     const monthlyInterestScore = monthlyInterest * 5;             // Weight: 5 (secondary)
//     const cashFlowScore = monthsToPayoff <= 12 ? (debt.minimumPayment * 2) : 0; // Weight: 2 (liberation bonus)
//     const balanceEfficiencyScore = (balance / debt.minimumPayment) * 0.1; // Weight: 0.1 (efficiency)
    
//     // COMPOUND LIBERATION EFFECT: Simulate freed budget impact
//     const compoundScore = calculateCompoundLiberationScore(
//       debtIndex,
//       activeIndices,
//       currentBalances,
//       debts,
//       debt.minimumPayment
//     );
    
//     const totalScore = interestRateScore + monthlyInterestScore + cashFlowScore + balanceEfficiencyScore + compoundScore;
    
//     return {
//       index: debtIndex,
//       debt,
//       balance,
//       monthlyInterest,
//       monthsToPayoff,
//       totalScore,
//       components: {
//         interestRate: interestRateScore,
//         monthlyInterest: monthlyInterestScore,
//         cashFlow: cashFlowScore,
//         efficiency: balanceEfficiencyScore,
//         compound: compoundScore
//       }
//     };
//   }).sort((a, b) => b.totalScore - a.totalScore);
  
//   const winner = scoredDebts[0];
//   console.log(`     🎯 Target: ${winner.debt.name} (Score: ${winner.totalScore.toFixed(1)}, Payoff: ${winner.monthsToPayoff.toFixed(1)}mo)`);
  
//   return winner.index;
// };

// const calculateCompoundLiberationScore = (
//   targetIndex: number,
//   activeIndices: number[],
//   currentBalances: number[],
//   debts: DebtResponse[],
//   freedCashFlow: number
// ) => {
//   // Simulate what happens when target debt is paid off
//   const remainingIndices = activeIndices.filter(i => i !== targetIndex);
//   if (remainingIndices.length === 0) return 0;
  
//   let totalAcceleration = 0;
  
//   // Calculate acceleration effect on each remaining debt
//   remainingIndices.forEach(debtIndex => {
//     const balance = currentBalances[debtIndex];
//     const debt = debts[debtIndex];
//     const monthlyInterest = balance * (debt.interestRate / 12);
    
//     // Normal payoff time (minimum payments only)
//     const normalPayoffMonths = balance / Math.max(1, debt.minimumPayment - monthlyInterest);
    
//     // Accelerated payoff time (with freed cash flow)
//     const acceleratedPayment = debt.minimumPayment + (freedCashFlow * 0.7); // 70% of freed budget
//     const acceleratedPayoffMonths = balance / Math.max(1, acceleratedPayment - monthlyInterest);
    
//     // Calculate months saved
//     const monthsSaved = Math.max(0, normalPayoffMonths - acceleratedPayoffMonths);
    
//     // Weight by debt size and interest rate
//     const liberationWeight = (balance / 1000) * debt.interestRate * 100;
//     totalAcceleration += monthsSaved * liberationWeight;
//   });
  
//   return totalAcceleration; // Higher score = better compound effect
// };

// const generateCompoundLiberationPlan = (optimalCascade: any, debts: DebtResponse[]) => {
//   // Generate detailed month-by-month execution plan
//   console.log(`\n📋 GENERATING COMPOUND LIBERATION EXECUTION PLAN...`);
  
//   const executionPlan = [];
//   let currentBalances = debts.map(debt => debt.currentAmount);
//   let currentBudget = optimalCascade.initialBudget;
//   let totalInterest = 0;
  
//   for (let month = 1; month <= optimalCascade.totalMonths; month++) {
//     // Determine target debt for this month
//     const activeDebts = currentBalances
//       .map((balance, index) => ({ balance, index }))
//       .filter(debt => debt.balance > 1);
    
//     if (activeDebts.length === 0) break;
    
//     const targetIndex = selectOptimalTarget(
//       activeDebts.map(d => d.index),
//       currentBalances,
//       debts,
//       currentBudget
//     );
    
//     // Calculate payments
//     const monthlyPayments = debts.map(debt => debt.minimumPayment);
//     const minimumTotal = activeDebts.reduce((sum, debt) => sum + debts[debt.index].minimumPayment, 0);
//     const extraBudget = Math.max(0, currentBudget - minimumTotal);
    
//     if (extraBudget > 0) {
//       monthlyPayments[targetIndex] += Math.min(extraBudget, currentBalances[targetIndex]);
//     }
    
//     // Process payments
//     let monthlyInterest = 0;
//     const paymentDetails = [];
    
//     currentBalances = currentBalances.map((balance, i) => {
//       if (balance <= 1) {
//         paymentDetails.push({
//           debtName: debts[i].name,
//           payment: 0,
//           interest: 0,
//           principal: 0,
//           newBalance: 0
//         });
//         return 0;
//       }
      
//       const payment = monthlyPayments[i];
//       const interest = balance * (debts[i].interestRate / 12);
//       const principal = Math.min(payment - interest, balance);
//       const newBalance = Math.max(0, balance - principal);
      
//       monthlyInterest += interest;
      
//       paymentDetails.push({
//         debtName: debts[i].name,
//         payment: Math.round(payment * 100) / 100,
//         interest: Math.round(interest * 100) / 100,
//         principal: Math.round(principal * 100) / 100,
//         newBalance: Math.round(newBalance * 100) / 100
//       });
      
//       // COMPOUND LIBERATION: When debt is paid off, add to budget
//       if (balance > 1 && newBalance <= 1) {
//         currentBudget += debts[i].minimumPayment;
//         console.log(`   🚀 LIBERATION: ${debts[i].name} paid off! Budget increased by $${debts[i].minimumPayment} → $${currentBudget}`);
//       }
      
//       return newBalance;
//     });
    
//     totalInterest += monthlyInterest;
    
//     executionPlan.push({
//       month: startMonth + month,
//       strategy: `Compound Liberation (Target: ${debts[targetIndex].name})`,
//       totalDebtRemaining: Math.round(currentBalances.reduce((sum, b) => sum + b, 0) * 100) / 100,
//       totalInterestPaid: Math.round(totalInterest * 100) / 100,
//       budgetUsed: currentBudget,
//       payments: paymentDetails
//     });
//   }
  
//   console.log(`\n📊 COMPOUND LIBERATION FINAL RESULTS:`);
//   console.log(`   🎯 Completion Time: ${executionPlan.length} months`);
//   console.log(`   💰 Total Interest: $${totalInterest.toFixed(2)}`);
//   console.log(`   🚀 Final Freed Budget: $${currentBudget - availableBudget - freedUpBudget}`);
  
//   return {
//     months: executionPlan.length,
//     payments: executionPlan.length > 0 ? executionPlan[0].payments.map(p => p.payment) : debts.map(d => d.minimumPayment),
//     timeline: optimalCascade.timeline,
//     totalInterest: Math.round(totalInterest * 100) / 100,
//     projection: {
//       totalMonths: executionPlan.length,
//       totalInterestPaid: Math.round(totalInterest * 100) / 100,
//       projection: executionPlan,
//       cascadeSequence: optimalCascade.sequence,
//       compoundEffect: {
//         totalFreedCashFlow: currentBudget - availableBudget - freedUpBudget,
//         accelerationEffect: optimalCascade.totalAcceleration
//       }
//     }
//   };
// };

// const simulateCompoundLiberationCascade = (
//   firstTargetIndex: number,
//   debts: DebtResponse[],
//   baseBudget: number,
//   freedUpBudget: number,
//   freedUpAvailableMonth: number,
//   startMonth: number
// ) => {
//   let simulatedBalances = debts.map(debt => debt.currentAmount);
//   let simulatedBudget = baseBudget;
//   let totalSimulatedInterest = 0;
//   let simulatedMonth = 0;
//   const sequence = [];
//   const timeline = [];
//   let totalAcceleration = 0;
  
//   // Track remaining debts
//   let remainingIndices = debts.map((_, index) => index);
  
//   while (remainingIndices.length > 0 && simulatedMonth < 150) {
//     simulatedMonth++;
//     const absoluteMonth = startMonth + simulatedMonth;
    
//     // Update budget when freed budget becomes available
//     if (absoluteMonth >= freedUpAvailableMonth) {
//       simulatedBudget = baseBudget + freedUpBudget;
//     }
    
//     // For first target, use specified index; for subsequent, use multi-factor selection
//     const targetIndex = simulatedMonth <= 24 && remainingIndices.includes(firstTargetIndex)
//       ? firstTargetIndex
//       : selectOptimalTarget(remainingIndices, simulatedBalances, debts, simulatedBudget);
    
//     // Calculate minimum payments for remaining debts
//     const minimumTotal = remainingIndices.reduce((sum, i) => sum + debts[i].minimumPayment, 0);
//     const extraBudget = Math.max(0, simulatedBudget - minimumTotal);
    
//     // Apply avalanche strategy
//     const payments = debts.map(debt => debt.minimumPayment);
//     if (extraBudget > 0 && simulatedBalances[targetIndex] > 1) {
//       payments[targetIndex] += Math.min(extraBudget, simulatedBalances[targetIndex]);
//     }
    
//     // Process payments
//     let monthlyInterest = 0;
//     const completedThisMonth = [];
    
//     simulatedBalances = simulatedBalances.map((balance, i) => {
//       if (balance <= 1) return 0;
      
//       const payment = payments[i];
//       const interest = balance * (debts[i].interestRate / 12);
//       const principal = Math.min(payment - interest, balance);
//       const newBalance = Math.max(0, balance - principal);
      
//       monthlyInterest += interest;
      
//       // Track completed debts
//       if (balance > 1 && newBalance <= 1) {
//         completedThisMonth.push({
//           index: i,
//           name: debts[i].name,
//           freedCashFlow: debts[i].minimumPayment
//         });
//       }
      
//       return newBalance;
//     });
    
//     totalSimulatedInterest += monthlyInterest;
    
//     // COMPOUND LIBERATION: Add freed cash flow to budget
//     if (completedThisMonth.length > 0) {
//       completedThisMonth.forEach(completed => {
//         simulatedBudget += completed.freedCashFlow;
//         remainingIndices = remainingIndices.filter(i => i !== completed.index);
        
//         timeline.push({
//           month: absoluteMonth,
//           debtName: completed.name,
//           freedCashFlow: completed.freedCashFlow
//         });
        
//         // Calculate acceleration effect
//         const remainingBalance = remainingIndices.reduce((sum, i) => sum + simulatedBalances[i], 0);
//         if (remainingBalance > 0) {
//           const accelerationFactor = completed.freedCashFlow / Math.max(1, remainingBalance / 1000);
//           totalAcceleration += accelerationFactor;
//         }
//       });
//     }
//   }
  
//   return {
//     firstTargetIndex,
//     totalMonths: simulatedMonth,
//     totalInterest: totalSimulatedInterest,
//     sequence: timeline,
//     timeline,
//     totalAcceleration,
//     finalFreedBudget: simulatedBudget - baseBudget - freedUpBudget
//   };
// };





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

  while (currentBalances.some(balance => balance > 1) && month < MAX_MONTHS) {
    month++;
    const currentAbsoluteMonth = startMonth + month;
    
    // Update budget when freed budget becomes available
    if (currentAbsoluteMonth >= freedUpAvailableMonth) {
      currentBudget = minimumBudget + freedUpBudget;
    }
    
    // Find target debt: highest monthly interest
    const targetIndex = selectTargetByMonthlyInterest(currentBalances, lowPriorityDebts);
    
    // Calculate payments: minimums + all extra to target
    const monthlyPayments = lowPriorityDebts.map(debt => debt.minimumPayment);
    const minimumTotal = lowPriorityDebts
      .map((debt, i) => currentBalances[i] > 1 ? debt.minimumPayment : 0)
      .reduce((sum, payment) => sum + payment, 0);
    
    const extraBudget = Math.max(0, currentBudget - minimumTotal);
    
    // All extra budget goes to target debt
    if (extraBudget > 0 && currentBalances[targetIndex] > 1) {
      const maxExtra = Math.min(extraBudget, currentBalances[targetIndex]);
      monthlyPayments[targetIndex] += maxExtra;
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
      const principal = Math.min(payment - interest, balance);
      const newBalance = Math.max(0, balance - principal);

      monthlyInterest += interest;

      monthlyPaymentDetails.push({
        debtName: lowPriorityDebts[i].name,
        payment: Math.round(payment * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        principal: Math.round(principal * 100) / 100,
        newBalance: Math.round(newBalance * 100) / 100
      });

      // Liberation Effect: When debt is paid off, budget increases
      if (balance > 1 && newBalance <= 1) {
        timeline.push({
          month: currentAbsoluteMonth,
          debtName: lowPriorityDebts[i].name,
          debtType: lowPriorityDebts[i].type,
          originalBalance: lowPriorityDebts[i].currentAmount,
          finalPayment: payment,
          freedCashFlow: lowPriorityDebts[i].minimumPayment
        });
        
        // Add freed budget to current budget for immediate effect
        currentBudget += lowPriorityDebts[i].minimumPayment;
        
        console.log(`   ✅ ${lowPriorityDebts[i].name} PAID OFF at month ${currentAbsoluteMonth}!`);
        console.log(`   🚀 Budget Liberation: +$${lowPriorityDebts[i].minimumPayment} → New budget: $${currentBudget}`);
      }

      return newBalance;
    });

    totalInterestPaid += monthlyInterest;
    const totalDebtRemaining = currentBalances.reduce((sum, b) => sum + b, 0);

    projection.push({
      month: currentAbsoluteMonth,
      strategy: 'Hybrid Avalanche (Monthly Interest Priority)',
      totalDebtRemaining: Math.round(totalDebtRemaining * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      budgetUsed: currentBudget,
      targetDebt: lowPriorityDebts[targetIndex].name,
      payments: monthlyPaymentDetails
    });

    // Log progress every 12 months
    if (month % 12 === 0) {
      console.log(`   Month ${currentAbsoluteMonth}: Debt $${totalDebtRemaining.toFixed(2)}, Budget $${currentBudget}, Target: ${lowPriorityDebts[targetIndex].name}`);
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
      projection: projection.slice(0, 60),
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
  console.log(`     🎯 Target: ${target.debtName} ($${target.monthlyInterest.toFixed(2)}/mo interest)`);
  
  return target.index;
};