import { Router } from "express";

import auth from "./auth";
import userFinance from "./userfinance";
import debt from "./debt";

const router: Router = Router();

router.use("/auth", auth);
router.use("/user-finance", userFinance);
router.use("/debt", debt);


//export default router;
export const v1Routes = router;