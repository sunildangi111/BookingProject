const stateRepository = require('../src/repositories/stateRepository');

async function main() {
  await stateRepository.initMongo();
  const state = stateRepository.reset();
  await stateRepository.closeMongo();

  console.log('Demo state reset successfully.');
  console.log(`Loaded ${state.ride_requests.length} seed ride requests.`);
  console.log('Offers, bookings, and change requests are now empty.');
  if (stateRepository.isMongoConnected()) {
    console.log('MongoDB Atlas collections were cleared and re-seeded.');
  }
}

main().catch((err) => {
  console.error('Reset error:', err);
  process.exit(1);
});
