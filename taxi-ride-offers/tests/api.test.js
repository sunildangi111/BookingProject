const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'arrivalride-test-'));
process.env.STATE_FILE = path.join(temporaryDirectory, 'state.json');
process.env.NODE_ENV = 'test';

const app = require('../src/app');

let server;
let baseUrl;

async function api(method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('complete Menon request, offer, booking, and change workflow', async () => {
  const quote = await api('GET', '/api/routes/quote?flightId=FL-401&hotelId=HTL-TYO-004');
  assert.equal(quote.status, 200);
  assert.equal(quote.payload.data.price_min_inr, 10200);
  assert.equal(quote.payload.data.earliest_pickup_local, '2027-04-10T11:30:00');

  const createdRequest = await api('POST', '/api/ride-requests', {
    traveler_name: 'Menon family',
    flight_id: 'FL-401',
    hotel_id: 'HTL-TYO-004',
    adults: 2,
    child_ages: [6],
    large_bags: 3,
    small_bags: 2,
    pickup: '2027-04-10T11:30',
    car_type: null,
    price_inr: 12000
  });
  assert.equal(createdRequest.status, 201);
  const requestId = createdRequest.payload.data.request.request_id;
  assert.match(requestId, /^REQ-/);
  assert.ok(createdRequest.payload.data.supplier_eligibility.eligible_count > 0);

  const tooEarly = await api('POST', '/api/ride-requests', {
    flight_id: 'FL-401',
    hotel_id: 'HTL-TYO-004',
    adults: 2,
    child_ages: [6],
    large_bags: 3,
    small_bags: 2,
    pickup: '2027-04-10T11:29',
    price_inr: 12000
  });
  assert.equal(tooEarly.status, 400);
  assert.equal(tooEarly.payload.error.code, 'PICKUP_TOO_EARLY');

  const dashboard = await api('GET', '/api/suppliers/TX-JP-01/dashboard');
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.payload.data.requests.some((entry) => entry.request.request_id === requestId));

  const invalidCar = await api('POST', `/api/ride-requests/${requestId}/offers`, {
    company_id: 'TX-JP-01',
    vehicle_id: 'SC-1',
    price_inr: 12500
  });
  assert.equal(invalidCar.status, 400);
  assert.equal(invalidCar.payload.error.code, 'NOT_ENOUGH_LARGE_BAG_SPACE');

  const createdOffer = await api('POST', `/api/ride-requests/${requestId}/offers`, {
    company_id: 'TX-JP-01',
    vehicle_id: 'SC-3',
    price_inr: 12500
  });
  assert.equal(createdOffer.status, 201);
  const offerId = createdOffer.payload.data.offer_id;

  const booked = await api('POST', `/api/offers/${offerId}/book`);
  assert.equal(booked.status, 201);
  const reference = booked.payload.data.booking.booking_reference;
  assert.match(reference, /^\d{10}$/);

  const summary = await api('GET', `/api/bookings/${reference}`);
  assert.equal(summary.status, 200);
  assert.equal(summary.payload.data.vehicle.vehicle_id, 'SC-3');
  assert.equal(summary.payload.data.traveler.passenger_count, 3);

  const change = await api('POST', `/api/bookings/${reference}/changes`, {
    new_pickup: '2027-04-10T15:00'
  });
  assert.equal(change.status, 201);
  assert.equal(change.payload.data.status, 'PENDING');

  const accepted = await api('PATCH', `/api/change-requests/${change.payload.data.change_id}`, {
    decision: 'ACCEPT',
    company_id: 'TX-JP-01'
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.payload.data.change.status, 'ACCEPTED');
  assert.equal(accepted.payload.data.booking.booking.pickup, '2027-04-10T15:00:00');

  const storedState = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
  assert.ok(storedState.bookings.some((entry) => entry.booking_reference === reference));
});
