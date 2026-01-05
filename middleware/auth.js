const authService = require('../services/AuthService');
const logger = require('../utils/logger');

/**
 * Middleware de autenticación JWT
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Token de autenticación requerido'
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Formato de token inválido. Use: Bearer <token>'
      });
    }

    const token = parts[1];
    const user = await authService.verifyToken(token);

    // Agregar usuario al request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Error en authenticate:', error);
    res.status(401).json({
      error: 'Token inválido o expirado'
    });
  }
}

module.exports = {
  authenticate
};

