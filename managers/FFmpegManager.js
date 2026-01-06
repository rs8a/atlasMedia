const { spawn } = require('child_process');
const EventEmitter = require('events');
const channelRepository = require('../repositories/ChannelRepository');
const ffmpegBuilder = require('../builders/FFmpegCommandBuilder');
const fileSystem = require('../utils/fileSystem');
const processUtils = require('../utils/processUtils');
const logger = require('../utils/logger');
const constants = require('../config/constants');
const ffmpegStatsParser = require('../utils/FFmpegStatsParser');

class FFmpegManager extends EventEmitter {
  constructor() {
    super();
    // Map<channelId, ProcessInfo>
    this.activeProcesses = new Map();
    // Set<channelId> - Canales que están siendo reiniciados actualmente
    this.restartingChannels = new Set();
    // Map<channelId, { count: number, lastAttempt: Date }> - Contador de intentos de reinicio
    this.restartAttempts = new Map();
  }

  /**
   * Inicia un proceso FFmpeg para un canal
   */
  async startChannel(channelId) {
    try {
      // Verificar si ya está corriendo
      if (this.activeProcesses.has(channelId)) {
        const existing = this.activeProcesses.get(channelId);
        if (await processUtils.isProcessRunning(existing.pid)) {
          logger.warn(`Canal ${channelId} ya está corriendo con PID ${existing.pid}`);
          return { success: false, message: 'El canal ya está corriendo' };
        } else {
          // Proceso zombie, limpiar
          this.activeProcesses.delete(channelId);
        }
      }

      // Obtener canal de BD
      const channel = await channelRepository.findById(channelId);
      if (!channel) {
        return { success: false, message: 'Canal no encontrado' };
      }

      // Validar canal
      const validation = channel.validate();
      if (!validation.isValid) {
        return { success: false, message: validation.errors.join(', ') };
      }

      // Crear directorio de salida
      const outputPath = await fileSystem.ensureChannelDirectory(channelId);

      // Construir comandos para cada output
      const processes = [];
      for (const output of channel.outputs) {
        const cmd = ffmpegBuilder.buildCommandForOutput(channel, output, outputPath);

        logger.info(`Iniciando FFmpeg para canal ${channelId}, output: ${output.type}`);
        logger.debug(`Comando: ${cmd.command} ${cmd.args.join(' ')}`);

        const ffmpegProcess = spawn(cmd.command, cmd.args, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        const processInfo = {
          pid: ffmpegProcess.pid,
          process: ffmpegProcess,
          channelId: channelId,
          output: output,
          startTime: new Date(),
          command: `${cmd.command} ${cmd.args.join(' ')}`,
          stats: null // Estadísticas de FFmpeg en tiempo real
        };

        // Capturar logs
        ffmpegProcess.stdout.on('data', (data) => {
          this._handleLog(channelId, 'info', data.toString());
        });

        ffmpegProcess.stderr.on('data', (data) => {
          const stderrData = data.toString();
          // Procesar estadísticas de FFmpeg
          const stats = ffmpegStatsParser.processData(channelId, stderrData);
          if (stats) {
            // Actualizar estadísticas en el processInfo
            if (processInfo) {
              processInfo.stats = stats;
            }
            // También actualizar en el Map si ya está guardado
            const savedProcessInfo = this.activeProcesses.get(channelId);
            if (savedProcessInfo) {
              savedProcessInfo.stats = stats;
            }
          }
          // También enviar como log (para mantener compatibilidad)
          this._handleLog(channelId, 'error', stderrData);
        });

        // Manejar cierre del proceso
        ffmpegProcess.on('close', (code) => {
          logger.warn(`Proceso FFmpeg para canal ${channelId} terminó con código ${code}`);
          // Limpiar buffer del parser
          ffmpegStatsParser.clearBuffer(channelId);
          this.activeProcesses.delete(channelId);
          this._handleProcessExit(channelId, code);
        });

        ffmpegProcess.on('error', (error) => {
          logger.error(`Error en proceso FFmpeg para canal ${channelId}:`, error);
          this.activeProcesses.delete(channelId);
          this._handleProcessError(channelId, error);
        });

        processes.push(processInfo);
      }

      // Guardar el primer proceso (o todos si hay múltiples)
      // Por simplicidad, guardamos el PID del primer proceso
      const mainProcess = processes[0];
      this.activeProcesses.set(channelId, mainProcess);

      // Actualizar BD
      await channelRepository.updateStatusAndPid(
        channelId,
        constants.CHANNEL_STATUS.RUNNING,
        mainProcess.pid
      );

      this.emit('channelStarted', { channelId, pid: mainProcess.pid });

      return {
        success: true,
        message: 'Canal iniciado exitosamente',
        pid: mainProcess.pid
      };
    } catch (error) {
      logger.error(`Error iniciando canal ${channelId}:`, error);
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
      return { success: false, message: error.message };
    }
  }

  /**
   * Detiene un proceso FFmpeg
   * @param {string} channelId - ID del canal
   * @param {boolean} cleanFiles - Si debe limpiar los archivos TS (default: true)
   */
  async stopChannel(channelId, cleanFiles = true) {
    try {
      const processInfo = this.activeProcesses.get(channelId);

      if (!processInfo) {
        // Intentar matar por PID desde BD
        const channel = await channelRepository.findById(channelId);
        if (channel && channel.pid) {
          const killed = await processUtils.killProcess(channel.pid);
          if (killed) {
            await channelRepository.updateStatusAndPid(channelId, constants.CHANNEL_STATUS.STOPPED, null);
            // Limpiar contadores de reinicio cuando se detiene manualmente
            this.restartingChannels.delete(channelId);
            this.restartAttempts.delete(channelId);
            // Limpiar archivos TS del canal solo si se solicita
            if (cleanFiles) {
              try {
                await fileSystem.cleanChannelDirectory(channelId);
              } catch (cleanError) {
                logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
              }
            }
            return { success: true, message: 'Canal detenido' };
          }
        }
        return { success: false, message: 'Canal no está corriendo' };
      }

      // Matar proceso
      const killed = await processUtils.killProcess(processInfo.pid);

      if (killed) {
        // Limpiar buffer del parser
        ffmpegStatsParser.clearBuffer(channelId);
        this.activeProcesses.delete(channelId);
        await channelRepository.updateStatusAndPid(channelId, constants.CHANNEL_STATUS.STOPPED, null);
        // Limpiar contadores de reinicio cuando se detiene manualmente
        this.restartingChannels.delete(channelId);
        this.restartAttempts.delete(channelId);
        // Limpiar archivos TS del canal solo si se solicita
        if (cleanFiles) {
          try {
            await fileSystem.cleanChannelDirectory(channelId);
          } catch (cleanError) {
            logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
          }
        }
        this.emit('channelStopped', { channelId });
        return { success: true, message: 'Canal detenido exitosamente' };
      } else {
        return { success: false, message: 'No se pudo detener el proceso' };
      }
    } catch (error) {
      logger.error(`Error deteniendo canal ${channelId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reinicia un canal
   */
  async restartChannel(channelId) {
    // Verificar si ya hay un reinicio en progreso
    if (this.restartingChannels.has(channelId)) {
      logger.warn(`Canal ${channelId} ya está siendo reiniciado, ignorando solicitud duplicada`);
      return { success: false, message: 'El canal ya está siendo reiniciado' };
    }

    // Verificar el estado actual del canal
    const channel = await channelRepository.findById(channelId);
    if (!channel) {
      return { success: false, message: 'Canal no encontrado' };
    }

    // No reiniciar si el canal fue detenido intencionalmente o ya está reiniciándose
    if (channel.status === constants.CHANNEL_STATUS.STOPPED) {
      logger.info(`Canal ${channelId} fue detenido intencionalmente, no reiniciando`);
      return { success: false, message: 'El canal fue detenido intencionalmente' };
    }

    if (channel.status === constants.CHANNEL_STATUS.RESTARTING) {
      logger.warn(`Canal ${channelId} ya está en estado RESTARTING, ignorando solicitud duplicada`);
      return { success: false, message: 'El canal ya está siendo reiniciado' };
    }

    // Verificar contador de intentos de reinicio (máximo 5 intentos en 2 minutos)
    const now = new Date();
    const attempts = this.restartAttempts.get(channelId);
    if (attempts) {
      const timeSinceLastAttempt = now - attempts.lastAttempt;
      if (timeSinceLastAttempt < 120000) { // 2 minutos
        if (attempts.count >= 25) {
          logger.error(`Canal ${channelId} ha fallado 5 veces en los últimos 2 minutos, deteniendo reinicios automáticos`);
          await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
          this.restartAttempts.delete(channelId);
          this.restartingChannels.delete(channelId);
          return { success: false, message: 'Demasiados intentos de reinicio fallidos' };
        }
        attempts.count++;
        attempts.lastAttempt = now;
      } else {
        // Resetear contador si pasaron más de 2 minutos
        this.restartAttempts.set(channelId, { count: 1, lastAttempt: now });
      }
    } else {
      this.restartAttempts.set(channelId, { count: 1, lastAttempt: now });
    }

    try {
      this.restartingChannels.add(channelId);
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.RESTARTING);

      // Detener sin limpiar archivos porque se va a reiniciar inmediatamente
      await this.stopChannel(channelId, false);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo

      // Verificar nuevamente el estado antes de continuar (doble verificación)
      const currentChannel = await channelRepository.findById(channelId);
      if (!currentChannel || currentChannel.status === constants.CHANNEL_STATUS.STOPPED) {
        logger.info(`Canal ${channelId} fue detenido durante el reinicio, cancelando`);
        this.restartingChannels.delete(channelId);
        this.restartAttempts.delete(channelId);
        return { success: false, message: 'El reinicio fue cancelado porque el canal fue detenido' };
      }

      // Limpiar archivos antes de iniciar para empezar con un directorio limpio
      try {
        await fileSystem.cleanChannelDirectory(channelId);
      } catch (cleanError) {
        logger.warn(`Error limpiando archivos TS antes de reiniciar canal ${channelId}:`, cleanError);
      }

      const result = await this.startChannel(channelId);

      // Si el reinicio fue exitoso, resetear el contador de intentos
      if (result.success) {
        this.restartAttempts.delete(channelId);
        // Mantener el estado RESTARTING por un momento más para evitar reinicios inmediatos
        // El estado se actualizará a RUNNING cuando startChannel actualice la BD
      } else {
        // Si falla, actualizar a ERROR y mantener en el Set un poco más para evitar reinicios inmediatos
        await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
      }

      return result;
    } catch (error) {
      logger.error(`Error reiniciando canal ${channelId}:`, error);
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
      return { success: false, message: error.message };
    } finally {
      // Remover del set de reinicios en progreso después de un delay más largo
      // para evitar que se reinicie inmediatamente si falla
      // Usar 10 segundos en lugar de 2 para dar más tiempo a que el proceso se estabilice
      setTimeout(() => {
        this.restartingChannels.delete(channelId);
        // Verificar si el estado sigue siendo RESTARTING y corregirlo si es necesario
        channelRepository.findById(channelId).then(channel => {
          if (channel && channel.status === constants.CHANNEL_STATUS.RESTARTING) {
            logger.warn(`Canal ${channelId} quedó en estado RESTARTING, corrigiendo a ERROR`);
            channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
          }
        }).catch(err => {
          logger.error(`Error verificando estado del canal ${channelId} después del reinicio:`, err);
        });
      }, 10000); // 10 segundos
    }
  }

  /**
   * Verifica si un canal está corriendo
   */
  async isChannelRunning(channelId) {
    const processInfo = this.activeProcesses.get(channelId);
    if (processInfo) {
      return await processUtils.isProcessRunning(processInfo.pid);
    }

    // Verificar en BD
    const channel = await channelRepository.findById(channelId);
    if (channel && channel.pid) {
      return await processUtils.isProcessRunning(channel.pid);
    }

    return false;
  }

  /**
   * Obtiene información de un proceso
   */
  async getProcessInfo(channelId) {
    const processInfo = this.activeProcesses.get(channelId);
    if (processInfo) {
      const isRunning = await processUtils.isProcessRunning(processInfo.pid);
      const systemInfo = await processUtils.getProcessInfo(processInfo.pid);

      return {
        channelId,
        pid: processInfo.pid,
        isRunning,
        startTime: processInfo.startTime,
        command: processInfo.command,
        systemInfo,
        ffmpegStats: processInfo.stats || null // Incluir estadísticas de FFmpeg
      };
    }
    return null;
  }

  /**
   * Obtiene las estadísticas de FFmpeg de un canal
   */
  getFFmpegStats(channelId) {
    const processInfo = this.activeProcesses.get(channelId);
    if (processInfo) {
      return processInfo.stats || null;
    }
    return null;
  }

  /**
   * Maneja logs del proceso
   */
  _handleLog(channelId, level, message) {
    // Emitir evento para que LogService lo capture
    this.emit('log', { channelId, level, message, timestamp: new Date() });
  }

  /**
   * Maneja la salida del proceso
   */
  async _handleProcessExit(channelId, code) {
    const channel = await channelRepository.findById(channelId);
    if (!channel) return;

    if (code === 0) {
      // Salida normal
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.STOPPED);
      await channelRepository.updatePid(channelId, null);
      // Limpiar archivos TS del canal
      try {
        await fileSystem.cleanChannelDirectory(channelId);
      } catch (cleanError) {
        logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
      }
    } else {
      // Error - Verificar estado actual antes de reiniciar
      // Si el canal fue detenido intencionalmente (estado STOPPED), no reiniciar
      const currentChannel = await channelRepository.findById(channelId);

      if (!currentChannel) {
        logger.warn(`Canal ${channelId} no encontrado en BD después de salida con error`);
        return;
      }

      // Solo actualizar a ERROR y reiniciar si el estado no es STOPPED ni RESTARTING
      // También verificar si ya está en el Set de reinicios en progreso
      if (currentChannel.status !== constants.CHANNEL_STATUS.STOPPED &&
        currentChannel.status !== constants.CHANNEL_STATUS.RESTARTING &&
        !this.restartingChannels.has(channelId)) {
        await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);

        // Reinicio automático si está habilitado y el estado no es STOPPED ni RESTARTING
        if (currentChannel.auto_restart) {
          logger.info(`Programando reinicio automático para canal ${channelId}`);
          // No limpiar archivos TS si se va a reiniciar automáticamente
          setTimeout(async () => {
            try {
              // Verificar nuevamente el estado antes de reiniciar (doble verificación)
              const updatedChannel = await channelRepository.findById(channelId);
              if (!updatedChannel) {
                logger.warn(`Canal ${channelId} no encontrado antes de reinicio automático`);
                return;
              }

              // No reiniciar si el canal fue detenido, ya está reiniciándose, o está en el Set
              if (updatedChannel.status === constants.CHANNEL_STATUS.STOPPED ||
                updatedChannel.status === constants.CHANNEL_STATUS.RESTARTING ||
                this.restartingChannels.has(channelId)) {
                logger.info(`Canal ${channelId} en estado ${updatedChannel.status} o ya reiniciándose, cancelando reinicio automático`);
                // Si se canceló el reinicio, limpiar archivos TS
                fileSystem.cleanChannelDirectory(channelId).catch(cleanError => {
                  logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
                });
                return;
              }

              await this.restartChannel(channelId);
            } catch (err) {
              logger.error(`Error en reinicio automático de canal ${channelId}:`, err);
            }
          }, 5000); // Esperar 5 segundos antes de reiniciar
        } else {
          // No hay auto_restart, limpiar archivos TS
          try {
            await fileSystem.cleanChannelDirectory(channelId);
          } catch (cleanError) {
            logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
          }
        }
      } else {
        logger.info(`Canal ${channelId} fue detenido intencionalmente o ya está reiniciándose, no reiniciando después de error`);
        await channelRepository.updatePid(channelId, null);
        // Limpiar archivos TS del canal
        try {
          await fileSystem.cleanChannelDirectory(channelId);
        } catch (cleanError) {
          logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
        }
      }
    }

    this.emit('channelStopped', { channelId, exitCode: code });
  }

  /**
   * Maneja errores del proceso
   */
  async _handleProcessError(channelId, error) {
    await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
    this.emit('channelError', { channelId, error });
  }

  /**
   * Obtiene todos los procesos activos
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.keys());
  }
}

module.exports = new FFmpegManager();

