import { Router } from "express";
import { makePaymentController, getPaymentHistoryController } from "../../controllers/payment.controller";
import { makePaymentSchema, debtIdParamSchema, paymentHistoryQuerySchema } from "../../utils/joiValidation";
import { authenticate } from "../../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../../middleware/validation";

const router: Router = Router();

// All payment routes require authentication
router.use(authenticate);

// Make a payment
router.post("/make-payment", validateBody(makePaymentSchema), makePaymentController);

// Get payment history for a specific debt
router.get("/history/:debtId", 
    validateParams(debtIdParamSchema), 
    validateQuery(paymentHistoryQuerySchema), 
    getPaymentHistoryController
);

export default router;
