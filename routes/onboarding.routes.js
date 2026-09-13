const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboarding.controller');

router.get('/check-domain/:domainId', onboardingController.checkDomain);
router.post('/register', onboardingController.register);

module.exports = router;