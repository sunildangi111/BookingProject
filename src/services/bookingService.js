const catalogRepository = require('../repositories/catalogRepository');
const stateRepository = require('../repositories/stateRepository');
const { getRequestFromState, publicFlight, publicHotel } = require('./rideRequestService');
const { checkSpecificVehicle } = require('./supplierEligibilityService');
const { uniqueBookingReference } = require('../utils/ids');
const { notFound, conflict } = require('../utils/errors');

function getBookingFromState(state, reference) {
  const booking = state.bookings.find((entry) => entry.booking_reference === String(reference));
  if (!booking) {
    throw notFound(
      'BOOKING_NOT_FOUND',
      `Booking ${reference} was not found.`,
      { booking_reference: String(reference) }
    );
  }
  return booking;
}

function createBooking(offerId) {
  const booking = stateRepository.mutate((state) => {
    const offer = state.offers.find((entry) => entry.offer_id === offerId);
    if (!offer) {
      throw notFound('OFFER_NOT_FOUND', `Offer ${offerId} was not found.`, { offer_id: offerId });
    }
    if (offer.status !== 'OPEN') {
      throw conflict(
        'OFFER_NOT_OPEN',
        `Offer ${offerId} is ${offer.status} and cannot be booked.`,
        { offer_id: offerId, status: offer.status }
      );
    }

    const request = getRequestFromState(state, offer.request_id);
    if (request.status !== 'OPEN') {
      throw conflict(
        'REQUEST_ALREADY_BOOKED',
        `Ride request ${request.request_id} is already ${request.status}.`,
        { request_id: request.request_id, status: request.status }
      );
    }

    const company = catalogRepository.getCompany(offer.company_id);
    const vehicle = catalogRepository.getVehicle(offer.company_id, offer.vehicle_id);
    if (!company || !vehicle) {
      throw conflict(
        'OFFER_CATALOG_MISMATCH',
        'The supplier or vehicle on this offer is no longer available.',
        { company_id: offer.company_id, vehicle_id: offer.vehicle_id }
      );
    }

    const selection = checkSpecificVehicle(request, company, vehicle, state);
    if (!selection.eligible) {
      const firstFailure = selection.failures[0];
      throw conflict(
        firstFailure.code,
        `This offer can no longer be booked: ${firstFailure.message}`,
        { failures: selection.failures }
      );
    }

    const now = new Date().toISOString();
    const bookingReference = uniqueBookingReference(
      state.bookings.map((entry) => entry.booking_reference)
    );
    const created = {
      booking_reference: bookingReference,
      request_id: request.request_id,
      offer_id: offer.offer_id,
      company_id: offer.company_id,
      vehicle_id: offer.vehicle_id,
      flight_id: request.flight_id,
      hotel_id: request.hotel_id,
      pickup: selection.context.pickup,
      busy_start: selection.context.busyStart,
      busy_end: selection.context.busyUntil,
      route: {
        airport: selection.context.route.airport,
        city: selection.context.route.city,
        area: selection.context.route.area,
        drive_minutes: selection.context.route.drive_minutes,
        distance_km: selection.context.route.distance_km
      },
      previous_price_inr: offer.previous_price_inr || null,
      price_inr: offer.price_inr,
      status: 'BOOKED',
      created_at: now,
      updated_at: now
    };

    state.bookings.push(created);
    request.status = 'BOOKED';
    request.updated_at = now;

    for (const candidate of state.offers) {
      if (candidate.request_id !== request.request_id || candidate.status !== 'OPEN') {
        continue;
      }
      candidate.status = candidate.offer_id === offer.offer_id ? 'BOOKED' : 'NOT_CHOSEN';
      candidate.updated_at = now;
    }

    return created;
  });

  return getBookingSummary(booking.booking_reference);
}

function getBookingSummary(reference) {
  const state = stateRepository.read();
  const booking = getBookingFromState(state, reference);
  const request = getRequestFromState(state, booking.request_id);
  const flight = catalogRepository.getFlight(booking.flight_id);
  const hotel = catalogRepository.getHotel(booking.hotel_id);
  const company = catalogRepository.getCompany(booking.company_id);
  const vehicle = catalogRepository.getVehicle(booking.company_id, booking.vehicle_id);
  const changes = state.change_requests
    .filter((change) => change.booking_reference === booking.booking_reference)
    .sort((first, second) => second.created_at.localeCompare(first.created_at));

  return {
    booking,
    traveler: {
      traveler_name: request.traveler_name,
      adults: request.adults,
      child_ages: request.child_ages,
      large_bags: request.large_bags,
      small_bags: request.small_bags,
      passenger_count: request.adults + request.child_ages.length
    },
    flight: flight ? publicFlight(flight) : null,
    hotel: hotel ? publicHotel(hotel) : null,
    supplier: company ? {
      company_id: company.company_id,
      name: company.name,
      rating: company.rating,
      service_from: company.service_from,
      service_until: company.service_until
    } : null,
    vehicle,
    changes
  };
}

module.exports = {
  getBookingFromState,
  createBooking,
  getBookingSummary
};
