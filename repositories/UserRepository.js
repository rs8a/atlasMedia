const db = require('../lib/db');
const User = require('../models/User');
const logger = require('../utils/logger');

class UserRepository {
  /**
   * Obtiene un usuario por nombre de usuario
   */
  async findByUsername(username) {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return User.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en findByUsername(${username}):`, error);
      throw error;
    }
  }

  /**
   * Obtiene un usuario por ID
   */
  async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return User.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en findById(${id}):`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los usuarios
   */
  async findAll() {
    try {
      const result = await db.query(
        'SELECT * FROM users ORDER BY created_at DESC'
      );
      return result.rows.map(row => User.fromDB(row));
    } catch (error) {
      logger.error('Error en findAll:', error);
      throw error;
    }
  }

  /**
   * Crea un nuevo usuario
   */
  async create(user) {
    try {
      const userData = user.toDB();
      const result = await db.query(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userData.id,
          userData.username,
          userData.password_hash,
          userData.created_at,
          userData.updated_at
        ]
      );
      return User.fromDB(result.rows[0]);
    } catch (error) {
      logger.error('Error en create:', error);
      throw error;
    }
  }

  /**
   * Actualiza un usuario
   */
  async update(id, userData) {
    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (userData.username !== undefined) {
        updates.push(`username = $${paramCount++}`);
        values.push(userData.username);
      }
      if (userData.password_hash !== undefined) {
        updates.push(`password_hash = $${paramCount++}`);
        values.push(userData.password_hash);
      }

      updates.push(`updated_at = $${paramCount++}`);
      values.push(new Date());
      values.push(id);

      const result = await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return null;
      }
      return User.fromDB(result.rows[0]);
    } catch (error) {
      logger.error(`Error en update(${id}):`, error);
      throw error;
    }
  }

  /**
   * Elimina un usuario
   */
  async delete(id) {
    try {
      const result = await db.query(
        'DELETE FROM users WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error(`Error en delete(${id}):`, error);
      throw error;
    }
  }
}

module.exports = new UserRepository();

