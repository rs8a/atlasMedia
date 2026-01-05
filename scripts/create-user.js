const { Client } = require('pg');
const bcrypt = require('bcrypt');
const constants = require('../config/constants');

async function createInitialUser() {
  const client = new Client({
    host: constants.DB.HOST,
    port: constants.DB.PORT,
    user: constants.DB.USER,
    password: constants.DB.PASSWORD,
    database: constants.DB.DATABASE,
  });

  try {
    await client.connect();
    console.log('Conectado a PostgreSQL');

    // Verificar si la tabla users existe
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('La tabla users no existe. Creándola...');
      
      // Crear la tabla users
      await client.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Crear índice
      await client.query(`
        CREATE INDEX idx_users_username ON users(username);
      `);

      console.log('Tabla users creada exitosamente');
    }

    // Verificar si el usuario ya existe
    const userCheck = await client.query(
      'SELECT id FROM users WHERE username = $1',
      ['atlas']
    );

    if (userCheck.rows.length === 0) {
      // Generar hash de la contraseña
      const password = 'atlas123$';
      const passwordHash = await bcrypt.hash(password, 10);

      // Insertar usuario
      await client.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
        ['atlas', passwordHash]
      );

      console.log('Usuario inicial "atlas" creado exitosamente');
    } else {
      console.log('Usuario "atlas" ya existe');
    }

    // Verificar que se creó correctamente
    const verify = await client.query(
      'SELECT username, created_at FROM users WHERE username = $1',
      ['atlas']
    );
    
    if (verify.rows.length > 0) {
      console.log('Usuario verificado:', verify.rows[0]);
    }

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  createInitialUser()
    .then(() => {
      console.log('Proceso completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = createInitialUser;

