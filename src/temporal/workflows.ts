import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import { ALL_SUPPLIERS_DOWN, HotelSearchInput, HotelSearchResult, SupplierHotel } from '../types';

const { fetchSupplierA, fetchSupplierB, dedupeAndSelectBest, saveHotelsToRedis, queryHotelsByPrice } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 seconds',
    retry: {
      initialInterval: '500 milliseconds',
      backoffCoefficient: 2,
      maximumInterval: '2 seconds',
      maximumAttempts: 3,
    },
  });

const reason = (r: PromiseRejectedResult): string =>
  r.reason instanceof Error ? (r.reason.cause instanceof Error ? r.reason.cause.message : r.reason.message) : String(r.reason);

/**
 * 1. Call Supplier A and B in parallel (each activity has its own retry policy)
 * 2. Tolerate a single supplier failure; fail only if both are down
 * 3. De-duplicate by hotel name, keeping the cheapest offer
 * 4. Save the de-duplicated list in Redis
 * 5. If a price range was requested, filter it inside Redis
 */
export async function hotelOfferWorkflow(input: HotelSearchInput): Promise<HotelSearchResult> {
  const { city, minPrice, maxPrice } = input;
  const warnings: string[] = [];
  log.info('hotelOfferWorkflow started', { city, minPrice, maxPrice });

  const [a, b] = await Promise.allSettled([fetchSupplierA(city), fetchSupplierB(city)]);

  let listA: SupplierHotel[] = [];
  let listB: SupplierHotel[] = [];

  if (a.status === 'fulfilled') listA = a.value;
  else warnings.push(`Supplier A unavailable: ${reason(a)}`);

  if (b.status === 'fulfilled') listB = b.value;
  else warnings.push(`Supplier B unavailable: ${reason(b)}`);

  if (a.status === 'rejected' && b.status === 'rejected') {
    log.error('both suppliers failed', { city, warnings });
    throw ApplicationFailure.nonRetryable('Both suppliers are unavailable', ALL_SUPPLIERS_DOWN, warnings);
  }
  if (warnings.length) log.warn('continuing with partial supplier data', { city, warnings });

  const deduped = await dedupeAndSelectBest(listA, listB);
  await saveHotelsToRedis(city, deduped);

  const filtering = minPrice !== undefined || maxPrice !== undefined;
  const hotels = filtering ? await queryHotelsByPrice(city, minPrice, maxPrice) : deduped;

  log.info('hotelOfferWorkflow completed', { city, total: deduped.length, returned: hotels.length });
  return { hotels, warnings };
}
