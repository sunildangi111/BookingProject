const express = require('express');
const catalogRepository = require('../repositories/catalogRepository');
const rideRequestService = require('../services/rideRequestService');
const { routeHandler } = require('../utils/errors');

const router = express.Router();

function publicSupplier(company) {
  return {
    company_id: company.company_id,
    name: company.name,
    airports: company.airports,
    areas: company.areas,
    service_from: company.service_from,
    service_until: company.service_until,
    rating: company.rating,
    vehicles: company.vehicles
  };
}

router.get('/catalog/bootstrap', routeHandler((req, res) => {
  res.json({
    success: true,
    data: {
      flights: catalogRepository.arrivalFlights.map(rideRequestService.publicFlight),
      hotels: catalogRepository.hotels.map(rideRequestService.publicHotel),
      airports: catalogRepository.airports,
      suppliers: catalogRepository.companies.map(publicSupplier),
      car_types: rideRequestService.CAR_TYPES,
      stats: catalogRepository.getStats()
    }
  });
}));

router.get('/catalog/flights', routeHandler((req, res) => {
  const airport = req.query.airport ? String(req.query.airport).toUpperCase() : null;
  const flights = catalogRepository.arrivalFlights
    .filter((flight) => !airport || flight.to === airport)
    .map(rideRequestService.publicFlight);
  res.json({ success: true, data: flights });
}));

router.get('/catalog/hotels', routeHandler((req, res) => {
  const airport = req.query.airport ? String(req.query.airport).toUpperCase() : null;
  const hotels = airport
    ? catalogRepository.listHotelsForAirport(airport)
    : catalogRepository.hotels;
  res.json({ success: true, data: hotels.map(rideRequestService.publicHotel) });
}));

router.get('/catalog/suppliers', routeHandler((req, res) => {
  res.json({
    success: true,
    data: catalogRepository.companies.map(publicSupplier)
  });
}));

router.get('/routes/quote', routeHandler((req, res) => {
  const data = rideRequestService.quote(req.query.flightId, req.query.hotelId);
  res.json({ success: true, data });
}));

module.exports = router;
