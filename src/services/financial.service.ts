import { PrismaClient } from '@prisma/client'
import { UserFinancialProfile, userFinancialProfileResponse, FinancialData } from '../types/financial'

import { InternalServerError,ValidationError } from '../utils/error'
import e from 'express'

const prisma = new PrismaClient()

export const createFinancialProfile = async (userid:string, financialData: FinancialData): Promise<userFinancialProfileResponse> => {
    try {
        if (financialData.monthly_income < 0 || financialData.monthly_expenses < 0 || financialData.monthly_income < financialData.monthly_expenses) {
            throw new ValidationError("Monthly income must be greater than expenses and both must be non-negative");
        }
        console.log("Creating or updating financial profile for user:", userid, "with data:", financialData);

        const financialProfile = await prisma.financialProfile.upsert({
            where: { userId: userid },
            update: {
                monthly_income: financialData.monthly_income,
                monthly_expenses: financialData.monthly_expenses
            },
            create: {
                userId: userid,
                monthly_income: financialData.monthly_income,
                monthly_expenses: financialData.monthly_expenses
            }
        });

        if (!financialProfile) {
            throw new InternalServerError("Financial profile creation failed");
        }
        const availableBudget = Number(financialProfile.monthly_income) - Number(financialProfile.monthly_expenses);
        const response = {
            ...financialProfile,
        monthly_income: Number(financialProfile.monthly_income),     
        monthly_expenses: Number(financialProfile.monthly_expenses), 
        available_budget: availableBudget
        } as userFinancialProfileResponse;

        return response;
    } catch (error) {
        throw new InternalServerError(error instanceof Error ? error.message : "Error creating financial profile");
    }

}

export const getFinancialProfile = async (userId: string): Promise<userFinancialProfileResponse> => {
    try {
        const financialProfile = await prisma.financialProfile.findUnique({
            where: { userId }
        });

        if (!financialProfile) {
            throw new InternalServerError("Financial profile not found");
        }

        const availableBudget = Number(financialProfile.monthly_income) - Number(financialProfile.monthly_expenses);
        const response = {
            ...financialProfile,
            monthly_income: Number(financialProfile.monthly_income),
            monthly_expenses: Number(financialProfile.monthly_expenses),
            available_budget: availableBudget
        } as userFinancialProfileResponse;

        return response;
    } catch (error) {
        throw new InternalServerError("Error retrieving financial profile");
    }
}





