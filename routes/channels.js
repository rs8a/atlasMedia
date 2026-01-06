const express = require('express');
const router = express.Router();
const channelController = require('../controllers/ChannelController');
const { validateChannel } = require('../middleware/validator');

// Rutas CRUD básicas
router.get('/', channelController.list.bind(channelController));
router.get('/:id', channelController.get.bind(channelController));
router.post('/', validateChannel, channelController.create.bind(channelController));
router.put('/:id', validateChannel, channelController.update.bind(channelController));
router.delete('/:id', channelController.delete.bind(channelController));

// Rutas de control
router.post('/:id/start', channelController.start.bind(channelController));
router.post('/:id/stop', channelController.stop.bind(channelController));
router.post('/:id/restart', channelController.restart.bind(channelController));

// Rutas de información
router.get('/:id/status', channelController.getStatus.bind(channelController));
router.get('/:id/logs', channelController.getLogs.bind(channelController));
router.delete('/:id/logs', channelController.deleteLogs.bind(channelController));
router.get('/:id/stats', channelController.getStats.bind(channelController));

// Ruta para analizar pistas de audio de un stream
router.post('/analyze-audio', channelController.analyzeAudioTracks.bind(channelController));

module.exports = router;

