import { Request, Response, NextFunction } from "express";
import { calculateOptimalStrategy } from "../services/optimization.service";

export const optimizeController = async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
    const userId = req.user.id;
        console.log("reached optimization controller");
    try {
        const result = await calculateOptimalStrategy(userId);
        
        return res.status(200).json({
            message: "Optimization calculated successfully",
            data: result
        });
    } catch (error) {
        console.error("Error in optimization controller:", error);
        return next(error);
    }
};