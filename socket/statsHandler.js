const statsService = require('../services/StatsService');
const logger = require('../utils/logger');

/**
 * Configura los handlers de Socket.IO para estadísticas en tiempo real
 */
function setupStatsHandlers(io) {
  // Middleware para autenticación (opcional, puedes implementarlo después)
  io.use((socket, next) => {
    // Por ahora permitimos todas las conexiones
    // TODO: Implementar autenticación JWT si es necesario
    next();
  });

  io.on('connection', (socket) => {
    logger.info(`Cliente conectado: ${socket.id}`);

    // Map para almacenar los intervalos de actualización por socket
    const intervals = new Map();

    // Suscribirse a estadísticas de un canal específico
    socket.on('subscribe:channel', async (channelId) => {
      logger.info(`Socket ${socket.id} se suscribió al canal ${channelId}`);
      
      // Limpiar intervalo anterior si existe
      if (intervals.has(channelId)) {
        clearInterval(intervals.get(channelId));
      }

      // Enviar estadísticas inmediatamente
      try {
        const stats = await statsService.getChannelStats(channelId);
        socket.emit('channel:stats', stats);
      } catch (error) {
        socket.emit('channel:error', {
          channelId,
          error: error.message
        });
      }

      // Configurar actualización periódica (cada 2 segundos)
      const interval = setInterval(async () => {
        try {
          const stats = await statsService.getChannelStats(channelId);
          socket.emit('channel:stats', stats);
        } catch (error) {
          logger.error(`Error enviando stats para canal ${channelId}:`, error);
          socket.emit('channel:error', {
            channelId,
            error: error.message
          });
        }
      }, 2000);

      intervals.set(channelId, interval);
    });

    // Suscribirse a estadísticas de todos los canales
    socket.on('subscribe:all', async () => {
      logger.info(`Socket ${socket.id} se suscribió a todos los canales`);
      
      // Limpiar intervalos anteriores
      intervals.forEach(interval => clearInterval(interval));
      intervals.clear();

      // Enviar estadísticas inmediatamente
      try {
        const stats = await statsService.getAllChannelsStats();
        socket.emit('all:stats', stats);
      } catch (error) {
        socket.emit('all:error', {
          error: error.message
        });
      }

      // Configurar actualización periódica (cada 2 segundos)
      const interval = setInterval(async () => {
        try {
          const stats = await statsService.getAllChannelsStats();
          socket.emit('all:stats', stats);
        } catch (error) {
          logger.error('Error enviando stats de todos los canales:', error);
          socket.emit('all:error', {
            error: error.message
          });
        }
      }, 2000);

      intervals.set('all', interval);
    });

    // Desuscribirse de un canal específico
    socket.on('unsubscribe:channel', (channelId) => {
      logger.info(`Socket ${socket.id} se desuscribió del canal ${channelId}`);
      
      if (intervals.has(channelId)) {
        clearInterval(intervals.get(channelId));
        intervals.delete(channelId);
      }
    });

    // Desuscribirse de todo
    socket.on('unsubscribe:all', () => {
      logger.info(`Socket ${socket.id} se desuscribió de todos los canales`);
      
      intervals.forEach(interval => clearInterval(interval));
      intervals.clear();
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
      logger.info(`Cliente desconectado: ${socket.id}`);
      
      // Limpiar todos los intervalos
      intervals.forEach(interval => clearInterval(interval));
      intervals.clear();
    });
  });
}

module.exports = setupStatsHandlers;

