/**
 * Valida los datos de un canal en el request
 */
function validateChannel(req, res, next) {
  const errors = [];

  // Validar nombre
  if (req.body.name !== undefined) {
    if (!req.body.name || typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
      errors.push('El nombre del canal es requerido y debe ser una cadena no vacía');
    }
  }

  // Validar input_url
  if (req.body.input_url !== undefined) {
    if (!req.body.input_url || typeof req.body.input_url !== 'string' || req.body.input_url.trim().length === 0) {
      errors.push('La URL de entrada es requerida');
    }
  }

  // Validar outputs
  if (req.body.outputs !== undefined) {
    if (!Array.isArray(req.body.outputs) || req.body.outputs.length === 0) {
      errors.push('Debe especificar al menos un destino de salida');
    } else {
      req.body.outputs.forEach((output, index) => {
        if (!output.type) {
          errors.push(`El output ${index} debe tener un tipo (udp, hls, dvb, file)`);
        }
        if (output.type === 'udp' && (!output.host || !output.port)) {
          errors.push(`El output ${index} de tipo UDP debe tener host y port`);
        }
      });
    }
  }

  // Validar auto_restart
  if (req.body.auto_restart !== undefined && typeof req.body.auto_restart !== 'boolean') {
    errors.push('auto_restart debe ser un booleano');
  }

  // Validar ffmpeg_params
  if (req.body.ffmpeg_params !== undefined && typeof req.body.ffmpeg_params !== 'object') {
    errors.push('ffmpeg_params debe ser un objeto');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: errors.join(', ')
    });
  }

  next();
}

module.exports = {
  validateChannel
};

