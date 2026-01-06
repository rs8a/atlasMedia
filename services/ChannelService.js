const Channel = require('../models/Channel');
const channelRepository = require('../repositories/ChannelRepository');
const ffmpegManager = require('../managers/FFmpegManager');
const fileSystem = require('../utils/fileSystem');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class ChannelService {
  /**
   * Obtiene todos los canales
   */
  async getAllChannels() {
    try {
      return await channelRepository.findAll();
    } catch (error) {
      logger.error('Error en getAllChannels:', error);
      throw new Error('Error al obtener canales');
    }
  }

  /**
   * Obtiene un canal por ID
   */
  async getChannelById(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }
      return channel;
    } catch (error) {
      logger.error(`Error en getChannelById(${id}):`, error);
      throw error;
    }
  }

  /**
   * Crea un nuevo canal
   */
  async createChannel(channelData) {
    try {
      const channel = new Channel(channelData);

      // Validar
      const validation = channel.validate();
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // Crear en BD
      const created = await channelRepository.create(channel);

      // Crear directorio de salida
      await fileSystem.ensureChannelDirectory(created.id);

      logger.info(`Canal creado: ${created.id} - ${created.name}`);
      return created;
    } catch (error) {
      logger.error('Error en createChannel:', error);
      throw error;
    }
  }

  /**
   * Actualiza un canal
   */
  async updateChannel(id, channelData) {
    try {
      const existingChannel = await channelRepository.findById(id);
      if (!existingChannel) {
        throw new Error('Canal no encontrado');
      }

      // Si el canal está corriendo, no permitir cambios críticos
      if (existingChannel.status === constants.CHANNEL_STATUS.RUNNING) {
        // Permitir solo cambios en auto_restart y algunos parámetros
        const allowedFields = ['auto_restart', 'name'];
        const hasRestrictedFields = Object.keys(channelData).some(
          key => !allowedFields.includes(key)
        );

        if (hasRestrictedFields) {
          throw new Error('No se puede modificar la configuración de un canal en ejecución. Detén el canal primero.');
        }
      }

      const updated = await channelRepository.update(id, channelData);
      if (!updated) {
        throw new Error('Error al actualizar el canal');
      }

      logger.info(`Canal actualizado: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error en updateChannel(${id}):`, error);
      throw error;
    }
  }

  /**
   * Elimina un canal
   */
  async deleteChannel(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      // Si está corriendo, detenerlo primero
      if (channel.status === constants.CHANNEL_STATUS.RUNNING) {
        await this.stopChannel(id);
      }

      // Eliminar de BD
      const deleted = await channelRepository.delete(id);
      if (!deleted) {
        throw new Error('Error al eliminar el canal');
      }

      // Eliminar directorio de salida
      await fileSystem.removeChannelDirectory(id);

      logger.info(`Canal eliminado: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error en deleteChannel(${id}):`, error);
      throw error;
    }
  }

  /**
   * Inicia un canal
   */
  async startChannel(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      if (channel.status === constants.CHANNEL_STATUS.RUNNING) {
        throw new Error('El canal ya está corriendo');
      }

      const result = await ffmpegManager.startChannel(id);
      if (!result.success) {
        throw new Error(result.message);
      }

      const updatedChannel = await channelRepository.findById(id);
      return updatedChannel;
    } catch (error) {
      logger.error(`Error en startChannel(${id}):`, error);
      throw error;
    }
  }

  /**
   * Detiene un canal
   */
  async stopChannel(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      if (channel.status === constants.CHANNEL_STATUS.STOPPED) {
        throw new Error('El canal ya está detenido');
      }

      const result = await ffmpegManager.stopChannel(id);
      if (!result.success) {
        throw new Error(result.message);
      }

      const updatedChannel = await channelRepository.findById(id);
      return updatedChannel;
    } catch (error) {
      logger.error(`Error en stopChannel(${id}):`, error);
      throw error;
    }
  }

  /**
   * Reinicia un canal
   */
  async restartChannel(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      const result = await ffmpegManager.restartChannel(id);
      if (!result.success) {
        throw new Error(result.message);
      }

      const updatedChannel = await channelRepository.findById(id);
      return updatedChannel;
    } catch (error) {
      logger.error(`Error en restartChannel(${id}):`, error);
      throw error;
    }
  }

  /**
   * Obtiene el estado en tiempo real de un canal
   */
  async getChannelStatus(id) {
    try {
      const channel = await channelRepository.findById(id);
      if (!channel) {
        throw new Error('Canal no encontrado');
      }

      const isRunning = await ffmpegManager.isChannelRunning(id);
      const processInfo = await ffmpegManager.getProcessInfo(id);

      return {
        channel: channel.toJSON(),
        isRunning,
        processInfo
      };
    } catch (error) {
      logger.error(`Error en getChannelStatus(${id}):`, error);
      throw error;
    }
  }

  /**
   * Analiza las pistas de audio disponibles en un stream usando ffprobe
   */
  async analyzeAudioTracks(inputUrl) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // Usar ffprobe para obtener información del stream en formato JSON
      const ffprobePath = constants.FFMPEG_PATH.replace('ffmpeg', 'ffprobe') || 'ffprobe';

      // Comando ffprobe para obtener todos los streams en formato JSON
      const command = `${ffprobePath} -v quiet -print_format json -show_streams "${inputUrl}"`;

      logger.debug(`Ejecutando ffprobe para analizar audio: ${inputUrl}`);

      // Ejecutar con timeout de 30 segundos
      const { stdout, stderr } = await Promise.race([
        execAsync(command, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: El análisis del stream tardó más de 30 segundos')), 30000)
        )
      ]);

      if (stderr && !stdout) {
        throw new Error(`Error ejecutando ffprobe: ${stderr}`);
      }

      let probeData;
      try {
        probeData = JSON.parse(stdout);
      } catch (parseError) {
        logger.error('Error parseando JSON de ffprobe:', parseError);
        throw new Error(`Error procesando la respuesta de ffprobe: ${parseError.message}`);
      }

      // Extraer streams de audio
      const audioStreams = (probeData.streams || []).filter(stream => stream.codec_type === 'audio');

      if (audioStreams.length === 0) {
        return {
          count: 0,
          tracks: [],
          message: 'No se encontraron pistas de audio en el stream'
        };
      }

      // Formatear información de cada pista
      const tracks = audioStreams.map((stream, index) => ({
        index: stream.index !== undefined ? stream.index : index,
        stream_index: index, // Índice para usar en audio_stream_index
        codec: stream.codec_name || 'unknown',
        codec_long: stream.codec_long_name || stream.codec_name || 'unknown',
        bitrate: stream.bit_rate ? `${Math.round(parseInt(stream.bit_rate) / 1000)}k` : null,
        sample_rate: stream.sample_rate ? `${stream.sample_rate} Hz` : null,
        channels: stream.channels || null,
        channel_layout: stream.channel_layout || null,
        language: stream.tags?.language || stream.tags?.LANGUAGE || null,
        title: stream.tags?.title || stream.tags?.TITLE || null,
        duration: stream.duration ? parseFloat(stream.duration).toFixed(2) + 's' : null
      }));

      return {
        count: tracks.length,
        tracks: tracks
      };
    } catch (error) {
      logger.error(`Error analizando pistas de audio para ${inputUrl}:`, error);

      // Mensajes de error más descriptivos
      if (error.message.includes('Timeout')) {
        throw new Error('El análisis del stream tardó demasiado. Verifica que la URL sea accesible.');
      }
      if (error.message.includes('ENOENT') || error.message.includes('ffprobe')) {
        throw new Error('ffprobe no está disponible. Asegúrate de que FFmpeg esté instalado.');
      }
      if (error.message.includes('Connection refused') || error.message.includes('No route to host')) {
        throw new Error('No se pudo conectar al stream. Verifica la URL y que el servidor esté accesible.');
      }

      throw new Error(`Error analizando pistas de audio: ${error.message}`);
    }
  }
}

module.exports = new ChannelService();

