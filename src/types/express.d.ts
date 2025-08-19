
import { TokenPayload } from './auth';

declare global {
  namespace Express {
    interface Request {
      user: TokenPayload;
      validatedBody?: any;
      validatedQuery?: any;
      validatedParams?: any;
    }
  }
}

export {};