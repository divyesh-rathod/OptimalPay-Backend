import { Request, Response, NextFunction } from "express";
import { DebtResponse} from "../types/debts";
import { createDebt,updateDebt,getAllDebts,getDebtById } from "../services/debt.service";
import { sendCreated,sendSuccess } from "../utils/response";
import { AppError } from "../utils/error";

export const createDebtController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id; 
    const debtData = req.body;

    try {
       
        const debt: DebtResponse = await createDebt(userId, debtData);
        sendCreated(res, "Debt created successfully", debt);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
}

export const updateDebtController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id; 
    const debtId = req.params.id;
    const updateData = req.body;

    try {
        const updatedDebt: DebtResponse = await updateDebt(debtId, userId, updateData);
        sendSuccess(res, "Debt updated successfully", updatedDebt);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
};

export const getAllDebtsController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id;

    try {
        const debts: DebtResponse[] = await getAllDebts(userId);
        sendSuccess(res, "Debts retrieved successfully", debts);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
}

export const getDebtByIdController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id; 
    const debtId = req.params.id;

    try {
        const debt: DebtResponse = await getDebtById(debtId, userId);
        sendSuccess(res, "Debt retrieved successfully", debt);
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError("Internal Server Error", 500));
    }
}   




