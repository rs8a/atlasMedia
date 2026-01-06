const channelService = require('./ChannelService');
const ffmpegManager = require('../managers/FFmpegManager');
const logger = require('../utils/logger');

class StatsService {
  constructor() {
    this.updateInterval = 2000; // Actualizar cada 2 segundos
    this.intervals = new Map(); // Map<channelId, intervalId>
  }

  /**
   * Obtiene estadísticas completas de un canal
   */
  async getChannelStats(channelId) {
    try {
      const channel = await channelService.getChannelById(channelId);
      const status = await channelService.getChannelStatus(channelId);
      
      // Obtener estadísticas de FFmpeg
      const ffmpegStats = ffmpegManager.getFFmpegStats(channelId);
      
      // Log para debug
      if (ffmpegStats) {
        logger.debug(`[StatsService] Canal ${channelId} tiene estadísticas FFmpeg:`, {
          bitrate: ffmpegStats.bitrate,
          fps: ffmpegStats.fps,
          frame: ffmpegStats.frame
        });
      } else {
        logger.debug(`[StatsService] Canal ${channelId} no tiene estadísticas FFmpeg aún`);
      }
      
      return {
        channel: channel.toJSON(),
        process: status.processInfo,
        ffmpeg: ffmpegStats, // Estadísticas de transcodificación de FFmpeg
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Error obteniendo estadísticas para canal ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de todos los canales
   */
  async getAllChannelsStats() {
    try {
      const channels = await channelService.getAllChannels();
      const stats = await Promise.all(
        channels.map(async (channel) => {
          try {
            const status = await channelService.getChannelStatus(channel.id);
            // Obtener estadísticas de FFmpeg
            const ffmpegStats = ffmpegManager.getFFmpegStats(channel.id);
            
            return {
              channel: channel.toJSON(),
              process: status.processInfo,
              ffmpeg: ffmpegStats, // Estadísticas de transcodificación de FFmpeg
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            logger.error(`Error obteniendo stats para canal ${channel.id}:`, error);
            return {
              channel: channel.toJSON(),
              process: null,
              ffmpeg: null,
              error: error.message,
              timestamp: new Date().toISOString()
            };
          }
        })
      );
      
      return stats;
    } catch (error) {
      logger.error('Error obteniendo estadísticas de todos los canales:', error);
      throw error;
    }
  }
}

module.exports = new StatsService();

