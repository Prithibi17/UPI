import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdminServer } from './server.js';
import { getDatabase, runMigrations, ensureDatabaseInitialized } from '@youpi/db';

export function startAdminServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.PORT || process.env.MERCHANT_ADMIN_PORT || 6001);
  const db = options.db || getDatabase();
  ensureDatabaseInitialized(db);
  runMigrations(db);

  const adminServer = new AdminServer({ db, ...options });
  const rawServer = adminServer.createServer();

  // Bind to loopback unless explicitly overridden or when PORT is set in cloud platforms.
  const bindHost = process.env.YOUPI_BIND_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

  return new Promise(resolve => {
    const instance = rawServer.listen(finalPort, bindHost, () => {
      console.log(`[Merchant Admin] Server listening on port ${finalPort}`);
      resolve({
        port: finalPort,
        close: () => new Promise(cb => instance.close(cb))
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startAdminServer();
}

// Default export for Vercel Serverless / Node service invocation
let defaultAdminServer = null;
let defaultAdminRawServer = null;
export default function handler(req, res) {
  if (!defaultAdminRawServer) {
    const db = getDatabase();
    ensureDatabaseInitialized(db);
    runMigrations(db);
    defaultAdminServer = new AdminServer({ db });
    defaultAdminRawServer = defaultAdminServer.createServer();
  }
  defaultAdminRawServer.emit('request', req, res);
}
