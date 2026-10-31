// The app's displayed prices must equal the prices the server actually charges.
import { PLANS } from './payment';

const server = require('../../backend/src/lib/plans');

test('the app and the server agree on every plan price', () => {
  for (const p of PLANS) {
    expect(server.PLANS[p.id]).toBeTruthy();
    expect(p.priceMonthly).toBe(server.PLANS[p.id].priceMonthly);
    expect(p.priceAnnual).toBe(server.PLANS[p.id].priceAnnual);
  }
  expect(Object.keys(server.PLANS)).toEqual(PLANS.map((p) => p.id));
});
