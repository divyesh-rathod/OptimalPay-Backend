import { Router } from "express";

import auth from "./auth";
import userFinance from "./userfinance";
import debt from "./debt";
import optimization from "./optimization";
import payment from "./payment";

const router: Router = Router();

router.use("/auth", auth);
router.use("/user-finance", userFinance);
router.use("/optimization", optimization);
router.use("/debt", debt);
router.use("/payment", payment);

//export default router;
export const v1Routes = router;