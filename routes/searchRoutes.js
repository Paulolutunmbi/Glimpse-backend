const express = require('express');
const auth = require('../middleware/auth');
const { search } = require('../controllers/searchController');

const router = express.Router();

router.get('/', auth, search);

module.exports = router;
