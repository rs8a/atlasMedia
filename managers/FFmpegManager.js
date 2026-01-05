const { spawn } = require('child_process');
const EventEmitter = require('events');
const channelRepository = require('../repositories/ChannelRepository');
const ffmpegBuilder = require('../builders/FFmpegCommandBuilder');
const fileSystem = require('../utils/fileSystem');
const processUtils = require('../utils/processUtils');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class FFmpegManager extends EventEmitter {
  constructor() {
    super();
    // Map<channelId, ProcessInfo>
    this.activeProcesses = new Map();
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
          command: `${cmd.command} ${cmd.args.join(' ')}`
        };

        // Capturar logs
        ffmpegProcess.stdout.on('data', (data) => {
          this._handleLog(channelId, 'info', data.toString());
        });

        ffmpegProcess.stderr.on('data', (data) => {
          this._handleLog(channelId, 'error', data.toString());
        });

        // Manejar cierre del proceso
        ffmpegProcess.on('close', (code) => {
          logger.warn(`Proceso FFmpeg para canal ${channelId} terminó con código ${code}`);
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
        this.activeProcesses.delete(channelId);
        await channelRepository.updateStatusAndPid(channelId, constants.CHANNEL_STATUS.STOPPED, null);
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
    try {
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.RESTARTING);
      // Detener sin limpiar archivos porque se va a reiniciar inmediatamente
      await this.stopChannel(channelId, false);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
      // Limpiar archivos antes de iniciar para empezar con un directorio limpio
      try {
        await fileSystem.cleanChannelDirectory(channelId);
      } catch (cleanError) {
        logger.warn(`Error limpiando archivos TS antes de reiniciar canal ${channelId}:`, cleanError);
      }
      return await this.startChannel(channelId);
    } catch (error) {
      logger.error(`Error reiniciando canal ${channelId}:`, error);
      await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
      return { success: false, message: error.message };
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
        systemInfo
      };
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

      // Solo actualizar a ERROR y reiniciar si el estado no es STOPPED
      if (currentChannel.status !== constants.CHANNEL_STATUS.STOPPED) {
        await channelRepository.updateStatus(channelId, constants.CHANNEL_STATUS.ERROR);
        
        // Reinicio automático si está habilitado y el estado no es STOPPED
        if (currentChannel.auto_restart && currentChannel.status !== constants.CHANNEL_STATUS.STOPPED) {
          logger.info(`Reiniciando automáticamente canal ${channelId}`);
          // No limpiar archivos TS si se va a reiniciar automáticamente
          setTimeout(() => {
            // Verificar nuevamente el estado antes de reiniciar (doble verificación)
            channelRepository.findById(channelId).then(updatedChannel => {
              if (updatedChannel && updatedChannel.status !== constants.CHANNEL_STATUS.STOPPED) {
                this.restartChannel(channelId).catch(err => {
                  logger.error(`Error en reinicio automático de canal ${channelId}:`, err);
                });
              } else {
                logger.info(`Canal ${channelId} fue detenido antes del reinicio automático, cancelando reinicio`);
                // Si se canceló el reinicio, limpiar archivos TS
                fileSystem.cleanChannelDirectory(channelId).catch(cleanError => {
                  logger.warn(`Error limpiando archivos TS del canal ${channelId}:`, cleanError);
                });
              }
            }).catch(err => {
              logger.error(`Error verificando estado antes de reiniciar canal ${channelId}:`, err);
            });
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
        logger.info(`Canal ${channelId} fue detenido intencionalmente, no reiniciando después de error`);
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

