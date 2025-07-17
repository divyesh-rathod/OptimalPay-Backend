import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/error';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', error);

  // Handle custom AppError (ValidationError, ConflictError, etc.)
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
    return;
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    message: 'Something went wrong'
  });
};