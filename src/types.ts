export type SupplierName = 'Supplier A' | 'Supplier B';

/** Raw hotel record as returned by a supplier API. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** Final, de-duplicated offer returned to clients. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}

export interface HotelSearchInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface HotelSearchResult {
  hotels: HotelOffer[];
  /** Non-fatal issues, e.g. one supplier being down. */
  warnings: string[];
}

export const ALL_SUPPLIERS_DOWN = 'AllSuppliersDown';
