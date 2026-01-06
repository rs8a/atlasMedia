const logger = require('../utils/logger');
const crypto = require('crypto');

class ViewerTrackingService {
  constructor() {
    // Map<channelId, Set<viewerId>>
    this.viewers = new Map();
    // Map<viewerId, { channelId, lastSeen, timeoutId }>
    this.viewerData = new Map();
    this.inactivityTimeout = 45000; // 45 segundos sin actividad = desconectado
    // (HLS típicamente actualiza cada 2-10 segundos, 45s es seguro)
  }

  /**
   * Genera un ID único para un visualizador basado en IP y User-Agent
   * Este ID será el mismo para todas las peticiones de la misma sesión
   */
  generateViewerId(req) {
    // Intentar obtener IP real (considerando proxies)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] || 
               req.ip || 
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               'unknown';
    
    const userAgent = req.get('user-agent') || 'unknown';
    
    // Crear hash simple pero estable para la sesión
    // En producción, podrías usar cookies para un ID más preciso
    return crypto
      .createHash('md5')
      .update(`${ip}-${userAgent}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Registra una actividad de visualización
   */
  recordViewerActivity(channelId, viewerId) {
    if (!this.viewers.has(channelId)) {
      this.viewers.set(channelId, new Set());
    }

    const channelViewers = this.viewers.get(channelId);
    const isNewViewer = !channelViewers.has(viewerId);
    
    if (isNewViewer) {
      channelViewers.add(viewerId);
      logger.info(`Nuevo visualizador ${viewerId} en canal ${channelId}. Total: ${channelViewers.size}`);
    }

    // Actualizar o crear datos del visualizador
    const existingData = this.viewerData.get(viewerId);
    if (existingData) {
      // Limpiar timeout anterior
      clearTimeout(existingData.timeoutId);
      
      // Si cambió de canal, actualizar
      if (existingData.channelId !== channelId) {
        // Remover del canal anterior
        const oldChannelViewers = this.viewers.get(existingData.channelId);
        if (oldChannelViewers) {
          oldChannelViewers.delete(viewerId);
          if (oldChannelViewers.size === 0) {
            this.viewers.delete(existingData.channelId);
          }
          logger.info(`Visualizador ${viewerId} cambió de canal ${existingData.channelId} a ${channelId}`);
        }
        // Agregar al nuevo canal
        channelViewers.add(viewerId);
      }
    } else {
      // Nuevo visualizador, guardar tiempo de inicio
      this.viewerData.set(viewerId, {
        channelId,
        watchingSince: new Date(),
        lastSeen: new Date(),
        timeoutId: null
      });
    }

    // Crear nuevo timeout para limpiar si no hay actividad
    const timeoutId = setTimeout(() => {
      this.removeViewer(viewerId);
    }, this.inactivityTimeout);

    // Actualizar datos del visualizador
    const viewerInfo = this.viewerData.get(viewerId);
    if (viewerInfo) {
      viewerInfo.lastSeen = new Date();
      viewerInfo.timeoutId = timeoutId;
    } else {
      this.viewerData.set(viewerId, {
        channelId,
        watchingSince: new Date(),
        lastSeen: new Date(),
        timeoutId
      });
    }
  }

  /**
   * Elimina un visualizador
   */
  removeViewer(viewerId) {
    const viewerData = this.viewerData.get(viewerId);
    if (viewerData) {
      const channelViewers = this.viewers.get(viewerData.channelId);
      if (channelViewers) {
        channelViewers.delete(viewerId);
        logger.info(`Visualizador ${viewerId} desconectado del canal ${viewerData.channelId}. Restantes: ${channelViewers.size}`);
        if (channelViewers.size === 0) {
          this.viewers.delete(viewerData.channelId);
        }
      }
      this.viewerData.delete(viewerId);
    }
  }

  /**
   * Obtiene el número de visualizadores de un canal
   */
  getViewerCount(channelId) {
    const channelViewers = this.viewers.get(channelId);
    return channelViewers ? channelViewers.size : 0;
  }

  /**
   * Obtiene el número de visualizadores de todos los canales
   */
  getAllViewerCounts() {
    const counts = {};
    this.viewers.forEach((viewers, channelId) => {
      counts[channelId] = viewers.size;
    });
    return counts;
  }

  /**
   * Obtiene estadísticas detalladas de visualizadores
   */
  getViewerStats(channelId) {
    const channelViewers = this.viewers.get(channelId);
    if (!channelViewers) {
      return {
        count: 0,
        viewers: []
      };
    }

    const viewers = Array.from(channelViewers).map(viewerId => {
      const data = this.viewerData.get(viewerId);
      return {
        id: viewerId,
        lastSeen: data ? data.lastSeen : null,
        watchingSince: data ? data.watchingSince : null
      };
    });

    return {
      count: channelViewers.size,
      viewers
    };
  }

  /**
   * Limpia visualizadores inactivos manualmente (útil para mantenimiento)
   */
  cleanupInactiveViewers() {
    const now = new Date();
    let cleaned = 0;
    
    this.viewerData.forEach((data, viewerId) => {
      const inactiveTime = now - data.lastSeen;
      if (inactiveTime > this.inactivityTimeout) {
        this.removeViewer(viewerId);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      logger.info(`Limpieza: ${cleaned} visualizadores inactivos removidos`);
    }
    
    return cleaned;
  }
}

module.exports = new ViewerTrackingService();

