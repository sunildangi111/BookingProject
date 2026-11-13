const express = require('express');
const offerService = require('../services/offerService');
const { routeHandler } = require('../utils/errors');

const router = express.Router();

router.post('/ride-requests/:requestId/offers', routeHandler((req, res) => {
  const data = offerService.createOffer(req.params.requestId, req.body || {});
  res.status(201).json({ success: true, data });
}));

router.patch('/offers/:offerId/price', routeHandler((req, res) => {
  const data = offerService.updateOfferPrice(req.params.offerId, req.body || {});
  res.json({ success: true, data });
}));

router.patch('/offers/:offerId/reject', routeHandler((req, res) => {
  const data = offerService.rejectOffer(req.params.offerId);
  res.json({ success: true, data });
}));

module.exports = router;
