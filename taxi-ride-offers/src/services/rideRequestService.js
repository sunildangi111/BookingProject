const catalogRepository = require('../repositories/catalogRepository');
const stateRepository = require('../repositories/stateRepository');
const { buildRideContext } = require('./rideContextService');
const { marketplaceEligibility } = require('./supplierEligibilityService');
const { priceRangeFailure } = require('../rules/taxiRules');
const { badRequest, notFound } = require('../utils/errors');
const {
  requiredString,
  optionalString,
  integer,
  wholeMoney,
  childAges,
  enumValue
} = require('../utils/validation');
const { normalizeLocalDateTime } = require('../utils/dates');
const { nextEntityId } = require('../utils/ids');

const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'SUV', 'BUS'];

function pick(body, snakeCase, camelCase) {
  return body[snakeCase] !== undefined ? body[snakeCase] : body[camelCase];
}

function publicFlight(flight) {
  return {
    flight_id: flight.flight_id,
    airline: flight.airline,
    flight_number: flight.flight_number,
    from: flight.from,
    to: flight.to,
    departure_local: flight.departure_local,
    arrival_local: flight.arrival_local,
    stops: flight.stops,
    duration_minutes: flight.duration_minutes,
    cabin: flight.cabin
  };
}

function publicHotel(hotel) {
  return {
    hotel_id: hotel.hotel_id,
    name: hotel.name,
    city: hotel.city,
    area: hotel.area,
    rating: hotel.rating,
    stars: hotel.stars
  };
}

function normalizeCreateInput(body) {
  const travelerName = optionalString(pick(body, 'traveler_name', 'travelerName')) || 'Guest traveler';
  const flightId = requiredString(pick(body, 'flight_id', 'flightId'), 'Flight', 'FLIGHT_REQUIRED');
  const hotelId = requiredString(pick(body, 'hotel_id', 'hotelId'), 'Hotel', 'HOTEL_REQUIRED');
  const adults = integer(body.adults, 'Adults', { min: 1, max: 99, code: 'ADULT_REQUIRED' });
  const parsedChildAges = childAges(pick(body, 'child_ages', 'childAges'));
  const largeBags = integer(pick(body, 'large_bags', 'largeBags'), 'Large bags', {
    min: 0,
    max: 99,
    code: 'INVALID_BAG_COUNT'
  });
  const smallBags = integer(pick(body, 'small_bags', 'smallBags'), 'Small bags', {
    min: 0,
    max: 99,
    code: 'INVALID_BAG_COUNT'
  });
  const pickupInput = optionalString(pick(body, 'pickup', 'pickupLocal'));
  const carType = enumValue(pick(body, 'car_type', 'carType'), 'Car type', CAR_TYPES, {
    optional: true,
    code: 'INVALID_CAR_TYPE'
  });
  const price = wholeMoney(pick(body, 'price_inr', 'travelerPriceInr'), 'Traveler price');

  if (pickupInput && !normalizeLocalDateTime(pickupInput)) {
    throw badRequest('INVALID_PICKUP_TIME', 'Pickup must be a valid local date and time.', {
      pickup: pickupInput
    });
  }

  return {
    traveler_name: travelerName.slice(0, 100),
    flight_id: flightId,
    hotel_id: hotelId,
    adults,
    child_ages: parsedChildAges,
    large_bags: largeBags,
    small_bags: smallBags,
    pickup: pickupInput,
    car_type: carType,
    price_inr: price
  };
}

function getRequestFromState(state, requestId) {
  const request = state.ride_requests.find((entry) => entry.request_id === requestId);
  if (!request) {
    throw notFound('REQUEST_NOT_FOUND', `Ride request ${requestId} was not found.`, {
      request_id: requestId
    });
  }
  return request;
}

function enrichRequest(request) {
  const context = buildRideContext(request);
  return {
    ...request,
    pickup: context.pickup,
    passenger_count: context.passengerCount,
    flight: publicFlight(context.flight),
    hotel: publicHotel(context.hotel),
    route: {
      airport: context.route.airport,
      city: context.route.city,
      area: context.route.area,
      distance_km: context.route.distance_km,
      drive_minutes: context.route.drive_minutes,
      price_min_inr: context.route.price_min_inr,
      price_max_inr: context.route.price_max_inr
    },
    landing_local: context.landing,
    earliest_pickup: context.earliestPickup,
    busy_start: context.busyStart,
    busy_end: context.busyUntil
  };
}

function quote(flightId, hotelId) {
  const temporaryRequest = {
    flight_id: requiredString(flightId, 'Flight', 'FLIGHT_REQUIRED'),
    hotel_id: requiredString(hotelId, 'Hotel', 'HOTEL_REQUIRED'),
    adults: 1,
    child_ages: [],
    large_bags: 0,
    small_bags: 0,
    pickup: null,
    car_type: null,
    price_inr: 1
  };
  const context = buildRideContext(temporaryRequest);

  return {
    airport: context.flight.to,
    airport_name: context.airport.name,
    flight: publicFlight(context.flight),
    hotel: publicHotel(context.hotel),
    drive_minutes: context.route.drive_minutes,
    distance_km: context.route.distance_km,
    price_min_inr: context.route.price_min_inr,
    price_max_inr: context.route.price_max_inr,
    landing_local: context.landing,
    earliest_pickup_local: context.earliestPickup
  };
}

function createRideRequest(body) {
  const input = normalizeCreateInput(body);
  const initialContext = buildRideContext(input);
  input.pickup = initialContext.pickup;

  const priceFailure = priceRangeFailure(input.price_inr, initialContext.route);
  if (priceFailure) {
    throw badRequest(priceFailure.code, priceFailure.message, priceFailure.details);
  }

  const created = stateRepository.mutate((state) => {
    const now = new Date().toISOString();
    const request = {
      request_id: nextEntityId(state, 'request', 'REQ'),
      ...input,
      status: 'OPEN',
      source: 'APP',
      created_at: now,
      updated_at: now
    };
    state.ride_requests.push(request);
    return request;
  });

  const state = stateRepository.read();
  const eligibility = marketplaceEligibility(created, state);
  return {
    request: enrichRequest(created),
    supplier_eligibility: summarizeEligibility(eligibility)
  };
}

function summarizeEligibility(eligibility) {
  return {
    eligible_count: eligibility.eligible.length,
    eligible_suppliers: eligibility.eligible.map((result) => ({
      company_id: result.company.company_id,
      name: result.company.name,
      rating: result.company.rating,
      eligible_vehicle_count: result.eligible_vehicles.length
    })),
    unavailable_suppliers: eligibility.ineligible.map((result) => ({
      company_id: result.company.company_id,
      name: result.company.name,
      reasons: result.failures
    }))
  };
}

function getRideRequest(requestId) {
  const state = stateRepository.read();
  return enrichRequest(getRequestFromState(state, requestId));
}

function getRideRequestWithEligibility(requestId) {
  const state = stateRepository.read();
  const request = getRequestFromState(state, requestId);
  return {
    request: enrichRequest(request),
    supplier_eligibility: summarizeEligibility(marketplaceEligibility(request, state))
  };
}

function listRideRequests() {
  const state = stateRepository.read();
  return state.ride_requests.map(enrichRequest);
}

module.exports = {
  CAR_TYPES,
  publicFlight,
  publicHotel,
  normalizeCreateInput,
  getRequestFromState,
  enrichRequest,
  quote,
  createRideRequest,
  getRideRequest,
  getRideRequestWithEligibility,
  listRideRequests
};
