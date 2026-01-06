const channelService = require('./ChannelService');
const ffmpegManager = require('../managers/FFmpegManager');
const logger = require('../utils/logger');
const viewerTracking = require('./ViewerTrackingService');

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
      let ffmpegStats = ffmpegManager.getFFmpegStats(channelId);
      
      // Si no hay bitrate en las estadísticas de FFmpeg, intentar calcularlo
      if (ffmpegStats && (!ffmpegStats.bitrate || ffmpegStats.bitrate === null)) {
        // Primero intentar usar el bitrate configurado del canal (más confiable)
        if (channel.ffmpeg_params && channel.ffmpeg_params.video_bitrate) {
          // Parsear bitrate configurado (ej: "2M" -> 2000 kbits/s)
          const bitrateStr = channel.ffmpeg_params.video_bitrate.toString();
          const bitrateNum = parseFloat(bitrateStr.replace(/[^\d.]/g, ''));
          let configuredBitrate = bitrateNum;
          if (bitrateStr.includes('M') || bitrateStr.includes('m')) {
            configuredBitrate = bitrateNum * 1000;
          }
          
          // Agregar bitrate de audio si está configurado
          if (channel.ffmpeg_params.audio_bitrate) {
            const audioBitrateStr = channel.ffmpeg_params.audio_bitrate.toString();
            const audioBitrateNum = parseFloat(audioBitrateStr.replace(/[^\d.]/g, ''));
            let audioBitrate = audioBitrateNum;
            if (audioBitrateStr.includes('M') || audioBitrateStr.includes('m')) {
              audioBitrate = audioBitrateNum * 1000;
            } else if (audioBitrateStr.includes('k') || audioBitrateStr.includes('K')) {
              // Ya está en kbits/s
            }
            configuredBitrate += audioBitrate;
          }
          
          ffmpegStats.bitrate = configuredBitrate;
          ffmpegStats.bitrateFormatted = `${configuredBitrate.toFixed(2)} kbits/s`;
          ffmpegStats.bitrateSource = 'configured';
        } else {
          // Si no hay bitrate configurado, intentar calcularlo desde la información de red
          // (solo como último recurso y con validación)
          const processInfo = status.processInfo;
          if (processInfo && processInfo.systemInfo && processInfo.systemInfo.network) {
            const network = processInfo.systemInfo.network;
            const processInfoData = await ffmpegManager.getProcessInfo(channelId);
            
            if (processInfoData && processInfoData.startTime) {
              const now = new Date();
              const startTime = processInfoData.startTime instanceof Date 
                ? processInfoData.startTime 
                : new Date(processInfoData.startTime);
              const elapsedSeconds = (now - startTime) / 1000;
              
              // Solo calcular si han pasado al menos 5 segundos (para tener datos más estables)
              if (elapsedSeconds >= 5 && network.txBytes > 0) {
                // Calcular bitrate desde bytes transmitidos
                // bitrate = (bytes * 8) / tiempo (en kbits/s)
                const calculatedBitrate = (network.txBytes * 8) / (elapsedSeconds * 1000);
                
                // Validar que el bitrate sea razonable (menos de 50 Mbps = 50000 kbits/s)
                // Si es demasiado alto, probablemente incluye datos de otras interfaces
                if (calculatedBitrate > 0 && calculatedBitrate < 50000) {
                  ffmpegStats.bitrate = calculatedBitrate;
                  ffmpegStats.bitrateFormatted = `${calculatedBitrate.toFixed(2)} kbits/s`;
                  ffmpegStats.bitrateSource = 'calculated_from_network';
                } else {
                  logger.debug(`[StatsService] Bitrate calculado demasiado alto o inválido: ${calculatedBitrate} kbits/s, ignorando`);
                }
              }
            }
          }
        }
      }
      
      // Log para debug
      if (ffmpegStats) {
        logger.debug(`[StatsService] Canal ${channelId} tiene estadísticas FFmpeg:`, {
          bitrate: ffmpegStats.bitrate,
          bitrateSource: ffmpegStats.bitrateSource,
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
        viewers: {
          count: viewerTracking.getViewerCount(channelId)
        },
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
            let ffmpegStats = ffmpegManager.getFFmpegStats(channel.id);
            
            // Si no hay bitrate en las estadísticas de FFmpeg, intentar calcularlo
            if (ffmpegStats && (!ffmpegStats.bitrate || ffmpegStats.bitrate === null)) {
              // Primero intentar usar el bitrate configurado del canal (más confiable)
              if (channel.ffmpeg_params && channel.ffmpeg_params.video_bitrate) {
                // Parsear bitrate configurado (ej: "2M" -> 2000 kbits/s)
                const bitrateStr = channel.ffmpeg_params.video_bitrate.toString();
                const bitrateNum = parseFloat(bitrateStr.replace(/[^\d.]/g, ''));
                let configuredBitrate = bitrateNum;
                if (bitrateStr.includes('M') || bitrateStr.includes('m')) {
                  configuredBitrate = bitrateNum * 1000;
                }
                
                // Agregar bitrate de audio si está configurado
                if (channel.ffmpeg_params.audio_bitrate) {
                  const audioBitrateStr = channel.ffmpeg_params.audio_bitrate.toString();
                  const audioBitrateNum = parseFloat(audioBitrateStr.replace(/[^\d.]/g, ''));
                  let audioBitrate = audioBitrateNum;
                  if (audioBitrateStr.includes('M') || audioBitrateStr.includes('m')) {
                    audioBitrate = audioBitrateNum * 1000;
                  } else if (audioBitrateStr.includes('k') || audioBitrateStr.includes('K')) {
                    // Ya está en kbits/s
                  }
                  configuredBitrate += audioBitrate;
                }
                
                ffmpegStats.bitrate = configuredBitrate;
                ffmpegStats.bitrateFormatted = `${configuredBitrate.toFixed(2)} kbits/s`;
                ffmpegStats.bitrateSource = 'configured';
              } else {
                // Si no hay bitrate configurado, intentar calcularlo desde la información de red
                // (solo como último recurso y con validación)
                const processInfo = status.processInfo;
                if (processInfo && processInfo.systemInfo && processInfo.systemInfo.network) {
                  const network = processInfo.systemInfo.network;
                  const processInfoData = await ffmpegManager.getProcessInfo(channel.id);
                  
                  if (processInfoData && processInfoData.startTime) {
                    const now = new Date();
                    const startTime = processInfoData.startTime instanceof Date 
                      ? processInfoData.startTime 
                      : new Date(processInfoData.startTime);
                    const elapsedSeconds = (now - startTime) / 1000;
                    
                    // Solo calcular si han pasado al menos 5 segundos (para tener datos más estables)
                    if (elapsedSeconds >= 5 && network.txBytes > 0) {
                      // Calcular bitrate desde bytes transmitidos
                      const calculatedBitrate = (network.txBytes * 8) / (elapsedSeconds * 1000);
                      
                      // Validar que el bitrate sea razonable (menos de 50 Mbps = 50000 kbits/s)
                      // Si es demasiado alto, probablemente incluye datos de otras interfaces
                      if (calculatedBitrate > 0 && calculatedBitrate < 50000) {
                        ffmpegStats.bitrate = calculatedBitrate;
                        ffmpegStats.bitrateFormatted = `${calculatedBitrate.toFixed(2)} kbits/s`;
                        ffmpegStats.bitrateSource = 'calculated_from_network';
                      } else {
                        logger.debug(`[StatsService] Bitrate calculado demasiado alto o inválido: ${calculatedBitrate} kbits/s, ignorando`);
                      }
                    }
                  }
                }
              }
            }
            
            return {
              channel: channel.toJSON(),
              process: status.processInfo,
              ffmpeg: ffmpegStats, // Estadísticas de transcodificación de FFmpeg
              viewers: {
                count: viewerTracking.getViewerCount(channel.id)
              },
              timestamp: new Date().toISOString()
            };
          } catch (error) {
            logger.error(`Error obteniendo stats para canal ${channel.id}:`, error);
            return {
              channel: channel.toJSON(),
              process: null,
              ffmpeg: null,
              viewers: {
                count: viewerTracking.getViewerCount(channel.id)
              },
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

