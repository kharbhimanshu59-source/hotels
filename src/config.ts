export const config = {
  port: Number(process.env.PORT ?? 3000),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
  taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offers',
  supplierBaseUrl: (process.env.SUPPLIER_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  supplierTimeoutMs: Number(process.env.SUPPLIER_TIMEOUT_MS ?? 3000),
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 3600),
  workflowTimeoutMs: Number(process.env.WORKFLOW_TIMEOUT_MS ?? 30000),
};
