import { Router } from "express";

import { createDebtController, updateDebtController,getAllDebtsController,getDebtByIdController } from "../../controllers/debt.controller";
import {createDebtSchema,updateDebtSchema,uuidParamSchema} from "../../utils/joiValidation";
import {  authenticate}from "../../middleware/auth"
import { validateBody,validateParams } from "../../middleware/validation";

const router: Router = Router();

router.use(authenticate);

router.post("/create-debt", validateBody(createDebtSchema), createDebtController);

router.put("/update-debt/:id", validateParams(uuidParamSchema), validateBody(updateDebtSchema), updateDebtController);

router.get("/get-all-debts", getAllDebtsController);
router.get("/get-debt/:id", validateParams(uuidParamSchema), getDebtByIdController);

export default router;


