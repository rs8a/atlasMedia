const channelService = require('../services/ChannelService');
const logService = require('../services/LogService');
const logger = require('../utils/logger');

class ChannelController {
  /**
   * Lista todos los canales
   */
  async list(req, res, next) {
    try {
      const channels = await channelService.getAllChannels();
      res.json(channels.map(c => c.toJSON()));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene un canal por ID
   */
  async get(req, res, next) {
    try {
      const channel = await channelService.getChannelById(req.params.id);
      res.json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea un nuevo canal
   */
  async create(req, res, next) {
    try {
      const channel = await channelService.createChannel(req.body);
      res.status(201).json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza un canal
   */
  async update(req, res, next) {
    try {
      const channel = await channelService.updateChannel(req.params.id, req.body);
      res.json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Elimina un canal
   */
  async delete(req, res, next) {
    try {
      await channelService.deleteChannel(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Inicia un canal
   */
  async start(req, res, next) {
    try {
      const channel = await channelService.startChannel(req.params.id);
      res.json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Detiene un canal
   */
  async stop(req, res, next) {
    try {
      const channel = await channelService.stopChannel(req.params.id);
      res.json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reinicia un canal
   */
  async restart(req, res, next) {
    try {
      const channel = await channelService.restartChannel(req.params.id);
      res.json(channel.toJSON());
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene el estado de un canal
   */
  async getStatus(req, res, next) {
    try {
      const status = await channelService.getChannelStatus(req.params.id);
      res.json(status);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene logs de un canal
   */
  async getLogs(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const level = req.query.level || null;

      const logs = await logService.getLogs(req.params.id, { limit, offset, level });
      const total = await logService.getLogCount(req.params.id, level);

      res.json({
        logs,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + logs.length < total
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene estadísticas de un canal
   */
  async getStats(req, res, next) {
    try {
      const channel = await channelService.getChannelById(req.params.id);
      const logStats = await logService.getLogStats(req.params.id);
      const status = await channelService.getChannelStatus(req.params.id);

      res.json({
        channel: channel.toJSON(),
        logs: logStats,
        process: status.processInfo
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Elimina todos los logs de un canal
   */
  async deleteLogs(req, res, next) {
    try {
      // Verificar que el canal existe
      await channelService.getChannelById(req.params.id);
      
      // Eliminar los logs
      await logService.deleteLogs(req.params.id);
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ChannelController();

