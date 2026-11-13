const catalogRepository = require('../repositories/catalogRepository');
const stateRepository = require('../repositories/stateRepository');
const { getRequestFromState } = require('./rideRequestService');
const { checkSpecificVehicle } = require('./supplierEligibilityService');
const { priceRangeFailure } = require('../rules/taxiRules');
const { requiredString, wholeMoney } = require('../utils/validation');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { nextEntityId } = require('../utils/ids');

function enrichOffer(offer) {
  const company = catalogRepository.getCompany(offer.company_id);
  const vehicle = catalogRepository.getVehicle(offer.company_id, offer.vehicle_id);
  return {
    ...offer,
    company: company ? {
      company_id: company.company_id,
      name: company.name,
      rating: company.rating
    } : null,
    vehicle
  };
}

function createOffer(requestId, body) {
  const companyId = requiredString(
    body.company_id !== undefined ? body.company_id : body.companyId,
    'Supplier',
    'SUPPLIER_REQUIRED'
  );
  const vehicleId = requiredString(
    body.vehicle_id !== undefined ? body.vehicle_id : body.vehicleId,
    'Vehicle',
    'VEHICLE_REQUIRED'
  );
  const price = wholeMoney(
    body.price_inr !== undefined ? body.price_inr : body.priceInr,
    'Supplier price'
  );

  const created = stateRepository.mutate((state) => {
    const request = getRequestFromState(state, requestId);
    if (request.status !== 'OPEN') {
      throw conflict(
        'REQUEST_NOT_OPEN',
        `Ride request ${requestId} is ${request.status} and cannot receive new offers.`,
        { request_id: requestId, status: request.status }
      );
    }

    const company = catalogRepository.getCompany(companyId);
    if (!company) {
      throw notFound('SUPPLIER_NOT_FOUND', `Supplier ${companyId} was not found.`, {
        company_id: companyId
      });
    }

    const vehicle = catalogRepository.getVehicle(companyId, vehicleId);
    if (!vehicle) {
      throw badRequest(
        'VEHICLE_NOT_FOUND',
        `Vehicle ${vehicleId} does not belong to ${company.name}.`,
        { company_id: companyId, vehicle_id: vehicleId }
      );
    }

    const selection = checkSpecificVehicle(request, company, vehicle, state);
    if (!selection.eligible) {
      throw badRequest(
        selection.failures[0].code,
        selection.failures[0].message,
        { failures: selection.failures }
      );
    }

    const priceFailure = priceRangeFailure(price, selection.context.route);
    if (priceFailure) {
      throw badRequest(priceFailure.code, priceFailure.message, priceFailure.details);
    }

    const duplicate = state.offers.find((offer) => (
      offer.request_id === requestId
      && offer.company_id === companyId
      && offer.vehicle_id === vehicleId
      && offer.status === 'OPEN'
    ));
    if (duplicate) {
      if (duplicate.price_inr === price) {
        throw conflict(
          'DUPLICATE_OFFER',
          `${vehicleId} already has an open offer for ${requestId} at ₹${price}.`,
          { offer_id: duplicate.offer_id }
        );
      }
      const now = new Date().toISOString();
      duplicate.previous_price_inr = duplicate.price_inr;
      duplicate.price_inr = price;
      duplicate.price_updated_at = now;
      duplicate.updated_at = now;
      return duplicate;
    }

    const now = new Date().toISOString();
    const offer = {
      offer_id: nextEntityId(state, 'offer', 'OFF'),
      request_id: requestId,
      company_id: companyId,
      vehicle_id: vehicleId,
      previous_price_inr: null,
      price_inr: price,
      status: 'OPEN',
      created_at: now,
      updated_at: now
    };
    state.offers.push(offer);
    return offer;
  });

  return enrichOffer(created);
}

function updateOfferPrice(offerId, body) {
  const price = wholeMoney(
    body.price_inr !== undefined ? body.price_inr : body.priceInr,
    'Updated price'
  );

  const updated = stateRepository.mutate((state) => {
    const offer = state.offers.find((entry) => entry.offer_id === offerId);
    if (!offer) {
      throw notFound('OFFER_NOT_FOUND', `Offer ${offerId} was not found.`, { offer_id: offerId });
    }

    if (offer.status !== 'OPEN') {
      throw conflict(
        'OFFER_NOT_OPEN',
        `Offer ${offerId} is ${offer.status} and its price cannot be changed.`,
        { offer_id: offerId, status: offer.status }
      );
    }

    const request = getRequestFromState(state, offer.request_id);
    const company = catalogRepository.getCompany(offer.company_id);
    const vehicle = catalogRepository.getVehicle(offer.company_id, offer.vehicle_id);

    const selection = checkSpecificVehicle(request, company, vehicle, state);
    const priceFailure = priceRangeFailure(price, selection.context.route);
    if (priceFailure) {
      throw badRequest(priceFailure.code, priceFailure.message, priceFailure.details);
    }

    const now = new Date().toISOString();
    offer.previous_price_inr = offer.price_inr;
    offer.price_inr = price;
    offer.price_updated_at = now;
    offer.updated_at = now;
    return offer;
  });

  return enrichOffer(updated);
}

function listRequestOffers(requestId) {
  const state = stateRepository.read();
  getRequestFromState(state, requestId);
  return state.offers
    .filter((offer) => offer.request_id === requestId)
    .map(enrichOffer)
    .sort((first, second) => first.price_inr - second.price_inr);
}

function listSupplierOffers(companyId) {
  const company = catalogRepository.getCompany(companyId);
  if (!company) {
    throw notFound('SUPPLIER_NOT_FOUND', `Supplier ${companyId} was not found.`, {
      company_id: companyId
    });
  }

  return stateRepository.read().offers
    .filter((offer) => offer.company_id === companyId)
    .map(enrichOffer)
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

function rejectOffer(offerId) {
  const rejected = stateRepository.mutate((state) => {
    const offer = state.offers.find((entry) => entry.offer_id === offerId);
    if (!offer) {
      throw notFound('OFFER_NOT_FOUND', `Offer ${offerId} was not found.`, { offer_id: offerId });
    }

    if (offer.status !== 'OPEN') {
      throw conflict(
        'OFFER_NOT_OPEN',
        `Offer ${offerId} is ${offer.status} and cannot be rejected.`,
        { offer_id: offerId, status: offer.status }
      );
    }

    offer.status = 'REJECTED';
    offer.updated_at = new Date().toISOString();
    return offer;
  });

  return enrichOffer(rejected);
}

module.exports = {
  enrichOffer,
  createOffer,
  updateOfferPrice,
  listRequestOffers,
  listSupplierOffers,
  rejectOffer
};
