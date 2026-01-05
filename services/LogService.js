const db = require('../lib/db');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class LogService {
  /**
   * Guarda un log en la base de datos
   */
  async saveLog(channelId, level, message) {
    try {
      // Limpiar mensaje (eliminar saltos de línea múltiples)
      const cleanMessage = message.trim().replace(/\n+/g, '\n');
      
      await db.query(
        `INSERT INTO channel_logs (channel_id, level, message, created_at)
         VALUES ($1, $2, $3, $4)`,
        [channelId, level, cleanMessage, new Date()]
      );

      // Rotar logs si exceden el límite
      await this.rotateLogs(channelId);
    } catch (error) {
      logger.error(`Error guardando log para canal ${channelId}:`, error);
      // No lanzar error, solo registrar
    }
  }

  /**
   * Obtiene logs de un canal
   */
  async getLogs(channelId, options = {}) {
    try {
      const limit = options.limit || 100;
      const offset = options.offset || 0;
      const level = options.level; // opcional: filtrar por nivel

      let query = `
        SELECT * FROM channel_logs 
        WHERE channel_id = $1
      `;
      const params = [channelId];
      let paramCount = 2;

      if (level) {
        query += ` AND level = $${paramCount++}`;
        params.push(level);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error obteniendo logs para canal ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene el conteo total de logs de un canal
   */
  async getLogCount(channelId, level = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM channel_logs WHERE channel_id = $1';
      const params = [channelId];

      if (level) {
        query += ' AND level = $2';
        params.push(level);
      }

      const result = await db.query(query, params);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Error obteniendo conteo de logs para canal ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Elimina logs antiguos si exceden el límite
   */
  async rotateLogs(channelId) {
    try {
      const count = await this.getLogCount(channelId);
      const maxLogs = constants.MAX_LOG_ENTRIES_PER_CHANNEL;

      if (count > maxLogs) {
        const toDelete = count - maxLogs;
        await db.query(
          `DELETE FROM channel_logs 
           WHERE id IN (
             SELECT id FROM channel_logs 
             WHERE channel_id = $1 
             ORDER BY created_at ASC 
             LIMIT $2
           )`,
          [channelId, toDelete]
        );
        logger.debug(`Rotados ${toDelete} logs antiguos para canal ${channelId}`);
      }
    } catch (error) {
      logger.error(`Error rotando logs para canal ${channelId}:`, error);
    }
  }

  /**
   * Elimina todos los logs de un canal
   */
  async deleteLogs(channelId) {
    try {
      await db.query(
        'DELETE FROM channel_logs WHERE channel_id = $1',
        [channelId]
      );
      logger.info(`Logs eliminados para canal ${channelId}`);
    } catch (error) {
      logger.error(`Error eliminando logs para canal ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de logs de un canal
   */
  async getLogStats(channelId) {
    try {
      const result = await db.query(
        `SELECT 
          level,
          COUNT(*) as count,
          MIN(created_at) as first_log,
          MAX(created_at) as last_log
         FROM channel_logs 
         WHERE channel_id = $1 
         GROUP BY level`,
        [channelId]
      );

      const stats = {
        total: 0,
        byLevel: {}
      };

      result.rows.forEach(row => {
        stats.byLevel[row.level] = {
          count: parseInt(row.count),
          firstLog: row.first_log,
          lastLog: row.last_log
        };
        stats.total += parseInt(row.count);
      });

      return stats;
    } catch (error) {
      logger.error(`Error obteniendo estadísticas de logs para canal ${channelId}:`, error);
      throw error;
    }
  }
}

module.exports = new LogService();

