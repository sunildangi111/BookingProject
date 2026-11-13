const http = require('http');
const app = require('./src/app');
const stateRepository = require('./src/repositories/stateRepository');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

async function start() {
  await stateRepository.initMongo();

  const server = http.createServer(app);

  server.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[Port Error] Port ${port} is currently in use or still releasing.`);
      console.error(`Please wait a moment and retry, or set a different PORT in your .env file (e.g. PORT=3001).\n`);
    } else {
      console.error('Server error:', error.message);
    }
    await stateRepository.closeMongo();
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`ArrivalRide is running at http://${host}:${port}`);
    if (stateRepository.isMongoConnected()) {
      console.log('MongoDB Atlas: Connected and synchronized successfully.');
    } else {
      console.log('MongoDB Atlas: MONGODB_URI not set or unreachable (using local JSON state fallback).');
    }
  });

  async function shutdown(signal) {
    console.log(`\n${signal} received. Closing ArrivalRide...`);
    server.close(async () => {
      await stateRepository.closeMongo();
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
