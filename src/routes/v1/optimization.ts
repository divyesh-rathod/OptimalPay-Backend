import { Router } from "express";
import { optimizeController } from "../../controllers/optimization.controller";
import { authenticate } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router: Router = Router();
router.use(authenticate);

router.post("/optimize", optimizeController);

export default router;


