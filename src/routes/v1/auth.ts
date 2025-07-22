import { Router } from "express";

import { registerUser, loginUser ,logoutUser} from "../../controllers/auth.controller";
import { userLoginSchema, userSignupSchema } from "../../utils/joiValidation";
import {  authenticate}from "../../middleware/auth"
import {validateBody } from "../../middleware/validation";

const router: Router = Router();


router.post("/register", validateBody(userSignupSchema), registerUser);
router.post("/login", validateBody(userLoginSchema), loginUser);
router.use(authenticate);
router.post("/logout",logoutUser)

export default router;

