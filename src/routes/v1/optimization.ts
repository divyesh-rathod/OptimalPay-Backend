import { Router } from "express";
import { optimizeController, downloadOptimizationExcelController } from "../../controllers/optimization.controller";
import { authenticate } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router: Router = Router();
router.use(authenticate);

router.post("/optimize", optimizeController);
router.get("/download-excel", downloadOptimizationExcelController);

export default router;


