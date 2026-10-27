import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoinWalletStoreServer } from './server.js';

export function startCoinWalletStore(port = null, options = {}) {
  const finalPort = port || Number(process.env.PORT || process.env.COIN_STORE_PORT || 5000);
  const storeServer = new CoinWalletStoreServer(options);
  const rawServer = storeServer.createServer();

  // Bind to loopback unless explicitly overridden or when PORT is set in cloud platforms.
  const bindHost = process.env.YOUPI_BIND_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

  return new Promise(resolve => {
    const instance = rawServer.listen(finalPort, bindHost, () => {
      console.log(`[Coin Wallet Store] Demo Store online at http://localhost:${finalPort}`);
      resolve({
        server: storeServer,
        port: finalPort,
        close: () => new Promise(cb => instance.close(cb))
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCoinWalletStore();
}

// Default export for Vercel Serverless / Node service invocation
let defaultStoreServer = null;
export default async function handler(req, res) {
  try {
    if (!defaultStoreServer) {
      defaultStoreServer = new CoinWalletStoreServer();
    }
    await defaultStoreServer.handleRequest(req, res);
  } catch (err) {
    console.error('[Coin Wallet Store Handler Error]:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Function invocation error', details: err.message }));
    }
  }
}
