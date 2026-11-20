import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const server = createApp().listen(config.port, () => {
  logger.info('api listening', { port: config.port, supplierBaseUrl: config.supplierBaseUrl });
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info('shutting down', { signal: sig });
    server.close(() => process.exit(0));
  });
}
