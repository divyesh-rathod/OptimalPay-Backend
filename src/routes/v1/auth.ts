import { Router } from "express";

import { registerUser, loginUser } from "../../controllers/auth.controller";
import { userLoginSchema, userSignupSchema } from "../../utils/joiValidation";
import {validateBody } from "../../middleware/validation";

const router: Router = Router();

router.post("/register", validateBody(userSignupSchema), registerUser);
router.post("/login", validateBody(userLoginSchema), loginUser);

export default router;

