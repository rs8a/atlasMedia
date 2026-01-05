const { Pool } = require('pg');
const constants = require('./constants');

const pool = new Pool({
  host: constants.DB.HOST,
  port: constants.DB.PORT,
  user: constants.DB.USER,
  password: constants.DB.PASSWORD,
  database: constants.DB.DATABASE,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});

module.exports = pool;

