import  { Request, Response, NextFunction } from "express";
import { createUser,login } from "../services/auth.service";
import { sendCreated,sendSuccess } from "../utils/response";


export const registerUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await createUser(req.body);
    sendCreated(res, "User registered successfully", user);
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await login(req.body);
    sendSuccess(res, "User logged in successfully", user);
  } catch (error) {
    next(error);
  }
}

