const catalogRepository = require('../repositories/catalogRepository');
const { buildRideContext } = require('./rideContextService');
const { checkVehicleAvailability } = require('./vehicleAvailabilityService');
const {
  ruleFailure,
  vehicleFitFailures,
  supplierCoverageFailures
} = require('../rules/taxiRules');
const { notFound } = require('../utils/errors');

function vehicleOption(request, context, company, vehicle, state, options = {}) {
  const fitFailures = vehicleFitFailures(vehicle, request);
  const availability = checkVehicleAvailability(
    company.company_id,
    vehicle.vehicle_id,
    context.busyStart,
    context.busyUntil,
    state,
    options
  );

  const failures = [...fitFailures];
  if (!availability.available) {
    failures.push(ruleFailure(
      'VEHICLE_BUSY',
      `${vehicle.vehicle_id} is already busy from ${availability.blocking_interval.start.slice(0, 16)} to ${availability.blocking_interval.end.slice(0, 16)}.`,
      availability.blocking_interval
    ));
  }

  return {
    vehicle,
    eligible: failures.length === 0,
    failures,
    availability
  };
}

function checkSupplierForRequest(request, company, state, options = {}) {
  const context = buildRideContext(request);
  const coverageFailures = supplierCoverageFailures(company, context);
  const vehicleOptions = company.vehicles.map((vehicle) => (
    vehicleOption(request, context, company, vehicle, state, options)
  ));

  const fittingVehicles = vehicleOptions.filter((option) => (
    option.failures.every((failure) => failure.code === 'VEHICLE_BUSY')
  ));
  const freeFittingVehicles = vehicleOptions.filter((option) => option.eligible);
  const aggregateFailures = [...coverageFailures];

  if (coverageFailures.length === 0 && fittingVehicles.length === 0) {
    aggregateFailures.push(ruleFailure(
      'NO_FITTING_VEHICLE',
      `${company.name} has no vehicle that fits ${context.passengerCount} passengers, ${request.large_bags} large bags, and ${request.small_bags} small bags${request.car_type ? ` with type ${request.car_type}` : ''}.`,
      {
        passengers: context.passengerCount,
        large_bags: request.large_bags,
        small_bags: request.small_bags,
        car_type: request.car_type
      }
    ));
  } else if (coverageFailures.length === 0 && freeFittingVehicles.length === 0) {
    aggregateFailures.push(ruleFailure(
      'NO_FREE_VEHICLE',
      `${company.name}'s fitting vehicles are busy during ${context.busyStart.slice(0, 16)}–${context.busyUntil.slice(0, 16)}.`,
      { start: context.busyStart, end: context.busyUntil }
    ));
  }

  return {
    company,
    eligible: coverageFailures.length === 0 && freeFittingVehicles.length > 0,
    failures: aggregateFailures,
    vehicle_options: vehicleOptions,
    eligible_vehicles: freeFittingVehicles.map((option) => option.vehicle),
    context
  };
}

function checkSpecificVehicle(request, company, vehicle, state, options = {}) {
  const context = buildRideContext(request);
  const coverageFailures = supplierCoverageFailures(company, context);
  const option = vehicleOption(request, context, company, vehicle, state, options);
  return {
    eligible: coverageFailures.length === 0 && option.eligible,
    failures: [...coverageFailures, ...option.failures],
    context,
    vehicle_option: option
  };
}

function marketplaceEligibility(request, state) {
  const results = catalogRepository.companies.map((company) => (
    checkSupplierForRequest(request, company, state)
  ));

  return {
    eligible: results.filter((result) => result.eligible),
    ineligible: results.filter((result) => !result.eligible)
  };
}

function supplierDashboard(companyId, state, enrichRequest) {
  const company = catalogRepository.getCompany(companyId);
  if (!company) {
    throw notFound('SUPPLIER_NOT_FOUND', `Supplier ${companyId} was not found.`, { company_id: companyId });
  }

  const requests = state.ride_requests
    .filter((request) => request.status === 'OPEN')
    .map((request) => {
      const eligibility = checkSupplierForRequest(request, company, state);
      return {
        eligibility,
        request: enrichRequest(request)
      };
    })
    .filter((entry) => entry.eligibility.eligible);

  return {
    company,
    requests
  };
}

module.exports = {
  checkSupplierForRequest,
  checkSpecificVehicle,
  marketplaceEligibility,
  supplierDashboard
};
