import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckoutServer } from './server.js';

export function startCheckoutServer(port = null, options = {}) {
  const finalPort = port || Number(process.env.PORT || process.env.CHECKOUT_PORTAL_PORT || 7000);
  const checkoutServer = new CheckoutServer(options);
  const rawServer = checkoutServer.createServer();

  // Bind to loopback unless explicitly overridden or when PORT is set in cloud platforms.
  const bindHost = process.env.YOUPI_BIND_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

  return new Promise(resolve => {
    const instance = rawServer.listen(finalPort, bindHost, () => {
      console.log(`[Checkout Portal] Server listening on port ${finalPort}`);
      resolve({
        port: finalPort,
        close: () => new Promise(cb => instance.close(cb))
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startCheckoutServer();
}

// Default export for Vercel Serverless / Node service invocation
let defaultCheckoutServer = null;
export default async function handler(req, res) {
  try {
    if (!defaultCheckoutServer) {
      defaultCheckoutServer = new CheckoutServer();
    }
    await defaultCheckoutServer.handleRequest(req, res);
  } catch (err) {
    console.error('[Checkout Portal Handler Error]:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Function invocation error', details: err.message }));
    }
  }
}
