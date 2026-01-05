const { v4: uuidv4 } = require('uuid');

class User {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.username = data.username || '';
    this.password_hash = data.password_hash || '';
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Valida los datos del usuario
   */
  validate() {
    const errors = [];

    if (!this.username || this.username.trim().length === 0) {
      errors.push('El nombre de usuario es requerido');
    }

    if (this.username && this.username.length < 3) {
      errors.push('El nombre de usuario debe tener al menos 3 caracteres');
    }

    if (this.username && this.username.length > 255) {
      errors.push('El nombre de usuario no puede exceder 255 caracteres');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convierte el modelo a objeto plano para guardar en BD
   */
  toDB() {
    return {
      id: this.id,
      username: this.username,
      password_hash: this.password_hash,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Crea un modelo desde datos de BD
   */
  static fromDB(data) {
    return new User({
      id: data.id,
      username: data.username,
      password_hash: data.password_hash,
      created_at: data.created_at,
      updated_at: data.updated_at
    });
  }

  /**
   * Convierte a JSON para respuestas API (sin password_hash)
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = User;

