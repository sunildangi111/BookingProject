const express = require('express');
const supplierService = require('../services/supplierService');
const offerService = require('../services/offerService');
const changeRequestService = require('../services/changeRequestService');
const { routeHandler } = require('../utils/errors');

const router = express.Router();

router.get('/suppliers/:companyId/dashboard', routeHandler((req, res) => {
  const data = supplierService.getSupplierDashboard(req.params.companyId);
  res.json({ success: true, data });
}));

router.get('/suppliers/:companyId/requests', routeHandler((req, res) => {
  const dashboard = supplierService.getSupplierDashboard(req.params.companyId);
  res.json({
    success: true,
    data: {
      company: dashboard.company,
      requests: dashboard.requests
    }
  });
}));

router.get('/suppliers/:companyId/offers', routeHandler((req, res) => {
  const data = offerService.listSupplierOffers(req.params.companyId);
  res.json({ success: true, data });
}));

router.get('/suppliers/:companyId/changes', routeHandler((req, res) => {
  const data = changeRequestService.listSupplierChanges(req.params.companyId);
  res.json({ success: true, data });
}));

module.exports = router;
