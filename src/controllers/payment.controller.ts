import { Request, Response, NextFunction } from 'express';
import { makePayment, getPaymentHistory } from '../services/payment.service';
import { sendSuccess, sendCreated } from '../utils/response';

/**
 * Make a payment on a debt
 * POST /api/v1/payments/make-payment
 */
export const makePaymentController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { debtId, paymentAmount, notes } = req.validatedBody || req.body;

        // User authentication is handled by the authenticate middleware
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }

        // Input validation is handled by Joi middleware
        // Make the payment
        const result = await makePayment(userId, debtId, paymentAmount, notes);

        sendCreated(res, 'Payment processed successfully', result);

    } catch (error) {
        next(error);
    }
};

/**
 * Get payment history for a specific debt
 * GET /api/v1/payments/history/:debtId
 */
export const getPaymentHistoryController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { debtId } = req.params;
        const validatedQuery = req.validatedQuery || {};
        const { limit } = validatedQuery;

        // User authentication is handled by the authenticate middleware
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
            return;
        }

        // Input validation is handled by Joi middleware
        // Parse limit - Joi has already validated it's a valid number
        const parsedLimit = limit ? Number(limit) : undefined;

        // Get payment history
        const paymentHistory = await getPaymentHistory(userId, debtId, parsedLimit);

        sendSuccess(res, 'Payment history retrieved successfully', {
            debtId,
            paymentHistory,
            totalRecords: paymentHistory.length
        });

    } catch (error) {
        next(error);
    }
};
