const express = require('express');
const rideRequestService = require('../services/rideRequestService');
const offerService = require('../services/offerService');
const { routeHandler } = require('../utils/errors');

const router = express.Router();

router.post('/ride-requests', routeHandler((req, res) => {
  const data = rideRequestService.createRideRequest(req.body || {});
  res.status(201).json({ success: true, data });
}));

router.get('/ride-requests/:requestId/offers', routeHandler((req, res) => {
  const request = rideRequestService.getRideRequest(req.params.requestId);
  const offers = offerService.listRequestOffers(req.params.requestId);
  res.json({ success: true, data: { request, offers } });
}));

router.get('/ride-requests/:requestId/eligibility', routeHandler((req, res) => {
  const data = rideRequestService.getRideRequestWithEligibility(req.params.requestId);
  res.json({ success: true, data });
}));

router.get('/ride-requests/:requestId', routeHandler((req, res) => {
  const data = rideRequestService.getRideRequestWithEligibility(req.params.requestId);
  res.json({ success: true, data });
}));

module.exports = router;
