import Redis from 'ioredis';
import { config } from '../config';
import { HotelOffer } from '../types';
import { byPriceThenName, normalizeName } from '../domain/dedupe';
import { logger } from '../utils/logger';

/**
 * Redis layout (per city):
 *   hotels:<city>:byPrice  ZSET  member = normalized hotel name, score = price
 *   hotels:<city>:data     HASH  field  = normalized hotel name, value = JSON HotelOffer
 *
 * Price filtering is executed by Redis itself with ZRANGEBYSCORE (inclusive bounds).
 */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: true });
    client.on('error', (e) => logger.error('redis error', { error: e.message }));
  }
  return client;
}

const keys = (city: string) => ({
  zset: `hotels:${city.toLowerCase()}:byPrice`,
  hash: `hotels:${city.toLowerCase()}:data`,
});

/** Atomically replaces the stored list for a city. */
export async function saveHotels(city: string, hotels: HotelOffer[]): Promise<void> {
  const { zset, hash } = keys(city);
  const multi = getRedis().multi();
  multi.del(zset, hash);

  if (hotels.length > 0) {
    const zaddArgs: (string | number)[] = [];
    const hashFields: Record<string, string> = {};
    for (const h of hotels) {
      const member = normalizeName(h.name);
      zaddArgs.push(h.price, member);
      hashFields[member] = JSON.stringify(h);
    }
    multi.zadd(zset, ...zaddArgs);
    multi.hset(hash, hashFields);
    multi.expire(zset, config.cacheTtlSeconds);
    multi.expire(hash, config.cacheTtlSeconds);
  }

  const results = await multi.exec();
  const failed = results?.find(([err]) => err);
  if (failed) throw failed[0];
}

/** Filters by price range inside Redis (min/max both optional, both inclusive). */
export async function findByPriceRange(city: string, minPrice?: number, maxPrice?: number): Promise<HotelOffer[]> {
  const { zset, hash } = keys(city);
  const redis = getRedis();
  const members = await redis.zrangebyscore(zset, minPrice ?? '-inf', maxPrice ?? '+inf');
  if (members.length === 0) return [];

  const raw = await redis.hmget(hash, ...members);
  return raw
    .filter((v): v is string => v !== null)
    .map((v) => JSON.parse(v) as HotelOffer)
    .sort(byPriceThenName);
}

export async function pingRedis(): Promise<void> {
  await getRedis().ping();
}
