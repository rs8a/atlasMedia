const channelRepository = require('../repositories/ChannelRepository');
const ffmpegManager = require('./FFmpegManager');
const processUtils = require('../utils/processUtils');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class HealthCheckManager {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Inicia el monitoreo periódico
   */
  start() {
    if (this.isRunning) {
      logger.warn('HealthCheckManager ya está corriendo');
      return;
    }

    this.isRunning = true;
    const interval = constants.HEALTH_CHECK_INTERVAL;

    logger.info(`Iniciando HealthCheckManager con intervalo de ${interval}ms`);

    this.intervalId = setInterval(() => {
      this.checkAllChannels().catch(err => {
        logger.error('Error en health check:', err);
      });
    }, interval);

    // Ejecutar inmediatamente
    this.checkAllChannels().catch(err => {
      logger.error('Error en health check inicial:', err);
    });
  }

  /**
   * Detiene el monitoreo
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('HealthCheckManager detenido');
  }

  /**
   * Verifica el estado de todos los canales
   */
  async checkAllChannels() {
    try {
      const runningChannels = await channelRepository.findRunningChannels();
      
      for (const channel of runningChannels) {
        // Ignorar canales que están siendo reiniciados
        if (channel.status === constants.CHANNEL_STATUS.RESTARTING) {
          continue;
        }
        await this.checkChannel(channel);
      }
    } catch (error) {
      logger.error('Error verificando canales:', error);
    }
  }

  /**
   * Verifica el estado de un canal específico
   */
  async checkChannel(channel) {
    try {
      if (!channel.pid) {
        // Sin PID pero estado running, corregir
        logger.warn(`Canal ${channel.id} tiene estado 'running' pero sin PID`);
        await channelRepository.updateStatus(channel.id, constants.CHANNEL_STATUS.STOPPED);
        return;
      }

      const isRunning = await processUtils.isProcessRunning(channel.pid);
      
      if (!isRunning && channel.status === constants.CHANNEL_STATUS.RUNNING) {
        // Proceso murió pero el estado dice que está corriendo
        // IMPORTANTE: Verificar el estado actualizado desde la BD antes de reiniciar
        // para evitar reiniciar canales que fueron detenidos intencionalmente
        const currentChannel = await channelRepository.findById(channel.id);
        
        if (!currentChannel) {
          logger.warn(`Canal ${channel.id} no encontrado en BD`);
          return;
        }

        // Si el estado fue cambiado a STOPPED después de leer el canal, no reiniciar
        if (currentChannel.status === constants.CHANNEL_STATUS.STOPPED) {
          logger.info(`Canal ${channel.id} fue detenido intencionalmente, no reiniciando`);
          await channelRepository.updatePid(channel.id, null);
          return;
        }

        // Solo reiniciar si el estado sigue siendo RUNNING y no está ya reiniciándose
        if (currentChannel.status === constants.CHANNEL_STATUS.RUNNING) {
          logger.warn(`Canal ${channel.id} (PID ${channel.pid}) ya no está corriendo`);
          
          // Verificar si ya hay un reinicio en progreso antes de actualizar el estado
          // Esto evita condiciones de carrera donde múltiples componentes intentan reiniciar
          const channelStatus = await channelRepository.findById(channel.id);
          if (channelStatus && channelStatus.status === constants.CHANNEL_STATUS.RESTARTING) {
            logger.info(`Canal ${channel.id} ya está siendo reiniciado, ignorando health check`);
            return;
          }
          
          await channelRepository.updateStatus(channel.id, constants.CHANNEL_STATUS.ERROR);
          await channelRepository.updatePid(channel.id, null);

          // Reinicio automático si está habilitado
          if (currentChannel.auto_restart) {
            // Verificar nuevamente el estado antes de reiniciar para evitar bucles
            setTimeout(async () => {
              try {
                const updatedChannel = await channelRepository.findById(channel.id);
                if (!updatedChannel) {
                  logger.warn(`Canal ${channel.id} no encontrado antes de reinicio automático`);
                  return;
                }
                
                // No reiniciar si el canal fue detenido o ya está reiniciándose
                if (updatedChannel.status === constants.CHANNEL_STATUS.STOPPED ||
                    updatedChannel.status === constants.CHANNEL_STATUS.RESTARTING) {
                  logger.info(`Canal ${channel.id} en estado ${updatedChannel.status}, cancelando reinicio automático`);
                  return;
                }
                
                // Verificar una vez más antes de reiniciar (triple verificación)
                const finalCheck = await channelRepository.findById(channel.id);
                if (finalCheck && (finalCheck.status === constants.CHANNEL_STATUS.STOPPED ||
                    finalCheck.status === constants.CHANNEL_STATUS.RESTARTING)) {
                  logger.info(`Canal ${channel.id} cambió de estado a ${finalCheck.status}, cancelando reinicio automático`);
                  return;
                }
                
                logger.info(`Reiniciando automáticamente canal ${channel.id}`);
                await ffmpegManager.restartChannel(channel.id);
              } catch (err) {
                logger.error(`Error en reinicio automático de canal ${channel.id}:`, err);
              }
            }, 5000);
          }
        }
      }
    } catch (error) {
      logger.error(`Error verificando canal ${channel.id}:`, error);
    }
  }

  /**
   * Verifica un canal específico por ID
   */
  async checkChannelById(channelId) {
    const channel = await channelRepository.findById(channelId);
    if (channel) {
      await this.checkChannel(channel);
    }
  }
}

module.exports = new HealthCheckManager();

