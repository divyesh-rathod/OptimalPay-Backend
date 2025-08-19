import { Request, Response, NextFunction } from "express";
import { calculateOptimalStrategy, generateOptimizationExcelReport } from "../services/optimization.service";

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

/**
 * Download Excel report with complete optimization analysis
 * GET /api/v1/optimization/download-excel
 */
export const downloadOptimizationExcelController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }

        console.log(`📊 Generating Excel report for user: ${userId}`);
        
        const { filename, buffer } = await generateOptimizationExcelReport(userId);

        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        // Send the Excel file
        res.send(buffer);

    } catch (error) {
        next(error);
    }
};