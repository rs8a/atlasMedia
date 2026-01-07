const os = require('os');

/**
 * Obtiene la IP del servidor automáticamente
 * Busca la primera interfaz de red IPv4 que no sea localhost
 */
function getServerIP() {
  // Si está configurado manualmente, usar esa
  if (process.env.SERVER_IP) {
    return process.env.SERVER_IP;
  }

  const interfaces = os.networkInterfaces();

  // Prioridad: eth0, enp*, wlan*, cualquier otra interfaz
  const priorityOrder = ['eth0', 'enp', 'wlan', 'eth', 'en'];

  // Primero buscar por nombre de interfaz prioritario
  for (const priority of priorityOrder) {
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (name.startsWith(priority)) {
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address;
          }
        }
      }
    }
  }

  // Si no se encontró, buscar cualquier IP IPv4 no interna
  for (const [name, addrs] of Object.entries(interfaces)) {
    // Ignorar loopback y docker
    if (name === 'lo' || name.startsWith('docker') || name.startsWith('br-')) {
      continue;
    }

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  // Fallback: usar localhost si no se encuentra nada
  return 'localhost';
}

/**
 * Construye la BASE_URL del servidor
 */
function getBaseURL() {
  const port = process.env.PORT || 3000;

  // Si está configurado manualmente, usar esa
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }

  // Detectar IP automáticamente
  const ip = getServerIP();
  return `http://${ip}:${port}`;
}

module.exports = {
  // Puertos
  PORT: process.env.PORT || 3000,

  // Base URL del servidor (para construir URLs completas)
  // Se calcula dinámicamente cada vez que se accede para obtener la IP actual
  get BASE_URL() {
    return getBaseURL();
  },

  // Función para obtener BASE_URL dinámicamente (para uso explícito)
  getBaseURL: getBaseURL,

  // Función para obtener la IP del servidor
  getServerIP: getServerIP,

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
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h'
  }
};
