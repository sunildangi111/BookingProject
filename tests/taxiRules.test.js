const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeLocalDateTime,
  addMinutesLocal,
  isWithinServiceHours,
  intervalsOverlap
} = require('../src/utils/dates');
const {
  priceRangeFailure,
  vehicleFitFailures,
  supplierCoverageFailures
} = require('../src/rules/taxiRules');
const { quote } = require('../src/services/rideRequestService');

const route = {
  price_min_inr: 10200,
  price_max_inr: 16800
};

test('normalizes local timestamps with or without seconds', () => {
  assert.equal(normalizeLocalDateTime('2027-04-10T11:30'), '2027-04-10T11:30:00');
  assert.equal(normalizeLocalDateTime('2027-04-10T11:30:45'), '2027-04-10T11:30:45');
});

test('rejects impossible local date-time values', () => {
  assert.equal(normalizeLocalDateTime('2027-04-31T11:30'), null);
  assert.equal(normalizeLocalDateTime('not-a-date'), null);
});

test('adds the required 60-minute arrival buffer', () => {
  assert.equal(addMinutesLocal('2027-04-10T10:30:00', 60), '2027-04-10T11:30:00');
});

test('regular service hours include both boundaries', () => {
  assert.equal(isWithinServiceHours('2027-04-10T06:00', '06:00', '23:00'), true);
  assert.equal(isWithinServiceHours('2027-04-10T23:00', '06:00', '23:00'), true);
  assert.equal(isWithinServiceHours('2027-04-10T23:01', '06:00', '23:00'), false);
});

test('overnight service hours include times after midnight', () => {
  assert.equal(isWithinServiceHours('2027-04-10T00:30', '05:00', '01:00'), true);
  assert.equal(isWithinServiceHours('2027-04-10T02:00', '05:00', '01:00'), false);
  assert.equal(isWithinServiceHours('2027-04-10T05:00', '05:00', '01:00'), true);
});

test('touching busy intervals do not overlap', () => {
  assert.equal(intervalsOverlap(
    '2027-04-10T11:00',
    '2027-04-10T14:00',
    '2027-04-10T14:00',
    '2027-04-10T16:00'
  ), false);
});

test('busy intervals overlapping by one minute are rejected', () => {
  assert.equal(intervalsOverlap(
    '2027-04-10T11:00',
    '2027-04-10T14:01',
    '2027-04-10T14:00',
    '2027-04-10T16:00'
  ), true);
});

test('route minimum and maximum prices are inclusive', () => {
  assert.equal(priceRangeFailure(10200, route), null);
  assert.equal(priceRangeFailure(16800, route), null);
  assert.equal(priceRangeFailure(10199, route).code, 'PRICE_OUT_OF_RANGE');
  assert.equal(priceRangeFailure(16801, route).code, 'PRICE_OUT_OF_RANGE');
});

test('vehicle exactly matching passengers and bags is valid', () => {
  const failures = vehicleFitFailures(
    { vehicle_id: 'TEST-1', type: 'SUV', seats: 3, large_bags: 3, small_bags: 2 },
    { adults: 2, child_ages: [6], large_bags: 3, small_bags: 2, car_type: 'SUV' }
  );
  assert.deepEqual(failures, []);
});

test('large and small bags are checked independently', () => {
  const failures = vehicleFitFailures(
    { vehicle_id: 'TEST-2', type: 'SUV', seats: 6, large_bags: 2, small_bags: 10 },
    { adults: 2, child_ages: [6], large_bags: 3, small_bags: 2, car_type: null }
  );
  assert.equal(failures.some((failure) => failure.code === 'NOT_ENOUGH_LARGE_BAG_SPACE'), true);
});

test('supplier coverage checks airport, area, and service hours', () => {
  const failures = supplierCoverageFailures(
    {
      name: 'Test Cabs',
      airports: ['NRT'],
      areas: [{ city: 'Tokyo', area: 'Ueno' }],
      service_from: '06:00',
      service_until: '23:00'
    },
    {
      flight: { to: 'NRT' },
      hotel: { city: 'Tokyo', area: 'Ueno' },
      pickup: '2027-04-10T11:30:00'
    }
  );
  assert.deepEqual(failures, []);
});

test('Menon quote matches the supplied route data', () => {
  const result = quote('FL-401', 'HTL-TYO-004');
  assert.equal(result.airport, 'NRT');
  assert.equal(result.hotel.area, 'Ueno');
  assert.equal(result.earliest_pickup_local, '2027-04-10T11:30:00');
  assert.equal(result.price_min_inr, 10200);
  assert.equal(result.price_max_inr, 16800);
  assert.equal(result.drive_minutes, 90);
});
