const db = require('../lib/db');
const Channel = require('../models/Channel');
const logger = require('../utils/logger');

class ChannelRepository {
  /**
   * Obtiene todos los canales
   */
  async findAll() {
    try {
      const result = await db.query(
        'SELECT * FROM channels ORDER BY created_at DESC'
      );
      return result.rows.map(row => Channel.fromDB(row));
    } catch (error) {
      logger.error('Error en findAll:', error);
      throw error;
    }
  }

  /**
   * Obtiene un canal por ID
   */
  async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM channels WHERE id = $1',
        [id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en findById(${id}):`, error);
      throw error;
    }
  }

  /**
   * Crea un nuevo canal
   */
  async create(channel) {
    try {
      const channelData = channel.toDB();
      const result = await db.query(
        `INSERT INTO channels (id, name, status, input_url, ffmpeg_params, outputs, auto_restart, pid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          channelData.id,
          channelData.name,
          channelData.status,
          channelData.input_url,
          channelData.ffmpeg_params,
          channelData.outputs,
          channelData.auto_restart,
          channelData.pid,
          channelData.created_at,
          channelData.updated_at
        ]
      );
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error('Error en create:', error);
      throw error;
    }
  }

  /**
   * Actualiza un canal
   */
  async update(id, channelData) {
    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (channelData.name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(channelData.name);
      }
      if (channelData.input_url !== undefined) {
        updates.push(`input_url = $${paramCount++}`);
        values.push(channelData.input_url);
      }
      if (channelData.ffmpeg_params !== undefined) {
        updates.push(`ffmpeg_params = $${paramCount++}`);
        values.push(JSON.stringify(channelData.ffmpeg_params));
      }
      if (channelData.outputs !== undefined) {
        updates.push(`outputs = $${paramCount++}`);
        values.push(JSON.stringify(channelData.outputs));
      }
      if (channelData.auto_restart !== undefined) {
        updates.push(`auto_restart = $${paramCount++}`);
        values.push(channelData.auto_restart);
      }

      updates.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(id);

      const result = await db.query(
        `UPDATE channels SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return null;
      }
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en update(${id}):`, error);
      throw error;
    }
  }

  /**
   * Elimina un canal
   */
  async delete(id) {
    try {
      const result = await db.query(
        'DELETE FROM channels WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error en delete(${id}):`, error);
      throw error;
    }
  }

  /**
   * Actualiza el estado de un canal
   */
  async updateStatus(id, status) {
    try {
      const result = await db.query(
        'UPDATE channels SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
        [status, new Date(), id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en updateStatus(${id}, ${status}):`, error);
      throw error;
    }
  }

  /**
   * Actualiza el PID de un canal
   */
  async updatePid(id, pid) {
    try {
      const result = await db.query(
        'UPDATE channels SET pid = $1, updated_at = $2 WHERE id = $3 RETURNING *',
        [pid, new Date(), id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en updatePid(${id}, ${pid}):`, error);
      throw error;
    }
  }

  /**
   * Actualiza estado y PID simultáneamente
   */
  async updateStatusAndPid(id, status, pid) {
    try {
      const result = await db.query(
        'UPDATE channels SET status = $1, pid = $2, updated_at = $3 WHERE id = $4 RETURNING *',
        [status, pid, new Date(), id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return Channel.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en updateStatusAndPid(${id}):`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los canales con estado 'running'
   */
  async findRunningChannels() {
    try {
      const result = await db.query(
        "SELECT * FROM channels WHERE status = 'running'"
      );
      return result.rows.map(row => Channel.fromDB(row));
    } catch (error) {
      logger.error('Error en findRunningChannels:', error);
      throw error;
    }
  }

  /**
   * Busca un canal por nombre (normalizado)
   * @param {string} name - Nombre del canal a buscar
   * @returns {Channel|null} - Canal encontrado o null
   */
  async findByName(name) {
    try {
      const { normalizeName } = require('../utils/slug');
      const normalizedName = normalizeName(name);
      
      // Buscar todos los canales y comparar nombres normalizados
      const result = await db.query('SELECT * FROM channels');
      for (const row of result.rows) {
        const channel = Channel.fromDB(row);
        if (normalizeName(channel.name) === normalizedName) {
          return channel;
        }
      }
      return null;
    } catch (error) {
      logger.error(`Error en findByName(${name}):`, error);
      throw error;
    }
  }

  /**
   * Busca un canal por slug (nombre convertido a URL-friendly)
   * @param {string} slug - Slug del canal a buscar
   * @returns {Channel|null} - Canal encontrado o null
   */
  async findBySlug(slug) {
    try {
      const { nameToSlug } = require('../utils/slug');
      
      // Buscar todos los canales y comparar slugs
      const result = await db.query('SELECT * FROM channels');
      for (const row of result.rows) {
        const channel = Channel.fromDB(row);
        if (nameToSlug(channel.name) === slug) {
          return channel;
        }
      }
      return null;
    } catch (error) {
      logger.error(`Error en findBySlug(${slug}):`, error);
      throw error;
    }
  }
}

module.exports = new ChannelRepository();

