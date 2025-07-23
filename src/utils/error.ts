export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}


export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}


export class AuthError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}


export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}


export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super(message, 404);
  }
  }
  export class InternalServerError extends AppError {
    constructor(message: string = 'Internal server error') {
      super(message, 500);
    }
  }

// Quick helper functions for common scenarios
export const throwEmailExists = () => {
  throw new ConflictError('Email already exists');
};

export const throwInvalidLogin = () => {
  throw new AuthError('Invalid email or password');
};

export const throwUserNotFound = () => {
  throw new NotFoundError('User not found');
};

export const throwInvalidInput = (message: string) => {
  throw new ValidationError(message);
};

export const throwInternalError = (
  error: unknown, 
  fallbackMessage: string = 'Internal server error',
  context?: string  // Optional context like "updateDebt", "createUser"
) => {
  // Enhanced logging
  console.error(`🚨 Internal Error${context ? ` in ${context}` : ''}:`, {
    error,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  
  const message = error instanceof Error ? error.message : fallbackMessage;
  throw new InternalServerError(message);
};