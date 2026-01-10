const gpuDetectionService = require('../services/GPUDetectionService');
const logger = require('../utils/logger');

class HardwareController {
  /**
   * Obtiene la lista de GPUs disponibles
   */
  async getGPUs(req, res, next) {
    try {
      const gpus = await gpuDetectionService.detectGPUs();
      
      res.json({
        gpus: gpus,
        total: gpus.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error obteniendo GPUs:', error);
      next(error);
    }
  }
}

module.exports = new HardwareController();
