module.exports = {
  // Puertos
  PORT: process.env.PORT || 3000,
  
  // Base de datos
  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: process.env.DB_PORT || 5432,
    USER: process.env.POSTGRES_USER || 'atlas_user',
    PASSWORD: process.env.POSTGRES_PASSWORD || 'atlas_password',
    DATABASE: process.env.POSTGRES_DB || 'atlas_metadata'
  },
  
  // Paths - Usar ruta absoluta en Docker
  MEDIA_BASE_PATH: process.env.MEDIA_BASE_PATH || '/usr/src/app/media',
  
  // FFmpeg
  FFMPEG_PATH: process.env.FFMPEG_PATH || 'ffmpeg',
  
  // Health Check
  HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10), // 30 segundos
  
  // Logs
  MAX_LOG_ENTRIES_PER_CHANNEL: parseInt(process.env.MAX_LOG_ENTRIES_PER_CHANNEL || '1000', 10),
  
  // Estados de canal
  CHANNEL_STATUS: {
    RUNNING: 'running',
    STOPPED: 'stopped',
    ERROR: 'error',
    RESTARTING: 'restarting'
  },
  
  // JWT
  JWT: {
    SECRET: process.env.JWT_SECRET || 'atlas_secret_key_change_in_production',
    EXPIRES_IN: process.env.JWT_EXIRES_IN || '24h'
  }
};

