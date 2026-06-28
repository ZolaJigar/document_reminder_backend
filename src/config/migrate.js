const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  console.log('Connected to MySQL.');

  // Create database if not exists
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${process.env.DB_NAME}\``);

  // Create migrations tracking table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get already-run migrations
  const [ran] = await connection.query('SELECT name FROM _migrations');
  const ranNames = new Set(ran.map((r) => r.name));

  // Read and sort migration files
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (ranNames.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await connection.query(sql);
      await connection.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
      console.log(`  ran   ${file}`);
      count++;
    } catch (err) {
      console.error(`  FAIL  ${file}: ${err.message}`);
      await connection.end();
      process.exit(1);
    }
  }

  console.log(`\nDone. ${count} migration(s) applied.`);
  await connection.end();
}

runMigrations().catch((err) => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
