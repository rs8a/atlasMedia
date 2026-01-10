const express = require('express');
const router = express.Router();
const hardwareController = require('../controllers/HardwareController');

// Ruta para obtener GPUs disponibles
router.get('/gpus', hardwareController.getGPUs.bind(hardwareController));

module.exports = router;
