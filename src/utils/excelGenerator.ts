// src/utils/excelGenerator.ts
import { Workbook } from 'exceljs';
import { DebtResponse } from '../types/debts';

interface OptimizationExcelData {
  userInfo: {
    userId: string;
    monthlyIncome: number;
    monthlyExpenses: number;
    availableBudget: number;
    generatedAt: Date;
  };
  debts: DebtResponse[];
  completeProjection: {
    totalMonths: number;
    totalInterestPaid: number;
    projection: Array<{
      month: number;
      strategy: string;
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
  };
  // Hidden from user: categorization and budget allocation removed
}

export const generateOptimizationExcel = async (data: OptimizationExcelData): Promise<Buffer> => {
  const workbook = new Workbook();
  
  // Set workbook properties
  workbook.creator = 'OptimalPay';
  workbook.lastModifiedBy = 'OptimalPay';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 📊 SUMMARY SHEET
  const summarySheet = workbook.addWorksheet('Summary', {
    headerFooter: { firstHeader: "OptimalPay - Debt Optimization Summary" }
  });

  // Summary Sheet Header
  summarySheet.mergeCells('A1:F1');
  const headerCell = summarySheet.getCell('A1');
  headerCell.value = '💰 OptimalPay - Your Debt Freedom Plan';
  headerCell.font = { size: 16, bold: true, color: { argb: 'FF2E8B57' } };
  headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };

  // Financial Overview Section
  let currentRow = 3;
  summarySheet.getCell(`A${currentRow}`).value = '💼 Your Financial Overview';
  summarySheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  currentRow++;

  summarySheet.getCell(`A${currentRow}`).value = 'Monthly Income:';
  summarySheet.getCell(`B${currentRow}`).value = `$${data.userInfo.monthlyIncome.toFixed(2)}`;
  currentRow++;

  summarySheet.getCell(`A${currentRow}`).value = 'Monthly Expenses:';
  summarySheet.getCell(`B${currentRow}`).value = `$${data.userInfo.monthlyExpenses.toFixed(2)}`;
  currentRow++;

  summarySheet.getCell(`A${currentRow}`).value = 'Available for Debt Payment:';
  summarySheet.getCell(`B${currentRow}`).value = `$${data.userInfo.availableBudget.toFixed(2)}`;
  summarySheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FF008000' } };
  currentRow += 2;

  // Debt Freedom Results Section
  summarySheet.getCell(`A${currentRow}`).value = '🎯 Your Debt Freedom Timeline';
  summarySheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  currentRow++;

  summarySheet.getCell(`A${currentRow}`).value = 'Months to Debt Freedom:';
  summarySheet.getCell(`B${currentRow}`).value = data.completeProjection.totalMonths;
  summarySheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FF4169E1' } };
  currentRow++;

  summarySheet.getCell(`A${currentRow}`).value = 'Total Interest You\'ll Pay:';
  summarySheet.getCell(`B${currentRow}`).value = `$${data.completeProjection.totalInterestPaid.toFixed(2)}`;
  summarySheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FFDC143C' } };
  currentRow++;

  const totalCurrentDebt = data.debts.reduce((sum, debt) => sum + debt.currentAmount, 0);
  summarySheet.getCell(`A${currentRow}`).value = 'Total Current Debt:';
  summarySheet.getCell(`B${currentRow}`).value = `$${totalCurrentDebt.toFixed(2)}`;
  currentRow++;

  const totalCost = totalCurrentDebt + data.completeProjection.totalInterestPaid;
  summarySheet.getCell(`A${currentRow}`).value = 'Total You\'ll Pay (Principal + Interest):';
  summarySheet.getCell(`B${currentRow}`).value = `$${totalCost.toFixed(2)}`;
  currentRow += 2;

  summarySheet.getCell(`A${currentRow}`).value = 'Report Generated:';
  summarySheet.getCell(`B${currentRow}`).value = data.userInfo.generatedAt.toLocaleString();
  summarySheet.getCell(`B${currentRow}`).font = { italic: true };

  // Auto-fit columns
  summarySheet.columns = [
    { width: 25 },
    { width: 20 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 }
  ];

  // 📋 DEBT DETAILS SHEET
  const debtSheet = workbook.addWorksheet('Your Debts');

  // Headers - removed Priority Category
  const debtHeaders = [
    'Debt Name', 'Type', 'Current Amount', 'Interest Rate', 'Minimum Payment', 
    'Original Amount', 'Remaining Tenure'
  ];

  debtSheet.addRow(debtHeaders);
  const debtHeaderRow = debtSheet.getRow(1);
  debtHeaderRow.font = { bold: true };
  debtHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } };

  // Add debt data - removed priority categorization
  data.debts.forEach(debt => {
    debtSheet.addRow([
      debt.name,
      debt.type,
      debt.currentAmount,
      `${(debt.interestRate * 100).toFixed(2)}%`,
      debt.minimumPayment,
      debt.originalAmount,
      debt.remainingTenure || 'N/A'
    ]);
  });

  // Format debt sheet columns
  debtSheet.columns = [
    { width: 20 }, // Debt Name
    { width: 15 }, // Type
    { width: 15 }, // Current Amount
    { width: 12 }, // Interest Rate
    { width: 15 }, // Minimum Payment
    { width: 15 }, // Original Amount
    { width: 15 }  // Remaining Tenure
  ];

  // 📅 MONTHLY PROJECTION SHEET
  const projectionSheet = workbook.addWorksheet('Payment Timeline');

  // Projection headers - removed Strategy column
  const projectionHeaders = [
    'Month', 'Total Debt Remaining', 'Total Interest Paid'
  ];

  // Add debt-specific payment columns
  data.debts.forEach(debt => {
    projectionHeaders.push(`${debt.name} - Payment`);
    projectionHeaders.push(`${debt.name} - Interest`);
    projectionHeaders.push(`${debt.name} - Principal`);
    projectionHeaders.push(`${debt.name} - New Balance`);
  });

  projectionSheet.addRow(projectionHeaders);
  const projectionHeaderRow = projectionSheet.getRow(1);
  projectionHeaderRow.font = { bold: true };
  projectionHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4B5' } };

  // Add projection data - using completeProjection
  data.completeProjection.projection.forEach((monthData: any) => {
    const row = [
      monthData.month,
      monthData.totalDebtRemaining,
      monthData.totalInterestPaid
    ];

    // Add payment details for each debt
    data.debts.forEach(debt => {
      const paymentDetail = monthData.payments.find((p: any) => p.debtName === debt.name) || {
        payment: 0, interest: 0, principal: 0, newBalance: 0
      };
      
      row.push(paymentDetail.payment);
      row.push(paymentDetail.interest);
      row.push(paymentDetail.principal);
      row.push(paymentDetail.newBalance);
    });

    const addedRow = projectionSheet.addRow(row);
    
    // Highlight completed debts (when new balance is 0) in green
    let colIndex = 4; // Start after the first 3 columns (Month, Total Debt, Total Interest)
    data.debts.forEach(debt => {
      const paymentDetail = monthData.payments.find((p: any) => p.debtName === debt.name);
      if (paymentDetail && paymentDetail.newBalance <= 0.01) {
        // Highlight all 4 columns for this debt (Payment, Interest, Principal, New Balance)
        for (let i = 0; i < 4; i++) {
          const cell = addedRow.getCell(colIndex + i);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } }; // Light green
          if (i === 3) { // New Balance column
            cell.font = { bold: true, color: { argb: 'FF006400' } }; // Dark green text
          }
        }
      }
      colIndex += 4; // Move to next debt's columns
    });
  });

  // Format projection sheet - set column widths
  const columnWidths = [8, 18, 18]; // Month, Total Debt, Total Interest
  data.debts.forEach(() => {
    columnWidths.push(12, 10, 12, 12); // Payment, Interest, Principal, Balance for each debt
  });

  projectionSheet.columns = columnWidths.map(width => ({ width }));

  // Add conditional formatting for debt remaining
  const totalDebtColumn = projectionSheet.getColumn(2); // Changed from column 3 to 2
  totalDebtColumn.eachCell((cell: any, rowNumber: number) => {
    if (rowNumber > 1) { // Skip header
      const value = cell.value as number;
      if (value <= 1000) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } }; // Light green
      } else if (value <= 5000) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
      }
    }
  });

  // 📊 DEBT INSIGHTS SHEET
  const insightsSheet = workbook.addWorksheet('Debt Insights');

  // Insights header
  insightsSheet.mergeCells('A1:D1');
  const insightsHeaderCell = insightsSheet.getCell('A1');
  insightsHeaderCell.value = '💡 Your Debt Freedom Insights';
  insightsHeaderCell.font = { size: 14, bold: true };
  insightsHeaderCell.alignment = { horizontal: 'center' };

  let insightsRow = 3;
  insightsSheet.getCell(`A${insightsRow}`).value = '📈 Key Information:';
  insightsSheet.getCell(`A${insightsRow}`).font = { bold: true };
  insightsRow++;

  // Calculate insights without exposing priority categorization
  const totalDebtAmount = data.debts.reduce((sum: number, debt: any) => sum + debt.currentAmount, 0);
  const highestInterestRate = Math.max(...data.debts.map((debt: any) => debt.interestRate));
  const lowestInterestRate = Math.min(...data.debts.map((debt: any) => debt.interestRate));

  insightsSheet.getCell(`A${insightsRow}`).value = `• Total Number of Debts: ${data.debts.length}`;
  insightsRow++;
  insightsSheet.getCell(`A${insightsRow}`).value = `• Total Debt Amount: $${totalDebtAmount.toFixed(2)}`;
  insightsRow++;
  insightsSheet.getCell(`A${insightsRow}`).value = `• Highest Interest Rate: ${(highestInterestRate * 100).toFixed(2)}%`;
  insightsRow++;
  insightsSheet.getCell(`A${insightsRow}`).value = `• Lowest Interest Rate: ${(lowestInterestRate * 100).toFixed(2)}%`;
  insightsRow += 2;

  const avgInterestRate = data.debts.reduce((sum: number, debt: any) => sum + (debt.interestRate * debt.currentAmount), 0) / totalDebtAmount;
  insightsSheet.getCell(`A${insightsRow}`).value = `• Weighted Average Interest Rate: ${(avgInterestRate * 100).toFixed(2)}%`;
  insightsRow++;

  const totalMinimumPayments = data.debts.reduce((sum: number, debt: any) => sum + debt.minimumPayment, 0);
  insightsSheet.getCell(`A${insightsRow}`).value = `• Total Monthly Minimum Payments: $${totalMinimumPayments.toFixed(2)}`;
  insightsRow++;

  const extraBudget = data.userInfo.availableBudget - totalMinimumPayments;
  insightsSheet.getCell(`A${insightsRow}`).value = `• Extra Amount Going to Debt Payoff: $${extraBudget.toFixed(2)}`;
  insightsRow += 2;

  // Timeline information
  insightsSheet.getCell(`A${insightsRow}`).value = '📅 Your Debt Freedom Timeline:';
  insightsSheet.getCell(`A${insightsRow}`).font = { bold: true };
  insightsRow++;

  const months = data.completeProjection.totalMonths;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  
  let timelineText = '';
  if (years > 0) {
    timelineText = `${years} year${years > 1 ? 's' : ''}`;
    if (remainingMonths > 0) {
      timelineText += ` and ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
    }
  } else {
    timelineText = `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
  }

  insightsSheet.getCell(`A${insightsRow}`).value = `• You'll be debt-free in approximately: ${timelineText}`;
  insightsRow++;

  const debtFreeDate = new Date();
  debtFreeDate.setMonth(debtFreeDate.getMonth() + months);
  insightsSheet.getCell(`A${insightsRow}`).value = `• Projected debt-free date: ${debtFreeDate.toLocaleDateString()}`;
  insightsRow++;

  const totalInterestSavings = (totalMinimumPayments * months) - (totalDebtAmount + data.completeProjection.totalInterestPaid);
  if (totalInterestSavings > 0) {
    insightsSheet.getCell(`A${insightsRow}`).value = `• Estimated interest savings vs minimum payments: $${totalInterestSavings.toFixed(2)}`;
  }

  // Auto-fit insights sheet columns
  insightsSheet.columns = [{ width: 60 }, { width: 20 }, { width: 20 }, { width: 20 }];

  // Generate the Excel buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const generateOptimizationExcelFilename = (userId: string): string => {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
  return `OptimalPay_DebtOptimization_${userId.slice(0, 8)}_${timestamp}.xlsx`;
};
