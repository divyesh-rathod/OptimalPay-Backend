-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CREDIT_CARD', 'MORTGAGE', 'OTHER', 'AUTO_LOAN', 'STUDENT_LOAN', 'MEDICAL_DEBT', 'PERSONAL_LOAN');

-- CreateTable
CREATE TABLE "FinancialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthly_income" DECIMAL(10,2) NOT NULL,
    "monthly_expenses" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DebtType" NOT NULL,
    "originalAmount" DECIMAL(10,2) NOT NULL,
    "currentAmount" DECIMAL(10,2) NOT NULL,
    "interestRate" DECIMAL(6,4) NOT NULL,
    "minimumPayment" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "tenure" INTEGER,
    "remainingTenure" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentHistory" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optimizationStrategyId" TEXT,
    "plannedAmount" DECIMAL(10,2),
    "actualAmount" DECIMAL(10,2) NOT NULL,
    "principalAmount" DECIMAL(10,2),
    "interestAmount" DECIMAL(10,2),
    "newBalance" DECIMAL(10,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationStrategy" (
    "id" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isPossible" BOOLEAN,
    "projectedMonthsToDebtFree" INTEGER,
    "projectedDebtFreeDate" TIMESTAMP(3),
    "totalInterestSaved" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedPayment" (
    "id" TEXT NOT NULL,
    "optimizationStrategyId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "plannedAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialProfile_userId_key" ON "FinancialProfile"("userId");

-- CreateIndex
CREATE INDEX "Debt_userId_isActive_idx" ON "Debt"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Debt_userId_type_idx" ON "Debt"("userId", "type");

-- CreateIndex
CREATE INDEX "Debt_currentAmount_idx" ON "Debt"("currentAmount");

-- CreateIndex
CREATE INDEX "PaymentHistory_userId_paymentDate_idx" ON "PaymentHistory"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentHistory_debtId_paymentDate_idx" ON "PaymentHistory"("debtId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentHistory_optimizationStrategyId_idx" ON "PaymentHistory"("optimizationStrategyId");

-- CreateIndex
CREATE INDEX "OptimizationStrategy_userId_isActive_idx" ON "OptimizationStrategy"("userId", "isActive");

-- CreateIndex
CREATE INDEX "OptimizationStrategy_monthYear_idx" ON "OptimizationStrategy"("monthYear");

-- CreateIndex
CREATE INDEX "OptimizationStrategy_createdAt_idx" ON "OptimizationStrategy"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OptimizationStrategy_userId_monthYear_key" ON "OptimizationStrategy"("userId", "monthYear");

-- CreateIndex
CREATE INDEX "PlannedPayment_optimizationStrategyId_idx" ON "PlannedPayment"("optimizationStrategyId");

-- CreateIndex
CREATE INDEX "PlannedPayment_debtId_idx" ON "PlannedPayment"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedPayment_optimizationStrategyId_debtId_key" ON "PlannedPayment"("optimizationStrategyId", "debtId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- AddForeignKey
ALTER TABLE "FinancialProfile" ADD CONSTRAINT "FinancialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_optimizationStrategyId_fkey" FOREIGN KEY ("optimizationStrategyId") REFERENCES "OptimizationStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationStrategy" ADD CONSTRAINT "OptimizationStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedPayment" ADD CONSTRAINT "PlannedPayment_optimizationStrategyId_fkey" FOREIGN KEY ("optimizationStrategyId") REFERENCES "OptimizationStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedPayment" ADD CONSTRAINT "PlannedPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
