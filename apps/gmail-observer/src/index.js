import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GmailObserverServer } from './server.js';
import { GmailPoller } from './gmail-poller.js';

export function startGmailObserver(port = null, options = {}) {
  const finalPort = port || Number(process.env.PORT || process.env.GMAIL_OBSERVER_PORT || 6003);
  const poller = new GmailPoller(options);
  const observerServer = new GmailObserverServer({ poller, ...options });
  const rawServer = observerServer.createServer();

  // Bind to loopback unless explicitly overridden or when PORT is set in cloud platforms.
  const bindHost = process.env.YOUPI_BIND_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

  return new Promise(resolve => {
    const instance = rawServer.listen(finalPort, bindHost, () => {
      console.log(`[Gmail Observer] Service listening on port ${finalPort}`);
      resolve({
        poller,
        port: finalPort,
        close: () => new Promise(cb => {
          poller.stop();
          instance.close(cb);
        })
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startGmailObserver();
}

// Default export for Vercel Serverless / Node service invocation
let defaultGmailServer = null;
let defaultGmailRawServer = null;
export default function handler(req, res) {
  if (!defaultGmailRawServer) {
    const poller = new GmailPoller();
    defaultGmailServer = new GmailObserverServer({ poller });
    defaultGmailRawServer = defaultGmailServer.createServer();
  }
  defaultGmailRawServer.emit('request', req, res);
}
