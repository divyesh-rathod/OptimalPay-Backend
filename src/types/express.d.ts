
import { TokenPayload } from './auth';

declare global {
  namespace Express {
    interface Request {
      user: TokenPayload;
    }
  }
}

export {};