import  { Request, Response, NextFunction } from "express";
import { createUser } from "../services/auth.service";
import { sendCreated } from "../utils/response";


export const registerUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await createUser(req.body);
    sendCreated(res, "User registered successfully", user);
  } catch (error) {
    next(error);
  }
};

