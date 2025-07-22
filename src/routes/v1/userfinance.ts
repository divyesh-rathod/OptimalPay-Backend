import { Router } from "express";

import { createFinancialProfileController,getFinancialProfileController} from "../../controllers/financial.controller";
import {financialDataSchema} from "../../utils/joiValidation";
import {  authenticate}from "../../middleware/auth"
import { validateBody } from "../../middleware/validation";

const router: Router = Router();

router.use(authenticate);

router.post("/create-financial-profile", validateBody(financialDataSchema), createFinancialProfileController);

router.get("/get-financial-profile", getFinancialProfileController);





export default router;