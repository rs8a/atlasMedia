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

        // Solo reiniciar si el estado sigue siendo RUNNING
        if (currentChannel.status === constants.CHANNEL_STATUS.RUNNING) {
          logger.warn(`Canal ${channel.id} (PID ${channel.pid}) ya no está corriendo`);
          
          await channelRepository.updateStatus(channel.id, constants.CHANNEL_STATUS.ERROR);
          await channelRepository.updatePid(channel.id, null);

          // Reinicio automático si está habilitado
          if (currentChannel.auto_restart) {
            logger.info(`Reiniciando automáticamente canal ${channel.id}`);
            setTimeout(() => {
              ffmpegManager.restartChannel(channel.id).catch(err => {
                logger.error(`Error en reinicio automático de canal ${channel.id}:`, err);
              });
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

