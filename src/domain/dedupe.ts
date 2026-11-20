import { HotelOffer, SupplierHotel, SupplierName } from '../types';

export const normalizeName = (name: string): string => name.trim().toLowerCase();

export const byPriceThenName = (a: HotelOffer, b: HotelOffer): number =>
  a.price - b.price || a.name.localeCompare(b.name);

const toOffer = (h: SupplierHotel, supplier: SupplierName): HotelOffer => ({
  name: h.name.trim(),
  price: h.price,
  supplier,
  commissionPct: h.commissionPct,
});

/**
 * Merge both supplier lists, de-duplicating by (case-insensitive) hotel name.
 *  - name in both lists  -> cheaper offer wins (tie -> Supplier A, deterministic)
 *  - name in one list    -> that offer is used
 * Result is sorted by price ascending, then name.
 */
export function dedupeAndSelectBest(a: SupplierHotel[], b: SupplierHotel[]): HotelOffer[] {
  const best = new Map<string, HotelOffer>();

  const consider = (hotels: SupplierHotel[], supplier: SupplierName) => {
    for (const h of hotels) {
      const key = normalizeName(h.name);
      const candidate = toOffer(h, supplier);
      const current = best.get(key);
      if (!current || candidate.price < current.price) best.set(key, candidate);
    }
  };

  // A first, so on equal prices A is kept (candidate must be strictly cheaper to replace).
  consider(a, 'Supplier A');
  consider(b, 'Supplier B');

  return [...best.values()].sort(byPriceThenName);
}
