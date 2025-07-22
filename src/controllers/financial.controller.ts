import { Request, Response, NextFunction } from "express";
import { UserFinancialProfile ,FinancialData,userFinancialProfileResponse} from "../types/financial";
import { createFinancialProfile,getFinancialProfile } from "../services/financial.service";
import { sendCreated,sendSuccess } from "../utils/response";
import { AppError } from "../utils/error";

export const createFinancialProfileController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id; 
    const financialData: FinancialData = req.body;

    try {
        console.log("Received financial data:", financialData); 
        const financialProfile: userFinancialProfileResponse = await createFinancialProfile(userId, financialData);
        sendCreated(res, "Financial profile created or updated successfully", financialProfile);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
}

export const getFinancialProfileController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id;

    try {
        const financialProfile: userFinancialProfileResponse = await getFinancialProfile(userId);
        sendSuccess(res, "Financial profile retrieved successfully", financialProfile);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
}