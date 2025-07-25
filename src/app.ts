import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { v1Routes } from './routes/v1';
import { errorHandler } from './middleware/errorHandler';
// Load environment variables
dotenv.config();

const app: Express = express();
const PORT: string | number = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic route
app.get('/', (_req: Request, res: Response) => {
  res.json({ 
    message: 'Debt Elimination Platform API',
    version: '1.0.0',
    status: 'running' 
  });
});


app.use('/api/v1', v1Routes);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
});

export default app;