import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeAndSelectBest } from '../domain/dedupe';
import { SupplierHotel } from '../types';

const h = (hotelId: string, name: string, price: number, commissionPct = 10): SupplierHotel => ({
  hotelId,
  name,
  price,
  city: 'delhi',
  commissionPct,
});

test('picks the cheaper offer for overlapping names', () => {
  const out = dedupeAndSelectBest([h('a1', 'Holtin', 6000, 10)], [h('b1', 'Holtin', 5340, 20)]);
  assert.deepEqual(out, [{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }]);
});

test('keeps hotels that only one supplier returns', () => {
  const out = dedupeAndSelectBest([h('a1', 'Ibis', 3800)], [h('b1', 'Hyatt', 9800)]);
  assert.deepEqual(out.map((o) => [o.name, o.supplier]), [['Ibis', 'Supplier A'], ['Hyatt', 'Supplier B']]);
});

test('matches names case-insensitively and ignores whitespace', () => {
  const out = dedupeAndSelectBest([h('a1', 'Radison', 5900)], [h('b1', ' radison ', 6100)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].supplier, 'Supplier A');
});

test('tie goes to Supplier A', () => {
  const out = dedupeAndSelectBest([h('a1', 'X', 100)], [h('b1', 'X', 100)]);
  assert.equal(out[0].supplier, 'Supplier A');
});

test('handles empty lists and a single supplier outage', () => {
  assert.deepEqual(dedupeAndSelectBest([], []), []);
  assert.equal(dedupeAndSelectBest([], [h('b1', 'Only B', 10)]).length, 1);
});

test('result is sorted by price ascending', () => {
  const out = dedupeAndSelectBest([h('a1', 'B', 300), h('a2', 'A', 100)], [h('b1', 'C', 200)]);
  assert.deepEqual(out.map((o) => o.price), [100, 200, 300]);
});
