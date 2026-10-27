import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmsObserverServer } from './server.js';
import { SmsObserverService } from './sms-service.js';

export function startSmsObserver(port = null, options = {}) {
  const finalPort = port || Number(process.env.PORT || process.env.SMS_OBSERVER_PORT || 6002);
  const service = new SmsObserverService(options);
  const observerServer = new SmsObserverServer({ service, ...options });
  const rawServer = observerServer.createServer();

  // Bind to loopback unless explicitly overridden or when PORT is set in cloud platforms.
  const bindHost = process.env.YOUPI_BIND_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

  return new Promise(resolve => {
    const instance = rawServer.listen(finalPort, bindHost, () => {
      console.log(`[SMS Observer] Service listening on port ${finalPort}`);
      resolve({
        service,
        port: finalPort,
        close: () => new Promise(cb => {
          service.stop();
          instance.close(cb);
        })
      });
    });
  });
}

// Auto-run if executed directly as main script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startSmsObserver();
}

// Default export for Vercel Serverless / Node service invocation
let defaultSmsServer = null;
export default async function handler(req, res) {
  try {
    if (!defaultSmsServer) {
      const service = new SmsObserverService();
      defaultSmsServer = new SmsObserverServer({ service });
    }
    await defaultSmsServer.handleRequest(req, res);
  } catch (err) {
    console.error('[SMS Observer Handler Error]:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Function invocation error', details: err.message }));
    }
  }
}
