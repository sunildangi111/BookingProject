const express = require('express');
const bookingService = require('../services/bookingService');
const changeRequestService = require('../services/changeRequestService');
const { routeHandler } = require('../utils/errors');

const router = express.Router();

router.post('/offers/:offerId/book', routeHandler((req, res) => {
  const data = bookingService.createBooking(req.params.offerId);
  res.status(201).json({ success: true, data });
}));

router.get('/bookings/:reference', routeHandler((req, res) => {
  const data = bookingService.getBookingSummary(req.params.reference);
  res.json({ success: true, data });
}));

router.post('/bookings/:reference/changes', routeHandler((req, res) => {
  const data = changeRequestService.createChangeRequest(req.params.reference, req.body || {});
  res.status(201).json({ success: true, data });
}));

router.patch('/change-requests/:changeId', routeHandler((req, res) => {
  const data = changeRequestService.decideChange(req.params.changeId, req.body || {});
  res.json({ success: true, data });
}));

module.exports = router;
