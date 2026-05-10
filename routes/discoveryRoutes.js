const express = require('express');
const auth = require('../middleware/auth');
const { getDiscovery } = require('../controllers/discoveryController');

const router = express.Router();

router.get('/', auth, getDiscovery);

module.exports = router;
