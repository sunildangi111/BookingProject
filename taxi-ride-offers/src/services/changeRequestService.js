const catalogRepository = require('../repositories/catalogRepository');
const stateRepository = require('../repositories/stateRepository');
const { getBookingFromState, getBookingSummary } = require('./bookingService');
const { getRequestFromState, publicFlight, publicHotel } = require('./rideRequestService');
const { buildRideContext } = require('./rideContextService');
const { checkSpecificVehicle } = require('./supplierEligibilityService');
const { optionalString, enumValue } = require('../utils/validation');
const { normalizeLocalDateTime } = require('../utils/dates');
const { nextEntityId } = require('../utils/ids');
const { badRequest, notFound, conflict } = require('../utils/errors');

function createChangeRequest(reference, body) {
  const rawFlightId = body.new_flight_id !== undefined ? body.new_flight_id : body.newFlightId;
  const rawPickup = body.new_pickup !== undefined ? body.new_pickup : body.newPickupLocal;
  const newFlightId = optionalString(rawFlightId);
  const newPickup = optionalString(rawPickup);

  if (!newFlightId && !newPickup) {
    throw badRequest(
      'CHANGE_REQUIRED',
      'Provide a new flight, a new pickup time, or both.',
      null
    );
  }
  if (newPickup && !normalizeLocalDateTime(newPickup)) {
    throw badRequest('INVALID_PICKUP_TIME', 'New pickup must be a valid local date and time.', {
      pickup: newPickup
    });
  }

  const created = stateRepository.mutate((state) => {
    const booking = getBookingFromState(state, reference);
    const request = getRequestFromState(state, booking.request_id);

    const alreadyPending = state.change_requests.find((change) => (
      change.booking_reference === booking.booking_reference && change.status === 'PENDING'
    ));
    if (alreadyPending) {
      throw conflict(
        'CHANGE_ALREADY_PENDING',
        `Booking ${reference} already has pending change ${alreadyPending.change_id}.`,
        { change_id: alreadyPending.change_id }
      );
    }

    const proposedFlightId = newFlightId || booking.flight_id;
    const candidate = {
      ...request,
      flight_id: proposedFlightId,
      hotel_id: booking.hotel_id,
      pickup: newPickup || (newFlightId ? null : booking.pickup)
    };
    const context = buildRideContext(candidate);

    if (proposedFlightId === booking.flight_id && context.pickup === booking.pickup) {
      throw badRequest('NO_CHANGE', 'The proposed flight and pickup are the same as the current booking.');
    }

    const company = catalogRepository.getCompany(booking.company_id);
    const vehicle = catalogRepository.getVehicle(booking.company_id, booking.vehicle_id);
    const selection = checkSpecificVehicle(candidate, company, vehicle, state, {
      excludeBookingReference: booking.booking_reference
    });
    const now = new Date().toISOString();
    const change = {
      change_id: nextEntityId(state, 'change', 'CHG'),
      booking_reference: booking.booking_reference,
      company_id: booking.company_id,
      current_flight_id: booking.flight_id,
      current_pickup: booking.pickup,
      proposed_flight_id: proposedFlightId,
      proposed_pickup: context.pickup,
      proposed_busy_start: context.busyStart,
      proposed_busy_end: context.busyUntil,
      status: 'PENDING',
      preview_eligible: selection.eligible,
      preview_failures: selection.failures,
      created_at: now,
      decided_at: null
    };
    state.change_requests.push(change);
    return change;
  });

  return enrichChange(created);
}

function enrichChange(change) {
  const currentFlight = catalogRepository.getFlight(change.current_flight_id);
  const proposedFlight = catalogRepository.getFlight(change.proposed_flight_id);
  return {
    ...change,
    current_flight: currentFlight ? publicFlight(currentFlight) : null,
    proposed_flight: proposedFlight ? publicFlight(proposedFlight) : null
  };
}

function listSupplierChanges(companyId) {
  const company = catalogRepository.getCompany(companyId);
  if (!company) {
    throw notFound('SUPPLIER_NOT_FOUND', `Supplier ${companyId} was not found.`, {
      company_id: companyId
    });
  }

  const state = stateRepository.read();
  return state.change_requests
    .filter((change) => change.company_id === companyId)
    .map((change) => {
      const booking = getBookingFromState(state, change.booking_reference);
      const request = getRequestFromState(state, booking.request_id);
      const hotel = catalogRepository.getHotel(booking.hotel_id);
      return {
        ...enrichChange(change),
        traveler_name: request.traveler_name,
        hotel: hotel ? publicHotel(hotel) : null,
        vehicle_id: booking.vehicle_id
      };
    })
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

function decideChange(changeId, body) {
  const decision = enumValue(body.decision, 'Decision', ['ACCEPT', 'REJECT'], {
    code: 'INVALID_CHANGE_DECISION'
  });
  const actingCompanyId = optionalString(
    body.company_id !== undefined ? body.company_id : body.companyId
  );

  const result = stateRepository.mutate((state) => {
    const change = state.change_requests.find((entry) => entry.change_id === changeId);
    if (!change) {
      throw notFound('CHANGE_NOT_FOUND', `Change request ${changeId} was not found.`, {
        change_id: changeId
      });
    }
    if (change.status !== 'PENDING') {
      throw conflict(
        'CHANGE_NOT_PENDING',
        `Change request ${changeId} is already ${change.status}.`,
        { status: change.status }
      );
    }
    if (actingCompanyId && actingCompanyId !== change.company_id) {
      throw conflict(
        'SUPPLIER_MISMATCH',
        `Only supplier ${change.company_id} can decide this change.`,
        { expected_company_id: change.company_id }
      );
    }

    const now = new Date().toISOString();
    if (decision === 'REJECT') {
      change.status = 'REJECTED';
      change.decided_at = now;
      return { change, booking_reference: change.booking_reference };
    }

    const booking = getBookingFromState(state, change.booking_reference);
    const request = getRequestFromState(state, booking.request_id);
    const candidate = {
      ...request,
      flight_id: change.proposed_flight_id,
      hotel_id: booking.hotel_id,
      pickup: change.proposed_pickup
    };
    const company = catalogRepository.getCompany(booking.company_id);
    const vehicle = catalogRepository.getVehicle(booking.company_id, booking.vehicle_id);
    const selection = checkSpecificVehicle(candidate, company, vehicle, state, {
      excludeBookingReference: booking.booking_reference
    });

    if (!selection.eligible) {
      const firstFailure = selection.failures[0];
      throw conflict(
        firstFailure.code,
        `Change cannot be accepted: ${firstFailure.message}`,
        { failures: selection.failures }
      );
    }

    booking.flight_id = change.proposed_flight_id;
    booking.pickup = selection.context.pickup;
    booking.busy_start = selection.context.busyStart;
    booking.busy_end = selection.context.busyUntil;
    booking.route = {
      airport: selection.context.route.airport,
      city: selection.context.route.city,
      area: selection.context.route.area,
      drive_minutes: selection.context.route.drive_minutes,
      distance_km: selection.context.route.distance_km
    };
    booking.updated_at = now;

    request.flight_id = booking.flight_id;
    request.pickup = booking.pickup;
    request.updated_at = now;

    change.status = 'ACCEPTED';
    change.decided_at = now;
    change.preview_eligible = true;
    change.preview_failures = [];

    return { change, booking_reference: booking.booking_reference };
  });

  return {
    change: enrichChange(result.change),
    booking: getBookingSummary(result.booking_reference)
  };
}

module.exports = {
  createChangeRequest,
  enrichChange,
  listSupplierChanges,
  decideChange
};
