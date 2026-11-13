const stateRepository = require('../src/repositories/stateRepository');

const state = stateRepository.reset();
console.log('Demo state reset successfully.');
console.log(`Loaded ${state.ride_requests.length} seed ride requests.`);
console.log('Offers, bookings, and change requests are now empty.');
