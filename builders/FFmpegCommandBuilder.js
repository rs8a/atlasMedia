const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const constants = require('../config/constants');
const logger = require('../utils/logger');
const gpuDetectionService = require('../services/GPUDetectionService');

class FFmpegCommandBuilder {
  constructor() {
    // Cache para la detección de aceleración por hardware
    this._hwAccelCache = null;
  }

  /**
   * Detecta qué aceleración por hardware está disponible en el sistema
   * @returns {Object} Objeto con información de aceleración disponible
   */
  _detectHardwareAcceleration() {
    // Retornar cache si ya se detectó
    if (this._hwAccelCache !== null) {
      return this._hwAccelCache;
    }

    const result = {
      nvenc: false,
      qsv: false,
      vaapi: false,
      videotoolbox: false,
      preferred: null,
      codec: null
    };

    try {
      // Ejecutar ffmpeg -hide_banner -encoders para ver codecs disponibles
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      // Detectar NVIDIA NVENC
      if (encodersOutput.includes('h264_nvenc') || encodersOutput.includes('hevc_nvenc')) {
        result.nvenc = true;
        result.preferred = 'nvenc';
        result.codec = 'h264_nvenc';
        logger.info('Aceleración por hardware detectada: NVIDIA NVENC');
      }

      // Detectar Intel Quick Sync Video (QSV)
      if (encodersOutput.includes('h264_qsv') || encodersOutput.includes('hevc_qsv')) {
        result.qsv = true;
        if (!result.preferred) {
          result.preferred = 'qsv';
          result.codec = 'h264_qsv';
        }
        logger.info('Aceleración por hardware detectada: Intel Quick Sync Video');
      }

      // Detectar VAAPI (Linux - Intel/AMD)
      if (encodersOutput.includes('h264_vaapi') || encodersOutput.includes('hevc_vaapi')) {
        result.vaapi = true;
        if (!result.preferred) {
          result.preferred = 'vaapi';
          result.codec = 'h264_vaapi';
        }
        logger.info('Aceleración por hardware detectada: VAAPI');
      }

      // Detectar VideoToolbox (macOS)
      if (encodersOutput.includes('h264_videotoolbox') || encodersOutput.includes('hevc_videotoolbox')) {
        result.videotoolbox = true;
        if (!result.preferred) {
          result.preferred = 'videotoolbox';
          result.codec = 'h264_videotoolbox';
        }
        logger.info('Aceleración por hardware detectada: VideoToolbox');
      }

      if (!result.preferred) {
        logger.info('No se detectó aceleración por hardware, usando codecs de software');
      }
    } catch (error) {
      logger.warn('Error detectando aceleración por hardware:', error.message);
    }

    // Guardar en cache
    this._hwAccelCache = result;
    return result;
  }

  /**
   * Obtiene el codec de video acelerado por hardware apropiado
   * @param {string} requestedCodec - Codec solicitado (opcional)
   * @returns {string|null} Codec acelerado o null si no está disponible
   */
  _getHardwareVideoCodec(requestedCodec = null) {
    // Si la aceleración por hardware está deshabilitada, retornar null
    if (process.env.FFMPEG_HWACCEL_ENABLED === 'false') {
      return null;
    }

    // Si se solicita un codec específico y no es 'copy', verificar si hay versión acelerada
    if (requestedCodec && requestedCodec !== 'copy') {
      const hwAccel = this._detectHardwareAcceleration();
      
      // Si se solicita h264 o libx264, usar versión acelerada si está disponible
      if ((requestedCodec === 'h264' || requestedCodec === 'libx264') && hwAccel.codec) {
        return hwAccel.codec;
      }
      
      // Si se solicita hevc o libx265, usar versión acelerada si está disponible
      if ((requestedCodec === 'hevc' || requestedCodec === 'libx265' || requestedCodec === 'h265')) {
        if (hwAccel.nvenc) {
          return 'hevc_nvenc';
        } else if (hwAccel.qsv) {
          return 'hevc_qsv';
        } else if (hwAccel.vaapi) {
          return 'hevc_vaapi';
        } else if (hwAccel.videotoolbox) {
          return 'hevc_videotoolbox';
        }
      }
      
      // Si el codec solicitado ya es acelerado, usarlo
      if (requestedCodec.includes('_nvenc') || requestedCodec.includes('_qsv') || 
          requestedCodec.includes('_vaapi') || requestedCodec.includes('_videotoolbox')) {
        return requestedCodec;
      }
    }

    // Si no se especifica codec o se está usando 'copy', usar aceleración si está disponible
    // y si está habilitado el uso automático
    if (!requestedCodec || requestedCodec === 'copy') {
      if (process.env.FFMPEG_HWACCEL_AUTO === 'true') {
        const hwAccel = this._detectHardwareAcceleration();
        return hwAccel.codec;
      }
    }

    return null;
  }

  /**
   * Obtiene el dispositivo VAAPI según el índice especificado
   * @param {number} index - Índice del dispositivo (0, 1, 2, etc.)
   * @returns {Promise<string>} Ruta del dispositivo
   */
  async _getVAAPIDeviceByIndex(index) {
    try {
      const gpus = await gpuDetectionService.detectGPUs();
      const vaapiGPU = gpus.find(gpu => gpu.type === 'vaapi' && gpu.index === index);
      
      if (vaapiGPU && vaapiGPU.device) {
        // Verificar que el dispositivo existe y es accesible
        if (fs.existsSync(vaapiGPU.device)) {
          try {
            fs.accessSync(vaapiGPU.device, fs.constants.R_OK);
            return vaapiGPU.device;
          } catch (error) {
            logger.warn(`Dispositivo VAAPI ${vaapiGPU.device} no es accesible:`, error.message);
          }
        } else {
          logger.warn(`Dispositivo VAAPI ${vaapiGPU.device} no existe`);
        }
      }
      
      // Fallback: construir ruta basada en índice
      // renderD128 = índice 0, renderD129 = índice 1, etc.
      const devicePath = `/dev/dri/renderD${128 + index}`;
      if (fs.existsSync(devicePath)) {
        try {
          fs.accessSync(devicePath, fs.constants.R_OK);
          return devicePath;
        } catch (error) {
          logger.warn(`Dispositivo VAAPI ${devicePath} no es accesible:`, error.message);
        }
      }
    } catch (error) {
      logger.warn(`Error obteniendo dispositivo VAAPI para índice ${index}:`, error.message);
    }
    
    // Fallback final: usar el dispositivo por defecto
    const defaultDevice = constants.FFMPEG_HWACCEL.VAAPI_DEVICE || '/dev/dri/renderD128';
    
    // Verificar que el dispositivo por defecto existe
    if (fs.existsSync(defaultDevice)) {
      try {
        fs.accessSync(defaultDevice, fs.constants.R_OK);
        return defaultDevice;
      } catch (error) {
        logger.warn(`Dispositivo VAAPI por defecto ${defaultDevice} no es accesible:`, error.message);
      }
    } else {
      logger.warn(`Dispositivo VAAPI por defecto ${defaultDevice} no existe`);
    }
    
    // Si ningún dispositivo está disponible, retornar el por defecto de todas formas
    // FFmpeg dará un error más claro si realmente no puede usarlo
    return defaultDevice;
  }

  /**
   * Agrega parámetros de aceleración por hardware ANTES del input (-i)
   * Estos son parámetros de hardware acceleration para decodificación
   * @param {Array} args - Array de argumentos FFmpeg
   * @param {string} hwCodec - Codec acelerado por hardware
   * @param {Object} channel - Objeto del canal con ffmpeg_params (opcional, para obtener gpu_index)
   */
  async _addHardwareAccelerationArgs(args, hwCodec, channel = null) {
    if (!hwCodec) return;

    // Obtener índice de GPU si está especificado
    const gpuIndex = channel?.ffmpeg_params?.gpu_index;

    // Agregar parámetros específicos según el tipo de aceleración
    // NOTA: -gpu para NVENC NO va aquí, va después del input con el codec
    if (hwCodec.includes('_nvenc')) {
      // NVIDIA NVENC - no requiere parámetros antes del input
      // El parámetro -gpu se agrega después con el codec
    } else if (hwCodec.includes('_qsv')) {
      // Intel Quick Sync Video - requiere hwaccel ANTES del input
      args.push('-hwaccel', 'qsv');
      args.push('-hwaccel_output_format', 'qsv');
      
      // QSV puede usar -init_hw_device para especificar dispositivo si es necesario
      // Por ahora, el índice generalmente no se necesita explícitamente para QSV
      if (gpuIndex !== undefined && gpuIndex !== null) {
        logger.debug(`Índice GPU ${gpuIndex} especificado para QSV (puede no ser necesario)`);
      }
    } else if (hwCodec.includes('_vaapi')) {
      // VAAPI - requiere hwaccel y dispositivo ANTES del input
      let vaapiDevice;
      if (gpuIndex !== undefined && gpuIndex !== null) {
        // Obtener dispositivo según índice
        vaapiDevice = await this._getVAAPIDeviceByIndex(gpuIndex);
        logger.debug(`Usando dispositivo VAAPI índice ${gpuIndex}: ${vaapiDevice}`);
      } else {
        // Usar dispositivo por defecto
        vaapiDevice = constants.FFMPEG_HWACCEL.VAAPI_DEVICE || '/dev/dri/renderD128';
      }
      
      // Verificar que el dispositivo existe y es accesible antes de usarlo
      if (!fs.existsSync(vaapiDevice)) {
        logger.error(`Dispositivo VAAPI ${vaapiDevice} no existe. VAAPI no estará disponible.`);
        throw new Error(`Dispositivo VAAPI no encontrado: ${vaapiDevice}. Verifica que los dispositivos DRI estén disponibles en Docker (agrega devices: - /dev/dri:/dev/dri al docker-compose.yml)`);
      }
      
      try {
        fs.accessSync(vaapiDevice, fs.constants.R_OK);
      } catch (error) {
        logger.error(`Dispositivo VAAPI ${vaapiDevice} no es accesible: ${error.message}`);
        throw new Error(`Dispositivo VAAPI no accesible: ${vaapiDevice}. Verifica los permisos del dispositivo DRI.`);
      }
      
      // Solo agregar parámetros VAAPI si el dispositivo es válido
      args.push('-hwaccel', 'vaapi');
      args.push('-vaapi_device', vaapiDevice);
    } else if (hwCodec.includes('_videotoolbox')) {
      // VideoToolbox - requiere hwaccel ANTES del input
      args.push('-hwaccel', 'videotoolbox');
      
      // VideoToolbox en macOS generalmente no requiere índice explícito
      // pero puede especificarse si hay múltiples GPUs
      if (gpuIndex !== undefined && gpuIndex !== null) {
        logger.debug(`Índice GPU ${gpuIndex} especificado para VideoToolbox (puede no ser necesario)`);
      }
    }
  }

  /**
   * Agrega parámetros específicos del encoder de hardware DESPUÉS del input
   * Estos son parámetros que van con el codec de salida (ej: -gpu para NVENC)
   * @param {Array} args - Array de argumentos FFmpeg
   * @param {string} hwCodec - Codec acelerado por hardware
   * @param {Object} channel - Objeto del canal con ffmpeg_params (opcional, para obtener gpu_index)
   */
  _addHardwareEncoderArgs(args, hwCodec, channel = null) {
    if (!hwCodec) return;

    // Obtener índice de GPU si está especificado
    const gpuIndex = channel?.ffmpeg_params?.gpu_index;

    // Agregar parámetros específicos del encoder según el tipo
    if (hwCodec.includes('_nvenc')) {
      // NVIDIA NVENC - usar -gpu para especificar índice de GPU
      // Este parámetro debe ir DESPUÉS del input, con el codec
      if (gpuIndex !== undefined && gpuIndex !== null) {
        args.push('-gpu', gpuIndex.toString());
        logger.debug(`Usando GPU NVIDIA índice ${gpuIndex} para NVENC`);
      }
    }
    // Para otros codecs, los parámetros de GPU generalmente no son necesarios aquí
    // o se manejan de otra manera
  }

  /**
   * Determina si se usará aceleración por hardware y retorna el codec
   * @param {Object} channel - Objeto del canal con ffmpeg_params
   * @returns {string|null} Codec acelerado o null
   */
  _determineHardwareCodec(channel) {
    if (!channel.ffmpeg_params) return null;
    
    const requestedCodec = channel.ffmpeg_params.video_codec || 'copy';
    return this._getHardwareVideoCodec(requestedCodec);
  }
  /**
   * Procesa input_options y los agrega a args
   * Soporta objeto (map), array o string
   */
  _processInputOptions(args, inputOptions) {
    if (!inputOptions) return;

    if (typeof inputOptions === 'object' && !Array.isArray(inputOptions)) {
      // Si es un objeto/map, convertir a argumentos FFmpeg
      for (const [key, value] of Object.entries(inputOptions)) {
        args.push(`-${key}`, value.toString());
      }
    } else if (Array.isArray(inputOptions)) {
      // Mantener compatibilidad con arrays
      args.push(...inputOptions);
    } else if (typeof inputOptions === 'string') {
      // Mantener compatibilidad con strings
      args.push(...inputOptions.split(' '));
    }
  }

  /**
   * Procesa output_options y los agrega a args
   * Soporta objeto (map), array o string
   */
  _processOutputOptions(args, outputOptions) {
    if (!outputOptions) return;

    if (typeof outputOptions === 'object' && !Array.isArray(outputOptions)) {
      // Si es un objeto/map, convertir a argumentos FFmpeg
      for (const [key, value] of Object.entries(outputOptions)) {
        args.push(`-${key}`, value.toString());
      }
    } else if (Array.isArray(outputOptions)) {
      // Mantener compatibilidad con arrays
      args.push(...outputOptions);
    } else if (typeof outputOptions === 'string') {
      // Mantener compatibilidad con strings
      args.push(...outputOptions.split(' '));
    }
  }

  /**
   * Procesa el mapeo de streams (video_stream_index, audio_stream_index)
   * Debe llamarse DESPUÉS del input (-i) pero ANTES de los codecs
   */
  _processStreamMapping(args, ffmpegParams) {
    if (!ffmpegParams) return;

    // Mapear stream de video
    if (ffmpegParams.video_stream_index !== undefined) {
      const videoIndex = parseInt(ffmpegParams.video_stream_index);
      args.push('-map', `0:v:${videoIndex}`);
    } else if (ffmpegParams.audio_stream_index !== undefined) {
      // Si solo se especifica audio, mapear el primer video por defecto
      args.push('-map', '0:v:0');
    }

    // Mapear stream de audio
    if (ffmpegParams.audio_stream_index !== undefined) {
      const audioIndex = parseInt(ffmpegParams.audio_stream_index);
      args.push('-map', `0:a:${audioIndex}`);
    } else if (ffmpegParams.video_stream_index !== undefined) {
      // Si solo se especifica video, mapear el primer audio por defecto
      args.push('-map', '0:a:0');
    }
  }

  /**
   * Mapea presets de libx264/libx265 a presets de codecs acelerados por hardware
   * @param {string} preset - Preset original (ej: veryfast, medium, slow)
   * @param {string} codec - Codec que se está usando (ej: h264_nvenc, h264_qsv)
   * @returns {string|null} Preset mapeado o null si no se necesita mapeo
   */
  _mapPresetForHardwareCodec(preset, codec) {
    if (!preset || !codec) return null;

    // Mapeo para NVENC (h264_nvenc, hevc_nvenc)
    if (codec.includes('_nvenc')) {
      const presetMap = {
        'ultrafast': 'p1',
        'superfast': 'p1',
        'veryfast': 'p2',
        'faster': 'p3',
        'fast': 'p3',
        'medium': 'p4',
        'slow': 'p5',
        'slower': 'p6',
        'veryslow': 'p7'
      };
      const mapped = presetMap[preset.toLowerCase()];
      if (mapped) {
        logger.debug(`Mapeando preset "${preset}" a "${mapped}" para ${codec}`);
        return mapped;
      }
      // Si el preset ya es p1-p7, usarlo directamente
      if (/^p[1-7]$/i.test(preset)) {
        return preset.toLowerCase();
      }
    }

    // Para QSV, VAAPI y VideoToolbox, los presets de libx264 generalmente funcionan
    // pero algunos pueden necesitar ajustes. Por ahora, retornamos null para usar el preset original
    return null;
  }

  /**
   * Procesa parámetros de encoding específicos (preset, tune, profile, etc.)
   * @param {Array} args - Array de argumentos FFmpeg
   * @param {Object} ffmpegParams - Parámetros de FFmpeg
   * @param {string} videoCodec - Codec de video que se está usando (para mapeo de presets)
   */
  _processEncodingParams(args, ffmpegParams, videoCodec = null) {
    if (!ffmpegParams) return;

    // Preset (para libx264, libx265, etc.)
    if (ffmpegParams.preset) {
      let preset = ffmpegParams.preset;
      
      // Si se está usando un codec acelerado por hardware, mapear el preset si es necesario
      if (videoCodec) {
        // Para NVENC, verificar si hay un preset específico en la variable de entorno
        if (videoCodec.includes('_nvenc') && process.env.NVENC_PRESET) {
          preset = process.env.NVENC_PRESET;
          logger.debug(`Usando preset NVENC desde variable de entorno: ${preset}`);
        } else {
          // Mapear preset de libx264 a preset de hardware si es necesario
          const mappedPreset = this._mapPresetForHardwareCodec(preset, videoCodec);
          if (mappedPreset) {
            preset = mappedPreset;
          }
        }
      }
      
      args.push('-preset', preset);
    } else if (videoCodec && videoCodec.includes('_nvenc') && process.env.NVENC_PRESET) {
      // Si no hay preset en ffmpegParams pero se usa NVENC y hay preset en env, usarlo
      args.push('-preset', process.env.NVENC_PRESET);
      logger.debug(`Usando preset NVENC desde variable de entorno (sin preset en config): ${process.env.NVENC_PRESET}`);
    }

    // Tune (para libx264, libx265, etc.)
    if (ffmpegParams.tune) {
      args.push('-tune', ffmpegParams.tune);
    }

    // Profile (perfil del codec)
    if (ffmpegParams.profile) {
      args.push('-profile:v', ffmpegParams.profile);
    }

    // Level (nivel del codec)
    if (ffmpegParams.level) {
      args.push('-level', ffmpegParams.level);
    }

    // GOP size (group of pictures)
    if (ffmpegParams.g) {
      args.push('-g', ffmpegParams.g.toString());
    }

    // Keyframe interval mínimo
    if (ffmpegParams.keyint_min) {
      args.push('-keyint_min', ffmpegParams.keyint_min.toString());
    }

    // Scene change threshold
    if (ffmpegParams.sc_threshold) {
      args.push('-sc_threshold', ffmpegParams.sc_threshold.toString());
    }

    // Sincronización de video
    if (ffmpegParams.vsync) {
      args.push('-vsync', ffmpegParams.vsync);
    }

    // Sincronización de audio
    if (ffmpegParams.async) {
      args.push('-async', ffmpegParams.async.toString());
    }

    // CRF (Constant Rate Factor) - calidad
    if (ffmpegParams.crf !== undefined) {
      args.push('-crf', ffmpegParams.crf.toString());
    }

    // QP (Quantization Parameter)
    if (ffmpegParams.qp !== undefined) {
      args.push('-qp', ffmpegParams.qp.toString());
    }

    // Maxrate (bitrate máximo)
    if (ffmpegParams.maxrate) {
      args.push('-maxrate', ffmpegParams.maxrate);
    }

    // Minrate (bitrate mínimo)
    if (ffmpegParams.minrate) {
      args.push('-minrate', ffmpegParams.minrate);
    }

    // Bufsize (tamaño del buffer)
    if (ffmpegParams.bufsize) {
      args.push('-bufsize', ffmpegParams.bufsize);
    }
  }

  /**
   * Construye un comando FFmpeg genérico basado en la configuración
   */
  async buildCommand(channel, outputPath) {
    const args = [];

    // Determinar si se usará aceleración por hardware (ANTES de agregar el input)
    const hwCodec = this._determineHardwareCodec(channel);

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    }

    // Agregar argumentos de aceleración por hardware ANTES del input
    if (hwCodec) {
      await this._addHardwareAccelerationArgs(args, hwCodec, channel);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input
    args.push('-i', channel.input_url);

    // Mapeo de streams (DESPUÉS de -i, ANTES de codecs)
    if (channel.ffmpeg_params) {
      this._processStreamMapping(args, channel.ffmpeg_params);
    }

    // Parámetros de FFmpeg desde la configuración
    if (channel.ffmpeg_params) {
      // Codec de video - usar aceleración por hardware si está disponible
      let videoCodec = channel.ffmpeg_params.video_codec || 'copy';
      
      if (hwCodec) {
        args.push('-c:v', hwCodec);
        // Agregar parámetros específicos del encoder de hardware (ej: -gpu para NVENC)
        this._addHardwareEncoderArgs(args, hwCodec, channel);
      } else {
        args.push('-c:v', videoCodec);
      }

      // Codec de audio
      if (channel.ffmpeg_params.audio_codec) {
        args.push('-c:a', channel.ffmpeg_params.audio_codec);
      } else {
        args.push('-c:a', 'copy');
      }

      // Bitrate de video
      if (channel.ffmpeg_params.video_bitrate) {
        args.push('-b:v', channel.ffmpeg_params.video_bitrate);
      }

      // Bitrate de audio
      if (channel.ffmpeg_params.audio_bitrate) {
        args.push('-b:a', channel.ffmpeg_params.audio_bitrate);
      }

      // Resolución
      if (channel.ffmpeg_params.resolution) {
        args.push('-s', channel.ffmpeg_params.resolution);
      }

      // Frame rate
      if (channel.ffmpeg_params.framerate) {
        args.push('-r', channel.ffmpeg_params.framerate);
      }

      // Filtros de video
      if (channel.ffmpeg_params.video_filters) {
        args.push('-vf', channel.ffmpeg_params.video_filters);
      }

      // Filtros de audio
      if (channel.ffmpeg_params.audio_filters) {
        args.push('-af', channel.ffmpeg_params.audio_filters);
      }

      // Parámetros de encoding (preset, tune, profile, etc.)
      const currentVideoCodec = hwCodec || videoCodec;
      this._processEncodingParams(args, channel.ffmpeg_params, currentVideoCodec);

      // Procesar output_options (DESPUÉS de codecs y encoding params)
      if (channel.ffmpeg_params.output_options) {
        this._processOutputOptions(args, channel.ffmpeg_params.output_options);
      }

      // Opciones adicionales (mantener compatibilidad)
      if (channel.ffmpeg_params.extra_options) {
        if (Array.isArray(channel.ffmpeg_params.extra_options)) {
          args.push(...channel.ffmpeg_params.extra_options);
        } else if (typeof channel.ffmpeg_params.extra_options === 'string') {
          args.push(...channel.ffmpeg_params.extra_options.split(' '));
        }
      }
    } else {
      // Por defecto, copiar sin transcodificar
      args.push('-c', 'copy');
    }

    // Output
    args.push(outputPath);

    return {
      command: constants.FFMPEG_PATH,
      args: args
    };
  }

  /**
   * Construye comando para stream UDP
   */
  async buildUDPCommand(channel, udpOutput) {
    const args = [];

    // Determinar si se usará aceleración por hardware (ANTES de agregar el input)
    const hwCodec = this._determineHardwareCodec(channel);

    // Parámetro -re para streaming en tiempo real
    // NO usar para HLS en vivo (causa retraso), solo para archivos locales
    // Puede desactivarse manualmente con realtime: false
    const inputUrl = channel.input_url.toLowerCase();
    const isHLS = inputUrl.includes('.m3u8') ||
      inputUrl.startsWith('http://') ||
      inputUrl.startsWith('https://') ||
      inputUrl.startsWith('hls://');

    const useRealtime = udpOutput.realtime !== false && !isHLS;

    if (useRealtime) {
      // -re debe ir ANTES del input (-i)
      args.push('-re');
    }

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    } else if (isHLS) {
      // Por defecto para HLS si no se especifica fflags
      args.push('-fflags', '+genpts');
    }

    // Agregar argumentos de aceleración por hardware ANTES del input
    if (hwCodec) {
      await this._addHardwareAccelerationArgs(args, hwCodec, channel);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input
    args.push('-i', channel.input_url);

    // Mapeo de streams (DESPUÉS de -i, ANTES de codecs)
    // Prioridad: video_stream_index/audio_stream_index > hls_program_index > map_video/map_audio
    if (channel.ffmpeg_params?.video_stream_index !== undefined ||
      channel.ffmpeg_params?.audio_stream_index !== undefined) {
      // Usar índices de stream específicos si están definidos
      this._processStreamMapping(args, channel.ffmpeg_params);
    } else {
      // Mapeo de streams para MPEG-TS (importante para VLC)
      // Mapear explícitamente video y audio para asegurar compatibilidad con VLC
      // Si hay múltiples programas en el input HLS, seleccionar el primero por defecto
      if (udpOutput.map_video !== false) {
        // Si se especifica un índice de programa específico
        if (udpOutput.hls_program_index !== undefined) {
          const programIndex = parseInt(udpOutput.hls_program_index);
          args.push('-map', `0:p:${programIndex}:v`);
        } else {
          // Mapear el primer stream de video disponible
          args.push('-map', '0:v:0');
        }
      }

      if (udpOutput.map_audio !== false) {
        // Si se especifica un índice de programa específico
        if (udpOutput.hls_program_index !== undefined) {
          const programIndex = parseInt(udpOutput.hls_program_index);
          args.push('-map', `0:p:${programIndex}:a`);
        } else {
          // Mapear el primer stream de audio disponible
          args.push('-map', '0:a:0');
        }
      }
    }

    // Aplicar parámetros de transcodificación
    if (channel.ffmpeg_params) {
      // Codec de video - usar aceleración por hardware si está disponible
      let videoCodec = channel.ffmpeg_params.video_codec || 'copy';
      
      if (hwCodec) {
        args.push('-c:v', hwCodec);
        // Agregar parámetros específicos del encoder de hardware (ej: -gpu para NVENC)
        this._addHardwareEncoderArgs(args, hwCodec, channel);
      } else {
        args.push('-c:v', videoCodec);
      }

      // Codec de audio
      if (channel.ffmpeg_params.audio_codec) {
        args.push('-c:a', channel.ffmpeg_params.audio_codec);
      } else {
        args.push('-c:a', 'copy');
      }

      // Bitrate de video
      if (channel.ffmpeg_params.video_bitrate) {
        args.push('-b:v', channel.ffmpeg_params.video_bitrate);
      }

      // Bitrate de audio
      if (channel.ffmpeg_params.audio_bitrate) {
        args.push('-b:a', channel.ffmpeg_params.audio_bitrate);
      }

      // Resolución
      if (channel.ffmpeg_params.resolution) {
        args.push('-s', channel.ffmpeg_params.resolution);
      }

      // Frame rate
      if (channel.ffmpeg_params.framerate) {
        args.push('-r', channel.ffmpeg_params.framerate);
      }

      // Filtros de video
      if (channel.ffmpeg_params.video_filters) {
        args.push('-vf', channel.ffmpeg_params.video_filters);
      }

      // Filtros de audio
      if (channel.ffmpeg_params.audio_filters) {
        args.push('-af', channel.ffmpeg_params.audio_filters);
      }

      // Parámetros de encoding (preset, tune, profile, etc.)
      const currentVideoCodec = hwCodec || videoCodec;
      this._processEncodingParams(args, channel.ffmpeg_params, currentVideoCodec);

      // Procesar output_options (DESPUÉS de codecs y encoding params)
      if (channel.ffmpeg_params.output_options) {
        this._processOutputOptions(args, channel.ffmpeg_params.output_options);
      }

      // Opciones adicionales (mantener compatibilidad)
      if (channel.ffmpeg_params.extra_options) {
        if (Array.isArray(channel.ffmpeg_params.extra_options)) {
          args.push(...channel.ffmpeg_params.extra_options);
        } else if (typeof channel.ffmpeg_params.extra_options === 'string') {
          args.push(...channel.ffmpeg_params.extra_options.split(' '));
        }
      }
    } else {
      // Por defecto, copiar sin transcodificar
      args.push('-c', 'copy');
    }

    // Formato MPEG-TS
    args.push('-f', 'mpegts');

    // Muxrate para MPEG-TS (importante para VLC y compatibilidad)
    // Si no está especificado, calcular basado en bitrate o usar valor por defecto
    // El muxrate debe ser mayor que el bitrate total (video + audio + overhead)
    let muxrate = '10080000'; // ~10 Mbps por defecto
    if (channel.ffmpeg_params && channel.ffmpeg_params.muxrate) {
      muxrate = channel.ffmpeg_params.muxrate.toString();
    } else if (channel.ffmpeg_params && channel.ffmpeg_params.video_bitrate) {
      // Calcular muxrate basado en bitrate de video (agregar 30% overhead para MPEG-TS)
      const bitrateStr = channel.ffmpeg_params.video_bitrate.toString();
      const bitrateNum = parseInt(bitrateStr.replace(/[^\d]/g, ''));
      let videoBps = 0;
      if (bitrateStr.includes('M')) {
        videoBps = bitrateNum * 1000000;
      } else if (bitrateStr.includes('k')) {
        videoBps = bitrateNum * 1000;
      }
      // Agregar overhead para audio (asumir ~128k) y overhead MPEG-TS (30%)
      const audioBps = 128000; // ~128k para audio
      muxrate = Math.ceil((videoBps + audioBps) * 1.3).toString();
    }
    args.push('-muxrate', muxrate);

    // Parámetros adicionales para compatibilidad con VLC
    // PCR (Program Clock Reference) - importante para sincronización en MPEG-TS
    args.push('-pcr_period', '20'); // Enviar PCR cada 20ms

    // PAT/PMT period - información de programa (actualizar frecuentemente)
    args.push('-pat_period', '0.1'); // Actualizar PAT/PMT cada 100ms

    // Stream ID para identificar streams en el programa MPEG-TS
    // Video stream ID (0x100 es estándar para video)
    args.push('-streamid', '0:0x100');
    // Audio stream ID (0x101 es estándar para audio)
    args.push('-streamid', '1:0x101');

    // Forzar reempaquetación MPEG-TS para mejor compatibilidad con VLC
    // Esto asegura que el stream esté bien formado para UDP
    args.push('-mpegts_flags', 'resend_headers');

    // Flush packets inmediatamente (importante para streaming UDP en tiempo real)
    args.push('-flush_packets', '1');

    // Opciones de buffer para UDP (importante para streaming estable)
    args.push('-bufsize', '65536');

    // Construir URL de salida UDP con parámetros opcionales
    let udpUrl = `udp://${udpOutput.host}:${udpOutput.port}`;

    // Agregar parámetros UDP si están especificados
    const udpParams = [];
    if (udpOutput.pkt_size) {
      udpParams.push(`pkt_size=${udpOutput.pkt_size}`);
    }
    if (udpOutput.buffer_size) {
      udpParams.push(`buffer_size=${udpOutput.buffer_size}`);
    }
    if (udpParams.length > 0) {
      udpUrl += '?' + udpParams.join('&');
    }

    args.push(udpUrl);

    return {
      command: constants.FFMPEG_PATH,
      args: args
    };
  }

  /**
   * Construye comando para HLS
   */
  async buildHLSCommand(channel, outputPath) {
    const args = [];

    // Determinar si se usará aceleración por hardware (ANTES de agregar el input)
    const hwCodec = this._determineHardwareCodec(channel) || 
                    (process.env.FFMPEG_HWACCEL_AUTO === 'true' ? this._getHardwareVideoCodec('libx264') : null);

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    } else {
      // Por defecto para HLS
      args.push('-fflags', '+genpts');
    }

    // Agregar argumentos de aceleración por hardware ANTES del input
    if (hwCodec) {
      await this._addHardwareAccelerationArgs(args, hwCodec, channel);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    args.push('-i', channel.input_url);

    // Mapeo de streams (DESPUÉS de -i, ANTES de codecs)
    if (channel.ffmpeg_params) {
      this._processStreamMapping(args, channel.ffmpeg_params);
    }

    // Parámetros de transcodificación
    if (channel.ffmpeg_params) {
      // Codec de video - usar aceleración por hardware si está disponible
      let videoCodec = channel.ffmpeg_params.video_codec || 'libx264';
      
      if (hwCodec) {
        args.push('-c:v', hwCodec);
        // Agregar parámetros específicos del encoder de hardware (ej: -gpu para NVENC)
        this._addHardwareEncoderArgs(args, hwCodec, channel);
      } else {
        args.push('-c:v', videoCodec);
      }

      if (channel.ffmpeg_params.audio_codec) {
        args.push('-c:a', channel.ffmpeg_params.audio_codec);
      } else {
        args.push('-c:a', 'aac');
      }

      if (channel.ffmpeg_params.video_bitrate) {
        args.push('-b:v', channel.ffmpeg_params.video_bitrate);
      }
      if (channel.ffmpeg_params.audio_bitrate) {
        args.push('-b:a', channel.ffmpeg_params.audio_bitrate);
      }
      if (channel.ffmpeg_params.resolution) {
        args.push('-s', channel.ffmpeg_params.resolution);
      }

      // Parámetros de encoding (preset, tune, profile, etc.)
      const currentVideoCodec = hwCodec || videoCodec;
      this._processEncodingParams(args, channel.ffmpeg_params, currentVideoCodec);

      // Procesar output_options (DESPUÉS de codecs y encoding params)
      if (channel.ffmpeg_params.output_options) {
        this._processOutputOptions(args, channel.ffmpeg_params.output_options);
      }
    } else {
      // Para HLS, intentar usar aceleración por hardware si está disponible
      if (hwCodec) {
        args.push('-c:v', hwCodec);
        // Agregar parámetros específicos del encoder de hardware (ej: -gpu para NVENC)
        this._addHardwareEncoderArgs(args, hwCodec, channel);
      } else {
        args.push('-c:v', 'libx264');
      }
      args.push('-c:a', 'aac');
    }

    // Parámetros HLS
    const hlsTime = channel.ffmpeg_params?.hls_time || 2;
    const hlsListSize = channel.ffmpeg_params?.hls_list_size || 5;
    const hlsFlags = channel.ffmpeg_params?.hls_flags || 'delete_segments';

    args.push('-hls_time', hlsTime.toString());
    args.push('-hls_list_size', hlsListSize.toString());
    args.push('-hls_flags', hlsFlags);
    args.push('-f', 'hls');
    args.push(path.join(outputPath, 'index.m3u8'));

    return {
      command: constants.FFMPEG_PATH,
      args: args
    };
  }

  /**
   * Construye comando para DVB
   */
  async buildDVBCommand(channel, outputPath) {
    const args = [];

    // Determinar si se usará aceleración por hardware (ANTES de agregar el input)
    const hwCodec = channel.ffmpeg_params?.video_codec && 
                    channel.ffmpeg_params.video_codec !== 'copy' 
                    ? this._getHardwareVideoCodec(channel.ffmpeg_params.video_codec) 
                    : null;

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    }

    // Agregar argumentos de aceleración por hardware ANTES del input
    if (hwCodec) {
      await this._addHardwareAccelerationArgs(args, hwCodec, channel);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input desde dispositivo DVB
    const dvbDevice = channel.ffmpeg_params?.dvb_device || '/dev/dvb/adapter0/frontend0';
    args.push('-f', 'dvb');
    args.push('-i', dvbDevice);

    // Mapeo de streams (DESPUÉS de -i, ANTES de codecs)
    if (channel.ffmpeg_params) {
      this._processStreamMapping(args, channel.ffmpeg_params);
    }

    // Parámetros de sintonización DVB
    if (channel.ffmpeg_params?.dvb_frequency) {
      args.push('-frequency', channel.ffmpeg_params.dvb_frequency.toString());
    }
    if (channel.ffmpeg_params?.dvb_modulation) {
      args.push('-modulation', channel.ffmpeg_params.dvb_modulation);
    }

    // Codec
    if (channel.ffmpeg_params?.video_codec && channel.ffmpeg_params.video_codec !== 'copy') {
      // Codec de video - usar aceleración por hardware si está disponible
      const videoCodec = channel.ffmpeg_params.video_codec;
      if (hwCodec) {
        args.push('-c:v', hwCodec);
        // Agregar parámetros específicos del encoder de hardware (ej: -gpu para NVENC)
        this._addHardwareEncoderArgs(args, hwCodec, channel);
      } else {
        args.push('-c:v', videoCodec);
      }
      args.push('-c:a', channel.ffmpeg_params.audio_codec || 'copy');

      // Parámetros de encoding (preset, tune, profile, etc.)
      const currentVideoCodec = hwCodec || videoCodec;
      this._processEncodingParams(args, channel.ffmpeg_params, currentVideoCodec);

      // Procesar output_options (DESPUÉS de codecs y encoding params)
      if (channel.ffmpeg_params.output_options) {
        this._processOutputOptions(args, channel.ffmpeg_params.output_options);
      }
    } else {
      args.push('-c', 'copy');
    }

    args.push('-f', 'mpegts');
    args.push(outputPath);

    return {
      command: constants.FFMPEG_PATH,
      args: args
    };
  }

  /**
   * Determina el tipo de output y construye el comando apropiado
   */
  async buildCommandForOutput(channel, output, outputPath) {
    if (output.type === 'udp') {
      return await this.buildUDPCommand(channel, output);
    } else if (output.type === 'hls') {
      return await this.buildHLSCommand(channel, outputPath);
    } else if (output.type === 'dvb') {
      return await this.buildDVBCommand(channel, outputPath);
    } else if (output.type === 'file') {
      return await this.buildCommand(channel, outputPath);
    } else {
      // Por defecto, comando genérico
      return await this.buildCommand(channel, outputPath);
    }
  }
}

module.exports = new FFmpegCommandBuilder();

