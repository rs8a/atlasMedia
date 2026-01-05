const logger = require('../utils/logger');

/**
 * Middleware de manejo centralizado de errores
 */
function errorHandler(err, req, res, next) {
  logger.error('Error en API:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  // Error de validación
  if (err.name === 'ValidationError' || err.message.includes('requerido') || err.message.includes('inválido')) {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message
    });
  }

  // Error de recurso no encontrado
  if (err.message.includes('no encontrado') || err.message.includes('not found')) {
    return res.status(404).json({
      error: 'Not Found',
      message: err.message
    });
  }

  // Error de conflicto (ej: canal ya corriendo)
  if (err.message.includes('ya está') || err.message.includes('already')) {
    return res.status(409).json({
      error: 'Conflict',
      message: err.message
    });
  }

  // Error genérico del servidor
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Ha ocurrido un error interno' 
      : err.message
  });
}

module.exports = errorHandler;

