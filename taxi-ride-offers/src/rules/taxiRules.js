const { isWithinServiceHours } = require('../utils/dates');

function ruleFailure(code, message, details = null) {
  return { code, message, details };
}

function priceRangeFailure(price, route) {
  if (!Number.isSafeInteger(price) || price <= 0) {
    return ruleFailure(
      'INVALID_PRICE',
      'Price must be a positive whole INR amount.',
      { price }
    );
  }

  if (price < route.price_min_inr || price > route.price_max_inr) {
    return ruleFailure(
      'PRICE_OUT_OF_RANGE',
      `Price must be between ₹${route.price_min_inr.toLocaleString('en-IN')} and ₹${route.price_max_inr.toLocaleString('en-IN')}.`,
      {
        price,
        minimum: route.price_min_inr,
        maximum: route.price_max_inr
      }
    );
  }

  return null;
}

function vehicleFitFailures(vehicle, request) {
  const failures = [];
  const passengerCount = request.adults + request.child_ages.length;

  if (request.car_type && vehicle.type !== request.car_type) {
    failures.push(ruleFailure(
      'CAR_TYPE_MISMATCH',
      `Traveler requested ${request.car_type}, but ${vehicle.vehicle_id} is ${vehicle.type}.`,
      { requested: request.car_type, actual: vehicle.type }
    ));
  }

  if (vehicle.seats < passengerCount) {
    failures.push(ruleFailure(
      'NOT_ENOUGH_SEATS',
      `${vehicle.vehicle_id} has ${vehicle.seats} seats but ${passengerCount} passengers need seats.`,
      { available: vehicle.seats, required: passengerCount }
    ));
  }

  if (vehicle.large_bags < request.large_bags) {
    failures.push(ruleFailure(
      'NOT_ENOUGH_LARGE_BAG_SPACE',
      `${vehicle.vehicle_id} fits ${vehicle.large_bags} large bags but ${request.large_bags} are required.`,
      { available: vehicle.large_bags, required: request.large_bags }
    ));
  }

  if (vehicle.small_bags < request.small_bags) {
    failures.push(ruleFailure(
      'NOT_ENOUGH_SMALL_BAG_SPACE',
      `${vehicle.vehicle_id} fits ${vehicle.small_bags} small bags but ${request.small_bags} are required.`,
      { available: vehicle.small_bags, required: request.small_bags }
    ));
  }

  return failures;
}

function supplierCoverageFailures(company, context) {
  const failures = [];

  if (!company.airports.includes(context.flight.to)) {
    failures.push(ruleFailure(
      'AIRPORT_NOT_SERVED',
      `${company.name} does not pick up at ${context.flight.to}.`,
      { airport: context.flight.to }
    ));
  }

  const servesArea = company.areas.some((entry) => (
    entry.city === context.hotel.city && entry.area === context.hotel.area
  ));
  if (!servesArea) {
    failures.push(ruleFailure(
      'AREA_NOT_SERVED',
      `${company.name} does not drive to ${context.hotel.area}, ${context.hotel.city}.`,
      { city: context.hotel.city, area: context.hotel.area }
    ));
  }

  if (!isWithinServiceHours(context.pickup, company.service_from, company.service_until)) {
    failures.push(ruleFailure(
      'OUTSIDE_SERVICE_HOURS',
      `${company.name} operates from ${company.service_from} to ${company.service_until}; pickup is ${context.pickup.slice(11, 16)}.`,
      {
        pickup: context.pickup,
        service_from: company.service_from,
        service_until: company.service_until
      }
    ));
  }

  return failures;
}

module.exports = {
  ruleFailure,
  priceRangeFailure,
  vehicleFitFailures,
  supplierCoverageFailures
};
