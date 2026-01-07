const { v4: uuidv4 } = require('uuid');
const constants = require('../config/constants');

class Channel {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.name = data.name || '';
    this.status = data.status || constants.CHANNEL_STATUS.STOPPED;
    this.input_url = data.input_url || '';
    this.ffmpeg_params = data.ffmpeg_params || {};
    this.outputs = data.outputs || [];
    this.auto_restart = data.auto_restart !== undefined ? data.auto_restart : true;
    this.pid = data.pid || null;
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Valida los datos del canal
   */
  validate() {
    const errors = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push('El nombre del canal es requerido');
    }

    if (!this.input_url || this.input_url.trim().length === 0) {
      errors.push('La URL de entrada es requerida');
    }

    if (!Array.isArray(this.outputs) || this.outputs.length === 0) {
      errors.push('Debe especificar al menos un destino de salida');
    }

    const validStatuses = Object.values(constants.CHANNEL_STATUS);
    if (!validStatuses.includes(this.status)) {
      errors.push(`Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convierte el modelo a objeto plano para guardar en BD
   */
  toDB() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      input_url: this.input_url,
      ffmpeg_params: JSON.stringify(this.ffmpeg_params),
      outputs: JSON.stringify(this.outputs),
      auto_restart: this.auto_restart,
      pid: this.pid,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Crea un modelo desde datos de BD
   */
  static fromDB(data) {
    return new Channel({
      id: data.id,
      name: data.name,
      status: data.status,
      input_url: data.input_url,
      ffmpeg_params: typeof data.ffmpeg_params === 'string'
        ? JSON.parse(data.ffmpeg_params)
        : data.ffmpeg_params,
      outputs: typeof data.outputs === 'string'
        ? JSON.parse(data.outputs)
        : data.outputs,
      auto_restart: data.auto_restart,
      pid: data.pid,
      created_at: data.created_at,
      updated_at: data.updated_at
    });
  }

  /**
   * Convierte a JSON para respuestas API
   */
  toJSON() {
    const { nameToSlug } = require('../utils/slug');
    const slug = nameToSlug(this.name);
    
    // Objeto para almacenar todas las URLs de salida organizadas por tipo
    const urlOutputs = {
      hls: [],
      udp: [],
      dvb: [],
      file: []
    };
    
    // Obtener BASE_URL dinámicamente para asegurar que siempre tenga la IP actual
    const baseUrl = constants.getBaseURL();
    
    // Procesar todos los outputs y generar URLs completas
    const outputsWithUrls = this.outputs.map(output => {
      if (output.type === 'hls') {
        const relativePath = `/media/${encodeURIComponent(slug)}/index.m3u8`;
        const fullUrl = `${baseUrl}${relativePath}`;
        
        urlOutputs.hls.push({
          url: relativePath,
          fullUrl: fullUrl
        });
        
        return {
          ...output,
          url: relativePath,
          fullUrl: fullUrl
        };
      } else if (output.type === 'udp') {
        // Construir URL UDP completa
        let udpUrl = `udp://${output.host}:${output.port}`;
        const params = [];
        if (output.pkt_size) params.push(`pkt_size=${output.pkt_size}`);
        if (output.buffer_size) params.push(`buffer_size=${output.buffer_size}`);
        if (params.length > 0) udpUrl += '?' + params.join('&');
        
        urlOutputs.udp.push({
          host: output.host,
          port: output.port,
          fullUrl: udpUrl
        });
        
        return {
          ...output,
          fullUrl: udpUrl
        };
      } else if (output.type === 'dvb') {
        // Para DVB, la URL depende de la configuración específica
        // Por ahora, agregamos la información básica
        urlOutputs.dvb.push({
          path: output.path || null,
          fullUrl: output.path || null
        });
        
        return output;
      } else if (output.type === 'file') {
        // Para archivos, construir URL si hay path
        if (output.path) {
          const fileUrl = `${baseUrl}${output.path}`;
          urlOutputs.file.push({
            path: output.path,
            fullUrl: fileUrl
          });
          
          return {
            ...output,
            fullUrl: fileUrl
          };
        }
        return output;
      }
      return output;
    });

    return {
      id: this.id,
      name: this.name,
      status: this.status,
      input_url: this.input_url,
      ffmpeg_params: this.ffmpeg_params,
      outputs: outputsWithUrls,
      urlOutputs: urlOutputs,
      auto_restart: this.auto_restart,
      pid: this.pid,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Channel;

