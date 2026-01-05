const path = require('path');
const constants = require('../config/constants');
const logger = require('../utils/logger');

class FFmpegCommandBuilder {
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
   * Procesa parámetros de encoding específicos (preset, tune, profile, etc.)
   */
  _processEncodingParams(args, ffmpegParams) {
    if (!ffmpegParams) return;

    // Preset (para libx264, libx265, etc.)
    if (ffmpegParams.preset) {
      args.push('-preset', ffmpegParams.preset);
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
  buildCommand(channel, outputPath) {
    const args = [];

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input
    args.push('-i', channel.input_url);

    // Parámetros de FFmpeg desde la configuración
    if (channel.ffmpeg_params) {
      // Codec de video
      if (channel.ffmpeg_params.video_codec) {
        args.push('-c:v', channel.ffmpeg_params.video_codec);
      } else {
        args.push('-c:v', 'copy'); // Por defecto, copiar sin transcodificar
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
      this._processEncodingParams(args, channel.ffmpeg_params);

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
  buildUDPCommand(channel, udpOutput) {
    const args = [];

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

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input
    args.push('-i', channel.input_url);

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

    // Aplicar parámetros de transcodificación
    if (channel.ffmpeg_params) {
      // Codec de video
      if (channel.ffmpeg_params.video_codec) {
        args.push('-c:v', channel.ffmpeg_params.video_codec);
      } else {
        args.push('-c:v', 'copy');
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
      this._processEncodingParams(args, channel.ffmpeg_params);

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
  buildHLSCommand(channel, outputPath) {
    const args = [];

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    } else {
      // Por defecto para HLS
      args.push('-fflags', '+genpts');
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    args.push('-i', channel.input_url);

    // Parámetros de transcodificación
    if (channel.ffmpeg_params) {
      if (channel.ffmpeg_params.video_codec) {
        args.push('-c:v', channel.ffmpeg_params.video_codec);
      } else {
        args.push('-c:v', 'libx264'); // HLS requiere transcodificación típicamente
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
      this._processEncodingParams(args, channel.ffmpeg_params);

      // Procesar output_options (DESPUÉS de codecs y encoding params)
      if (channel.ffmpeg_params.output_options) {
        this._processOutputOptions(args, channel.ffmpeg_params.output_options);
      }
    } else {
      args.push('-c:v', 'libx264');
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
  buildDVBCommand(channel, outputPath) {
    const args = [];

    // Procesar fflags (ANTES de -i)
    if (channel.ffmpeg_params?.fflags) {
      args.push('-fflags', channel.ffmpeg_params.fflags);
    }

    // Procesar input_options (ANTES de -i)
    if (channel.ffmpeg_params?.input_options) {
      this._processInputOptions(args, channel.ffmpeg_params.input_options);
    }

    // Input desde dispositivo DVB
    const dvbDevice = channel.ffmpeg_params?.dvb_device || '/dev/dvb/adapter0/frontend0';
    args.push('-f', 'dvb');
    args.push('-i', dvbDevice);

    // Parámetros de sintonización DVB
    if (channel.ffmpeg_params?.dvb_frequency) {
      args.push('-frequency', channel.ffmpeg_params.dvb_frequency.toString());
    }
    if (channel.ffmpeg_params?.dvb_modulation) {
      args.push('-modulation', channel.ffmpeg_params.dvb_modulation);
    }

    // Codec
    if (channel.ffmpeg_params?.video_codec && channel.ffmpeg_params.video_codec !== 'copy') {
      args.push('-c:v', channel.ffmpeg_params.video_codec);
      args.push('-c:a', channel.ffmpeg_params.audio_codec || 'copy');

      // Parámetros de encoding (preset, tune, profile, etc.)
      this._processEncodingParams(args, channel.ffmpeg_params);

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
  buildCommandForOutput(channel, output, outputPath) {
    if (output.type === 'udp') {
      return this.buildUDPCommand(channel, output);
    } else if (output.type === 'hls') {
      return this.buildHLSCommand(channel, outputPath);
    } else if (output.type === 'dvb') {
      return this.buildDVBCommand(channel, outputPath);
    } else if (output.type === 'file') {
      return this.buildCommand(channel, outputPath);
    } else {
      // Por defecto, comando genérico
      return this.buildCommand(channel, outputPath);
    }
  }
}

module.exports = new FFmpegCommandBuilder();

