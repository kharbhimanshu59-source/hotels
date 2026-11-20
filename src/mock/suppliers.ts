import { Router } from 'express';
import { SupplierHotel } from '../types';
import { logger } from '../utils/logger';

const supplierAHotels: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 8 },
  { hotelId: 'a4', name: 'Lemon Tree', price: 4500, city: 'delhi', commissionPct: 12 },
  { hotelId: 'a5', name: 'Ibis', price: 3800, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a6', name: 'Hotel Sunrise', price: 2800, city: 'delhi', commissionPct: 15 },
  { hotelId: 'a7', name: 'Holtin', price: 7000, city: 'mumbai', commissionPct: 10 },
  { hotelId: 'a8', name: 'Sea Breeze', price: 8200, city: 'mumbai', commissionPct: 11 },
  { hotelId: 'a9', name: 'Marine Inn', price: 5100, city: 'mumbai', commissionPct: 14 },
];

const supplierBHotels: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6100, city: 'delhi', commissionPct: 12 },
  { hotelId: 'b3', name: 'Taj Palace', price: 11800, city: 'delhi', commissionPct: 11 },
  { hotelId: 'b4', name: 'Hyatt Regency', price: 9800, city: 'delhi', commissionPct: 14 },
  { hotelId: 'b5', name: 'The Oberoi', price: 15500, city: 'delhi', commissionPct: 10 },
  { hotelId: 'b6', name: 'Lemon Tree', price: 4650, city: 'delhi', commissionPct: 15 },
  { hotelId: 'b7', name: 'Holtin', price: 6500, city: 'mumbai', commissionPct: 18 },
  { hotelId: 'b8', name: 'Sea Breeze', price: 8600, city: 'mumbai', commissionPct: 9 },
  { hotelId: 'b9', name: 'Gateway Suites', price: 12000, city: 'mumbai', commissionPct: 13 },
];

/** Runtime switch used to simulate a supplier outage (see README / Postman). */
const down = {
  supplierA: process.env.SUPPLIER_A_DOWN === 'true',
  supplierB: process.env.SUPPLIER_B_DOWN === 'true',
};
type SupplierKey = keyof typeof down;

export const mockSupplierRouter = Router();

function register(key: SupplierKey, data: SupplierHotel[]) {
  mockSupplierRouter.get(`/${key}/hotels`, (req, res) => {
    if (down[key]) {
      logger.warn('mock supplier is DOWN', { supplier: key });
      return res.status(503).json({ error: `${key} is temporarily unavailable` });
    }
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : undefined;
    res.json(city ? data.filter((h) => h.city === city) : data);
  });

  mockSupplierRouter.post(`/mock/${key}/down`, (_req, res) => {
    down[key] = true;
    logger.warn('mock supplier switched DOWN', { supplier: key });
    res.json({ supplier: key, down: true });
  });
  mockSupplierRouter.post(`/mock/${key}/up`, (_req, res) => {
    down[key] = false;
    logger.info('mock supplier switched UP', { supplier: key });
    res.json({ supplier: key, down: false });
  });
}

register('supplierA', supplierAHotels);
register('supplierB', supplierBHotels);
