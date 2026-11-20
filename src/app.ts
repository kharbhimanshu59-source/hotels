import express, { NextFunction, Request, Response } from 'express';
import { mockSupplierRouter } from './mock/suppliers';
import { hotelsRouter } from './routes/hotels';
import { healthRouter } from './routes/health';
import { errMsg, logger } from './utils/logger';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () =>
      logger.info('http request', { method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start }),
    );
    next();
  });

  app.use(healthRouter);
  app.use(mockSupplierRouter); // /supplierA/hotels, /supplierB/hotels
  app.use('/api', hotelsRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('unhandled error', { error: errMsg(err) });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
