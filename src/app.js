const path = require('path');
const express = require('express');
const catalogRepository = require('./repositories/catalogRepository');
const stateRepository = require('./repositories/stateRepository');
const { AppError } = require('./utils/errors');
const catalogRoutes = require('./routes/catalogRoutes');
const rideRequestRoutes = require('./routes/rideRequestRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const offerRoutes = require('./routes/offerRoutes');
const bookingRoutes = require('./routes/bookingRoutes');

const app = express();
const publicDirectory = path.resolve(__dirname, '../public');

app.disable('x-powered-by');
app.use(express.json({ limit: '250kb' }));

app.get('/api/health', (req, res) => {
  const state = stateRepository.read();
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'ArrivalRide API',
      database: stateRepository.isMongoConnected() ? 'mongodb-atlas' : 'local-storage',
      catalog: catalogRepository.getStats(),
      state: {
        ride_requests: state.ride_requests.length,
        offers: state.offers.length,
        bookings: state.bookings.length,
        change_requests: state.change_requests.length
      }
    }
  });
});

app.use('/api', catalogRoutes);
app.use('/api', rideRequestRoutes);
app.use('/api', supplierRoutes);
app.use('/api', offerRoutes);
app.use('/api', bookingRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: `No API route matches ${req.method} ${req.originalUrl}.`,
      details: null
    }
  });
});

app.use(express.static(publicDirectory, {
  etag: true,
  maxAge: 0
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.',
        details: null
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something unexpected happened. Please retry.',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    }
  });
});

module.exports = app;
