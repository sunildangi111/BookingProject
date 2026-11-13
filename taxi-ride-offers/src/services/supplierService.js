const stateRepository = require('../repositories/stateRepository');
const { supplierDashboard } = require('./supplierEligibilityService');
const { enrichRequest } = require('./rideRequestService');
const { listSupplierOffers } = require('./offerService');
const { listSupplierChanges } = require('./changeRequestService');

function getSupplierDashboard(companyId) {
  const state = stateRepository.read();
  const dashboard = supplierDashboard(companyId, state, enrichRequest);
  const requests = dashboard.requests.map((entry) => ({
    request: entry.request,
    eligible_vehicle_count: entry.eligibility.eligible_vehicles.length,
    vehicle_options: entry.eligibility.vehicle_options.map((option) => ({
      vehicle: option.vehicle,
      eligible: option.eligible,
      failures: option.failures
    }))
  }));
  const offers = listSupplierOffers(companyId);
  const changes = listSupplierChanges(companyId);

  return {
    company: dashboard.company,
    stats: {
      serviceable_requests: requests.length,
      open_offers: offers.filter((offer) => offer.status === 'OPEN').length,
      booked_offers: offers.filter((offer) => offer.status === 'BOOKED').length,
      pending_changes: changes.filter((change) => change.status === 'PENDING').length
    },
    requests,
    offers,
    changes
  };
}

module.exports = {
  getSupplierDashboard
};
