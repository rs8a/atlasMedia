const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const constants = require('../config/constants');

/**
 * Espera a que PostgreSQL esté disponible con reintentos
 */
async function waitForPostgres(maxRetries = 30, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    const client = new Client({
      host: constants.DB.HOST,
      port: constants.DB.PORT,
      user: constants.DB.USER,
      password: constants.DB.PASSWORD,
      database: constants.DB.DATABASE,
      connectionTimeoutMillis: 1000,
    });

    try {
      await client.connect();
      await client.end();
      return true;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`Esperando PostgreSQL... (intento ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`PostgreSQL no disponible después de ${maxRetries} intentos: ${error.message}`);
      }
    }
  }
}

async function initDatabase() {
  // Esperar a que PostgreSQL esté disponible
  await waitForPostgres();

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

    const usersTableExists = tableCheck.rows[0].exists;

    // Leer y ejecutar schema.sql
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    try {
      await client.query(schema);
      console.log('Schema ejecutado exitosamente');
    } catch (schemaError) {
      if (schemaError.code === '42P07') {
        // Tabla ya existe, ignorar
        console.log('Algunas tablas ya existen, continuando...');
      } else {
        // Si es otro error y la tabla users no existe, intentar crearla
        if (!usersTableExists && schemaError.message.includes('users')) {
          console.log('Creando tabla users manualmente...');
          await client.query(`
            CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              username VARCHAR(255) NOT NULL UNIQUE,
              password_hash VARCHAR(255) NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
          console.log('Tabla users creada exitosamente');
        } else {
          throw schemaError;
        }
      }
    }

    // Verificar nuevamente si la tabla users existe antes de crear el usuario
    const finalTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!finalTableCheck.rows[0].exists) {
      console.log('La tabla users no existe. Creándola...');
      await client.query(`
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
      console.log('Tabla users creada exitosamente');
    }

    // Crear usuario inicial si no existe
    const username = 'atlas';
    const password = 'atlas123$';
    
    try {
      const userCheck = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (userCheck.rows.length === 0) {
        const passwordHash = await bcrypt.hash(password, 10);
        await client.query(
          'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
          [username, passwordHash]
        );
        console.log(`Usuario inicial '${username}' creado exitosamente`);
      } else {
        console.log(`Usuario '${username}' ya existe, omitiendo creación`);
      }
    } catch (userError) {
      console.error('Error creando usuario inicial:', userError.message);
      // No lanzar error, solo registrar
    }
  } catch (error) {
    console.error('Error inicializando base de datos:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Inicialización completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error en inicialización:', error);
      process.exit(1);
    });
}

module.exports = initDatabase;

