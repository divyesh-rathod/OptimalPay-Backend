import { Router } from "express";

import auth from "./auth";
import userFinance from "./userfinance";

const router: Router = Router();

router.use("/auth", auth);
router.use("/user-finance", userFinance);

//export default router;
export const v1Routes = router;