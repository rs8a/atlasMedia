const logger = require('./logger');

/**
 * Parser para extraer estadísticas de FFmpeg desde su salida stderr
 * FFmpeg emite estadísticas en tiempo real con formato:
 * frame=  123 fps= 25 q=28.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.0x
 */
class FFmpegStatsParser {
  constructor() {
    // Buffer para acumular datos parciales
    this.buffers = new Map(); // Map<channelId, string>
  }

  /**
   * Parsea una línea de estadísticas de FFmpeg
   * @param {string} line - Línea de texto del stderr de FFmpeg
   * @returns {Object|null} - Objeto con estadísticas parseadas o null si no es una línea de estadísticas
   */
  parseStatsLine(line) {
    // FFmpeg emite estadísticas con formato: frame=  123 fps= 25 q=28.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.0x
    // También puede tener formato: frame=  123 fps= 25 q=28.0 Lsize=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.0x
    // O formato más simple: frame=  123 fps= 25 bitrate=1677.7kbits/s
    
    // Buscar líneas que contengan estadísticas (típicamente tienen "frame=")
    // No requerir "fps=" porque puede no estar siempre presente
    if (!line.includes('frame=')) {
      return null;
    }

    try {
      const stats = {};

      // Extraer frame
      const frameMatch = line.match(/frame=\s*(\d+)/);
      if (frameMatch) {
        stats.frame = parseInt(frameMatch[1], 10);
      }

      // Extraer fps
      const fpsMatch = line.match(/fps=\s*([\d.]+)/);
      if (fpsMatch) {
        stats.fps = parseFloat(fpsMatch[1]);
      }

      // Extraer q (quantizer/quality)
      const qMatch = line.match(/q=([\d.]+)/);
      if (qMatch) {
        stats.quality = parseFloat(qMatch[1]);
      }

      // Extraer size (puede ser "size=" o "Lsize=")
      const sizeMatch = line.match(/(?:L?size)=\s*(\d+)([kmg]?b)/i);
      if (sizeMatch) {
        let sizeBytes = parseInt(sizeMatch[1], 10);
        const unit = sizeMatch[2].toLowerCase();
        if (unit === 'kb') sizeBytes *= 1024;
        else if (unit === 'mb') sizeBytes *= 1024 * 1024;
        else if (unit === 'gb') sizeBytes *= 1024 * 1024 * 1024;
        stats.size = sizeBytes;
        stats.sizeFormatted = this.formatBytes(sizeBytes);
      }

      // Extraer time
      const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        const centiseconds = parseInt(timeMatch[4], 10);
        stats.time = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
        stats.timeFormatted = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}.${timeMatch[4]}`;
      }

      // Extraer bitrate - múltiples formatos posibles
      // Formato 1: bitrate=1677.7kbits/s o bitrate=1.5mbits/s (más común)
      let bitrateMatch = line.match(/bitrate=\s*([\d.]+)\s*(kbits\/s|mbits\/s|bits\/s|kb\/s|mb\/s)/i);
      if (bitrateMatch) {
        let bitrate = parseFloat(bitrateMatch[1]);
        const unit = bitrateMatch[2].toLowerCase();
        if (unit.includes('mbits') || unit.includes('mb/')) bitrate *= 1000; // Convertir a kbits/s
        else if (unit.includes('bits/') || (unit.includes('bits') && !unit.includes('k'))) bitrate /= 1000; // Convertir bits/s a kbits/s
        stats.bitrate = bitrate; // en kbits/s
        stats.bitrateFormatted = `${bitrate.toFixed(2)} kbits/s`;
      } else {
        // Formato 2: bitrate= 1677.7k (sin /s)
        bitrateMatch = line.match(/bitrate=\s*([\d.]+)\s*([km]?)/i);
        if (bitrateMatch) {
          let bitrate = parseFloat(bitrateMatch[1]);
          const unit = bitrateMatch[2].toLowerCase();
          if (unit === 'm') bitrate *= 1000; // Convertir a kbits/s
          stats.bitrate = bitrate; // en kbits/s
          stats.bitrateFormatted = `${bitrate.toFixed(2)} kbits/s`;
        } else {
          // Formato 3: bitrate N/A (calcular desde size y time si están disponibles)
          // Esto se calculará después si tenemos size y time
        }
      }
      
      // Si no encontramos bitrate pero tenemos size y time, calcularlo
      if (!stats.bitrate && stats.size && stats.time && stats.time > 0) {
        // bitrate = (size * 8) / time (en kbits/s)
        stats.bitrate = (stats.size * 8) / (stats.time * 1000); // Convertir bytes a kbits
        stats.bitrateFormatted = `${stats.bitrate.toFixed(2)} kbits/s`;
      }

      // Extraer speed
      const speedMatch = line.match(/speed=\s*([\d.]+)x/);
      if (speedMatch) {
        stats.speed = parseFloat(speedMatch[1]);
      }

      // Extraer bitrate de video y audio por separado (si está disponible)
      // FFmpeg a veces muestra: video:1234k audio:128k
      const videoBitrateMatch = line.match(/video:\s*(\d+)([km]?)/i);
      if (videoBitrateMatch) {
        let videoBitrate = parseInt(videoBitrateMatch[1], 10);
        if (videoBitrateMatch[2].toLowerCase() === 'm') videoBitrate *= 1000;
        stats.videoBitrate = videoBitrate; // en kbits/s
        stats.videoBitrateFormatted = `${videoBitrate}k`;
      }

      const audioBitrateMatch = line.match(/audio:\s*(\d+)([km]?)/i);
      if (audioBitrateMatch) {
        let audioBitrate = parseInt(audioBitrateMatch[1], 10);
        if (audioBitrateMatch[2].toLowerCase() === 'm') audioBitrate *= 1000;
        stats.audioBitrate = audioBitrate; // en kbits/s
        stats.audioBitrateFormatted = `${audioBitrate}k`;
      }

      // Agregar timestamp
      stats.timestamp = new Date().toISOString();

      return Object.keys(stats).length > 0 ? stats : null;
    } catch (error) {
      logger.debug(`Error parseando línea de estadísticas: ${line}`, error);
      return null;
    }
  }

  /**
   * Procesa datos del stderr de FFmpeg y extrae estadísticas
   * @param {string} channelId - ID del canal
   * @param {string} data - Datos del stderr
   * @returns {Object|null} - Últimas estadísticas parseadas o null
   */
  processData(channelId, data) {
    // Acumular datos en buffer (pueden llegar fragmentados)
    if (!this.buffers.has(channelId)) {
      this.buffers.set(channelId, '');
    }

    const buffer = this.buffers.get(channelId) + data;
    const lines = buffer.split('\n');
    
    // Guardar la última línea incompleta en el buffer
    this.buffers.set(channelId, lines.pop() || '');

    // Procesar líneas completas
    let lastStats = null;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        // Log para debug (solo líneas que parecen estadísticas)
        if (trimmedLine.includes('frame=')) {
          logger.debug(`[FFmpegStats] Canal ${channelId} - Línea: ${trimmedLine}`);
        }
        
        const stats = this.parseStatsLine(trimmedLine);
        if (stats) {
          lastStats = stats;
          logger.debug(`[FFmpegStats] Canal ${channelId} - Stats parseadas:`, stats);
        }
      }
    }

    return lastStats;
  }

  /**
   * Limpia el buffer de un canal
   * @param {string} channelId - ID del canal
   */
  clearBuffer(channelId) {
    this.buffers.delete(channelId);
  }

  /**
   * Formatea bytes a formato legible
   * @param {number} bytes - Bytes a formatear
   * @returns {string} - String formateado
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new FFmpegStatsParser();

