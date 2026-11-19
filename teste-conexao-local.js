require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: String(process.env.DB_SSL).toLowerCase() === 'true'
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 8000
});

(async () => {
  try {
    const result = await pool.query('SELECT 1 AS conectado');
    console.log('CONEXAO POSTGRESQL: OK');
    console.log('Teste:', result.rows[0].conectado);
  } catch (error) {
    console.error('CONEXAO POSTGRESQL: FALHOU');
    console.error('Codigo:', error.code || 'N/D');
    console.error('Tipo:', error.name);
  } finally {
    await pool.end();
  }
})();
