const catalogRepository = require('../repositories/catalogRepository');
const { intervalsOverlap } = require('../utils/dates');

function getBusyIntervals(companyId, vehicleId, state, options = {}) {
  const { excludeBookingReference = null } = options;

  const baseline = catalogRepository.getBaselineBookedRides()
    .filter((ride) => ride.company_id === companyId && ride.vehicle_id === vehicleId)
    .map((ride) => ({
      source: 'CATALOG',
      id: ride.ride_id,
      start: ride.start,
      end: ride.end
    }));

  const appBookings = state.bookings
    .filter((booking) => (
      booking.status === 'BOOKED'
      && booking.company_id === companyId
      && booking.vehicle_id === vehicleId
      && booking.booking_reference !== excludeBookingReference
    ))
    .map((booking) => ({
      source: 'APP',
      id: booking.booking_reference,
      start: booking.busy_start,
      end: booking.busy_end
    }));

  return [...baseline, ...appBookings];
}

function checkVehicleAvailability(companyId, vehicleId, busyStart, busyEnd, state, options = {}) {
  const intervals = getBusyIntervals(companyId, vehicleId, state, options);
  const blockingInterval = intervals.find((interval) => (
    intervalsOverlap(busyStart, busyEnd, interval.start, interval.end)
  ));

  return {
    available: !blockingInterval,
    blocking_interval: blockingInterval || null,
    checked_interval: {
      start: busyStart,
      end: busyEnd
    }
  };
}

module.exports = {
  getBusyIntervals,
  checkVehicleAvailability
};
