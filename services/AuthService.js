const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const userRepository = require('../repositories/UserRepository');
const logger = require('../utils/logger');
const constants = require('../config/constants');

class AuthService {
  /**
   * Autentica un usuario y genera un token JWT
   */
  async login(username, password) {
    try {
      const user = await userRepository.findByUsername(username);
      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Credenciales inválidas');
      }

      // Generar token JWT
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username 
        },
        constants.JWT.SECRET,
        { expiresIn: constants.JWT.EXPIRES_IN }
      );

      return {
        user: user.toJSON(),
        token
      };
    } catch (error) {
      logger.error('Error en login:', error);
      throw error;
    }
  }

  /**
   * Verifica un token JWT y devuelve el usuario
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, constants.JWT.SECRET);
      const user = await userRepository.findById(decoded.id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      return user;
    } catch (error) {
      logger.error('Error en verifyToken:', error);
      throw new Error('Token inválido o expirado');
    }
  }

  /**
   * Crea un nuevo usuario
   */
  async register(username, password) {
    try {
      // Verificar si el usuario ya existe
      const existingUser = await userRepository.findByUsername(username);
      if (existingUser) {
        throw new Error('El nombre de usuario ya está en uso');
      }

      // Validar contraseña
      if (!password || password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres');
      }

      // Hashear contraseña
      const passwordHash = await bcrypt.hash(password, 10);

      // Crear usuario
      const user = new User({
        username,
        password_hash: passwordHash
      });

      const validation = user.validate();
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      const createdUser = await userRepository.create(user);
      logger.info(`Usuario creado: ${createdUser.username}`);

      return createdUser.toJSON();
    } catch (error) {
      logger.error('Error en register:', error);
      throw error;
    }
  }

  /**
   * Cambia la contraseña de un usuario
   */
  async changePassword(userId, oldPassword, newPassword) {
    try {
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar contraseña actual
      const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Validar nueva contraseña
      if (!newPassword || newPassword.length < 6) {
        throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
      }

      // Hashear nueva contraseña
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Actualizar contraseña
      await userRepository.update(userId, { password_hash: newPasswordHash });
      logger.info(`Contraseña actualizada para usuario: ${user.username}`);

      return true;
    } catch (error) {
      logger.error('Error en changePassword:', error);
      throw error;
    }
  }

  /**
   * Obtiene todos los usuarios (solo para administradores)
   */
  async getAllUsers() {
    try {
      const users = await userRepository.findAll();
      return users.map(user => user.toJSON());
    } catch (error) {
      logger.error('Error en getAllUsers:', error);
      throw new Error('Error al obtener usuarios');
    }
  }

  /**
   * Obtiene un usuario por ID
   */
  async getUserById(id) {
    try {
      const user = await userRepository.findById(id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      return user.toJSON();
    } catch (error) {
      logger.error(`Error en getUserById(${id}):`, error);
      throw error;
    }
  }

  /**
   * Elimina un usuario
   */
  async deleteUser(id) {
    try {
      const user = await userRepository.findById(id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      await userRepository.delete(id);
      logger.info(`Usuario eliminado: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error en deleteUser(${id}):`, error);
      throw error;
    }
  }
}

module.exports = new AuthService();

