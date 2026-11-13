const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.resolve(__dirname, '../../data');
const ARRIVAL_AIRPORTS = new Set(['NRT', 'HND', 'KIX', 'DXB', 'AUH']);

function readJson(relativePath) {
  const absolutePath = path.join(DATA_ROOT, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const airports = deepFreeze(readJson('catalog/airports.json'));
const allFlights = deepFreeze(readJson('catalog/flights.json'));
const hotels = deepFreeze(readJson('catalog/hotels.json'));
const routes = deepFreeze(readJson('problem-2/routes.json'));
const companies = deepFreeze(readJson('problem-2/taxi_companies.json'));
const openRequests = deepFreeze(readJson('problem-2/open_requests.json'));
const bookedRides = deepFreeze(readJson('problem-2/booked_rides.json'));

const arrivalFlights = allFlights
  .filter((flight) => ARRIVAL_AIRPORTS.has(flight.to))
  .sort((first, second) => first.arrival_local.localeCompare(second.arrival_local));

const airportByCode = new Map(airports.map((airport) => [airport.code, airport]));
const flightById = new Map(allFlights.map((flight) => [flight.flight_id, flight]));
const hotelById = new Map(hotels.map((hotel) => [hotel.hotel_id, hotel]));
const companyById = new Map(companies.map((company) => [company.company_id, company]));

function getAirport(code) {
  return airportByCode.get(code) || null;
}

function getFlight(flightId) {
  return flightById.get(flightId) || null;
}

function getHotel(hotelId) {
  return hotelById.get(hotelId) || null;
}

function getCompany(companyId) {
  return companyById.get(companyId) || null;
}

function getVehicle(companyId, vehicleId) {
  const company = getCompany(companyId);
  return company ? company.vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId) || null : null;
}

function getRoute(airport, city, area) {
  return routes.find((route) => (
    route.airport === airport
    && route.city === city
    && route.area === area
  )) || null;
}

function listHotelsForAirport(airportCode) {
  const airport = getAirport(airportCode);
  if (!airport || !Array.isArray(airport.serves_cities)) {
    return [];
  }

  return hotels.filter((hotel) => airport.serves_cities.includes(hotel.city));
}

function countVehicles() {
  return companies.reduce((total, company) => total + company.vehicles.length, 0);
}

function getStats() {
  return {
    airports: airports.length,
    flights: allFlights.length,
    arrival_flights: arrivalFlights.length,
    hotels: hotels.length,
    routes: routes.length,
    suppliers: companies.length,
    vehicles: countVehicles(),
    seed_requests: openRequests.length,
    baseline_booked_rides: bookedRides.length
  };
}

module.exports = {
  ARRIVAL_AIRPORTS,
  airports,
  arrivalFlights,
  hotels,
  routes,
  companies,
  getAirport,
  getFlight,
  getHotel,
  getCompany,
  getVehicle,
  getRoute,
  listHotelsForAirport,
  getSeedRequests: () => openRequests,
  getBaselineBookedRides: () => bookedRides,
  getStats
};
