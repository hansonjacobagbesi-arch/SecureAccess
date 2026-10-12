
require('dotenv').config();
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dbName = process.env.DB_NAME || 'secureaccess';
const user = process.env.DB_USER || 'root';
const host = process.env.DB_HOST || '127.0.0.1';
const port = process.env.DB_PORT || '3306';
const dumpPath = process.env.MYSQLDUMP_PATH || 'mysqldump';
const outDir = path.resolve(process.env.BACKUP_DIR || './backups');

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(outDir, `${dbName}-${stamp}.sql`);
const args = ['--host', host, '--port', String(port), '--user', user, '--single-transaction', '--routines', '--triggers', dbName];

const child = spawn(dumpPath, args, { windowsHide: true, env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' } });
const stream = fs.createWriteStream(output);
child.stdout.pipe(stream);
child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('error', err => { console.error('Could not run mysqldump:', err.message); process.exitCode = 1; });
child.on('close', code => {
  if (code === 0) console.log(`Backup created: ${output}`);
  else { console.error(`Backup failed with exit code ${code}`); try { fs.unlinkSync(output); } catch {} process.exitCode = 1; }
});
