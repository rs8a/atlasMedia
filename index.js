const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const constants = require('./config/constants');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const channelsRouter = require('./routes/channels');
const authRouter = require('./routes/auth');
const ffmpegManager = require('./managers/FFmpegManager');
const healthCheckManager = require('./managers/HealthCheckManager');
const logService = require('./services/LogService');
const initDatabase = require('./scripts/init-db');
const channelRepository = require('./repositories/ChannelRepository');
const setupStatsHandlers = require('./socket/statsHandler');

const app = express();
const httpServer = createServer(app);

// Inicializar base de datos al arrancar
async function startServer() {
  try {
    // Intentar inicializar BD (ignorar si ya existe)
    await initDatabase();
    logger.info('Base de datos inicializada');
  } catch (error) {
    logger.error('Error inicializando BD (continuando...):', error.message);
  }

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Ruta especial para servir archivos HLS por nombre de canal (sin UUID)
  // Esta ruta debe ir ANTES de la ruta estática para tener prioridad
  app.get('/media/:name/index.m3u8', async (req, res, next) => {
    try {
      const { nameToSlug } = require('./utils/slug');
      const slugFromUrl = decodeURIComponent(req.params.name);
      
      // Buscar canal cuyo slug coincida con el de la URL
      const channel = await channelRepository.findBySlug(slugFromUrl);
      
      if (!channel) {
        return res.status(404).json({ error: 'Canal no encontrado' });
      }

      const filePath = path.join(constants.MEDIA_BASE_PATH, channel.id, 'index.m3u8');
      
      // Verificar que el archivo existe
      if (!(await fs.pathExists(filePath))) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      // Servir el archivo con headers apropiados
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    } catch (error) {
      logger.error('Error sirviendo archivo HLS por nombre:', error);
      next(error);
    }
  });

  // Ruta para servir segmentos .ts por nombre de canal
  app.get('/media/:name/:segment', async (req, res, next) => {
    try {
      const { nameToSlug } = require('./utils/slug');
      const slugFromUrl = decodeURIComponent(req.params.name);
      const segment = req.params.segment;
      
      // Solo servir archivos .ts
      if (!segment.endsWith('.ts')) {
        return next();
      }

      // Buscar canal cuyo slug coincida con el de la URL
      const channel = await channelRepository.findBySlug(slugFromUrl);
      
      if (!channel) {
        return res.status(404).json({ error: 'Canal no encontrado' });
      }

      const filePath = path.join(constants.MEDIA_BASE_PATH, channel.id, segment);
      
      // Verificar que el archivo existe
      if (!(await fs.pathExists(filePath))) {
        return res.status(404).json({ error: 'Segmento no encontrado' });
      }

      // Servir el archivo con headers apropiados
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(filePath);
    } catch (error) {
      logger.error('Error sirviendo segmento por nombre:', error);
      next(error);
    }
  });

  // Servir archivos estáticos de media (fallback para URLs con UUID)
  app.use('/media', express.static(constants.MEDIA_BASE_PATH, {
    setHeaders: (res, filePath) => {
      // Configurar headers apropiados para archivos HLS
      if (filePath.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));

  // Health check básico
  app.get('/', (req, res) => {
    res.json({
      name: 'Atlas Media Server',
      status: 'running',
      version: '1.0.0'
    });
  });

  // Health check endpoint para Docker
  app.get('/health', async (req, res) => {
    try {
      // Verificar conexión a BD
      const db = require('./lib/db');
      await db.query('SELECT 1');
      
      res.json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Rutas API
  app.use('/api/channels', channelsRouter);
  app.use('/api/auth', authRouter);

  // Manejo de errores (debe ir al final)
  app.use(errorHandler);

  // Conectar LogService con FFmpegManager para capturar logs automáticamente
  ffmpegManager.on('log', async ({ channelId, level, message, timestamp }) => {
    await logService.saveLog(channelId, level, message);
  });

  // Configurar Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // En producción, especifica los orígenes permitidos
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'] // Soporte para ambos transportes
  });

  // Configurar handlers de Socket.IO para estadísticas
  setupStatsHandlers(io);
  logger.info('Socket.IO configurado para estadísticas en tiempo real');

  // Iniciar servidor HTTP (que incluye Socket.IO)
  httpServer.listen(constants.PORT, '0.0.0.0', () => {
    logger.info(`Servidor Atlas listo en puerto ${constants.PORT}`);
    logger.info(`Socket.IO disponible en ws://0.0.0.0:${constants.PORT}`);
    
    // Iniciar health check manager
    healthCheckManager.start();
    logger.info('HealthCheckManager iniciado');
  });

  // Manejo de cierre graceful
  process.on('SIGTERM', () => {
    logger.info('SIGTERM recibido, cerrando servidor...');
    healthCheckManager.stop();
    io.close(); // Cerrar Socket.IO
    httpServer.close(() => {
      logger.info('Servidor cerrado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT recibido, cerrando servidor...');
    healthCheckManager.stop();
    io.close(); // Cerrar Socket.IO
    httpServer.close(() => {
      logger.info('Servidor cerrado');
      process.exit(0);
    });
  });
}

startServer().catch(error => {
  logger.error('Error iniciando servidor:', error);
  process.exit(1);
});

module.exports = app;
