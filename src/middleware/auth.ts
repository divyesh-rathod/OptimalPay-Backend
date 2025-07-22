import  jwt  from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { InternalServerError, AuthError } from "../utils/error";
import { TokenPayload } from "../types/auth";

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ message: 'No valid token provided' });
            return;
        }
        const token = authHeader?.split(' ')[1];
        if (!token) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
        req.user = decoded;
        next();
    } catch (error) {
         console.error('JWT verification error:', error);
        
        if (error instanceof jwt.JsonWebTokenError) {
            throw new AuthError("Invalid token");
        } else if (error instanceof jwt.TokenExpiredError) {
            throw new AuthError("Token expired");
        } else {
            throw  new InternalServerError("Authentication error");
        }
    }
   
}
