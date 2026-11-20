import { Context } from '@temporalio/activity';
import { config } from '../config';
import { HotelOffer, SupplierHotel } from '../types';
import { dedupeAndSelectBest as dedupe } from '../domain/dedupe';
import { findByPriceRange, saveHotels } from '../redis/hotelStore';

function isValidHotel(h: unknown): h is SupplierHotel {
  const x = h as SupplierHotel;
  return (
    !!x &&
    typeof x.name === 'string' &&
    x.name.trim().length > 0 &&
    typeof x.price === 'number' &&
    Number.isFinite(x.price) &&
    typeof x.commissionPct === 'number'
  );
}

async function fetchSupplier(label: string, path: string, city: string): Promise<SupplierHotel[]> {
  const log = Context.current().log;
  const url = `${config.supplierBaseUrl}${path}?city=${encodeURIComponent(city)}`;
  const attempt = Context.current().info.attempt;
  log.info('calling supplier', { supplier: label, url, attempt });

  const res = await fetch(url, { signal: AbortSignal.timeout(config.supplierTimeoutMs) }).catch((e) => {
    log.error('supplier request failed', { supplier: label, error: String(e), attempt });
    throw new Error(`${label} request failed: ${e instanceof Error ? e.message : e}`);
  });

  if (!res.ok) {
    log.error('supplier returned error status', { supplier: label, status: res.status, attempt });
    throw new Error(`${label} responded with HTTP ${res.status}`);
  }

  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`${label} returned an unexpected payload (expected array)`);

  const valid = body.filter(isValidHotel);
  const dropped = body.length - valid.length;
  if (dropped > 0) log.warn('dropped malformed supplier records', { supplier: label, dropped });

  log.info('supplier call succeeded', { supplier: label, count: valid.length });
  return valid;
}

export async function fetchSupplierA(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('Supplier A', '/supplierA/hotels', city);
}

export async function fetchSupplierB(city: string): Promise<SupplierHotel[]> {
  return fetchSupplier('Supplier B', '/supplierB/hotels', city);
}

export async function dedupeAndSelectBest(a: SupplierHotel[], b: SupplierHotel[]): Promise<HotelOffer[]> {
  const result = dedupe(a, b);
  Context.current().log.info('deduplicated offers', { supplierA: a.length, supplierB: b.length, result: result.length });
  return result;
}

export async function saveHotelsToRedis(city: string, hotels: HotelOffer[]): Promise<void> {
  await saveHotels(city, hotels);
  Context.current().log.info('saved hotels to redis', { city, count: hotels.length });
}

export async function queryHotelsByPrice(city: string, minPrice?: number, maxPrice?: number): Promise<HotelOffer[]> {
  const hotels = await findByPriceRange(city, minPrice, maxPrice);
  Context.current().log.info('redis price filter', { city, minPrice, maxPrice, count: hotels.length });
  return hotels;
}
