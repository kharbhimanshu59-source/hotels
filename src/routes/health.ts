import { Router } from 'express';
import { config } from '../config';
import { getTemporalClient } from '../temporal/connection';
import { pingRedis } from '../redis/hotelStore';
import { errMsg } from '../utils/logger';

export const healthRouter = Router();

type Check = { status: 'up' | 'down'; error?: string; latencyMs: number };

async function check(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'down', error: errMsg(e), latencyMs: Date.now() - start };
  }
}

async function checkSupplier(path: string) {
  const res = await fetch(`${config.supplierBaseUrl}${path}?city=health`, {
    signal: AbortSignal.timeout(config.supplierTimeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// GET /health -> 200 when everything is up, 503 otherwise (body always shows each dependency)
healthRouter.get('/health', async (_req, res) => {
  const [supplierA, supplierB, redis, temporal] = await Promise.all([
    check(() => checkSupplier('/supplierA/hotels')),
    check(() => checkSupplier('/supplierB/hotels')),
    check(pingRedis),
    check(async () => (await getTemporalClient()).connection.workflowService.getSystemInfo({})),
  ]);

  const suppliers = { supplierA, supplierB };
  const all = [supplierA, supplierB, redis, temporal];
  const status = all.every((c) => c.status === 'up') ? 'ok' : all.some((c) => c.status === 'up') ? 'degraded' : 'down';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    suppliers,
    dependencies: { redis, temporal },
  });
});
