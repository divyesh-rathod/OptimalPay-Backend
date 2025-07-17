import { Response } from 'express';

// Basic success helper
export const sendSuccess = (res: Response, message: string, data?: any) => {
  return res.status(200).json({
    success: true,
    message,
    data
  });
};

// Created resource (201)
export const sendCreated = (res: Response, message: string, data?: any) => {
  return res.status(201).json({
    success: true,
    message,
    data
  });
};