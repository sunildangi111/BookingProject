const catalogRepository = require('../repositories/catalogRepository');
const { badRequest, notFound } = require('../utils/errors');
const {
  normalizeLocalDateTime,
  addMinutesLocal,
  isAtOrAfter
} = require('../utils/dates');

function buildRideContext(request) {
  const flight = catalogRepository.getFlight(request.flight_id);
  if (!flight) {
    throw notFound('FLIGHT_NOT_FOUND', `Flight ${request.flight_id} was not found.`, {
      flight_id: request.flight_id
    });
  }

  const hotel = catalogRepository.getHotel(request.hotel_id);
  if (!hotel) {
    throw notFound('HOTEL_NOT_FOUND', `Hotel ${request.hotel_id} was not found.`, {
      hotel_id: request.hotel_id
    });
  }

  const airport = catalogRepository.getAirport(flight.to);
  const servesHotelCity = airport
    && Array.isArray(airport.serves_cities)
    && airport.serves_cities.includes(hotel.city);

  if (!servesHotelCity) {
    throw badRequest(
      'AIRPORT_CITY_MISMATCH',
      `${flight.to} does not serve ${hotel.city}; choose a compatible flight or hotel.`,
      { airport: flight.to, hotel_city: hotel.city }
    );
  }

  const route = catalogRepository.getRoute(flight.to, hotel.city, hotel.area);
  if (!route) {
    throw badRequest(
      'ROUTE_NOT_FOUND',
      `No taxi route exists from ${flight.to} to ${hotel.area}, ${hotel.city}.`,
      { airport: flight.to, city: hotel.city, area: hotel.area }
    );
  }

  const landing = normalizeLocalDateTime(flight.arrival_local);
  const earliestPickup = addMinutesLocal(landing, 60);
  const pickup = request.pickup
    ? normalizeLocalDateTime(request.pickup)
    : earliestPickup;

  if (!pickup) {
    throw badRequest(
      'INVALID_PICKUP_TIME',
      'Pickup must be a valid local date and time.',
      { pickup: request.pickup }
    );
  }

  if (!isAtOrAfter(pickup, earliestPickup)) {
    throw badRequest(
      'PICKUP_TOO_EARLY',
      `Pickup must be at least 60 minutes after landing. Earliest pickup is ${earliestPickup.slice(0, 16)}.`,
      {
        landing,
        pickup,
        earliest_pickup: earliestPickup
      }
    );
  }

  const busyUntil = addMinutesLocal(pickup, route.drive_minutes * 2);

  return {
    flight,
    hotel,
    airport,
    route,
    landing,
    earliestPickup,
    pickup,
    busyStart: pickup,
    busyUntil,
    passengerCount: request.adults + request.child_ages.length
  };
}

module.exports = {
  buildRideContext
};
