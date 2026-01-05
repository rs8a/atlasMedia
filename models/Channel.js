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
    
    // Agregar URLs de salida para outputs HLS
    const outputsWithUrls = this.outputs.map(output => {
      if (output.type === 'hls') {
        return {
          ...output,
          url: `/media/${encodeURIComponent(slug)}/index.m3u8`
        };
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
      auto_restart: this.auto_restart,
      pid: this.pid,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Channel;

