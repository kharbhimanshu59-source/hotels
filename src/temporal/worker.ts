import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../config';
import * as activities from './activities';
import { errMsg, logger } from '../utils/logger';

async function connectWithRetry(maxAttempts = 30, delayMs = 2000): Promise<NativeConnection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await NativeConnection.connect({ address: config.temporalAddress });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn('temporal not ready, retrying', { attempt, address: config.temporalAddress, error: errMsg(err) });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function run() {
  const connection = await connectWithRetry();
  const worker = await Worker.create({
    connection,
    namespace: config.temporalNamespace,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  logger.info('temporal worker started', { taskQueue: config.taskQueue, address: config.temporalAddress });
  await worker.run();
  logger.info('temporal worker stopped');
}

run().catch((err) => {
  logger.error('worker crashed', { error: errMsg(err) });
  process.exit(1);
});
