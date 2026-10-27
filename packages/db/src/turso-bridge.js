import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const DEFAULT_TURSO_URL = 'libsql://merchant-hub-prithibi.aws-ap-south-1.turso.io';
export const DEFAULT_TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiJlNzY5NTNhMy03MmFhLTQxNDItYjBkYy0yZWZmZDBhZDhlZTgiLCJpYXQiOjE3OTMxNDQxMjksImtpZCI6IkhIcTdRR2U4QXdJbFVvVjQ0WWtBNlV0aG55RUhhbnB4RUhMblJtamprN1UiLCJyaWQiOiJjODIyOTFkZi1kODM3LTRjODEtOWVjNC0zZWRjYTQ3YTc1ZTUifQ.XiQMdeNTvx6WcPJlT6Z3xcrr-grbe-qVB5p9oyeoUEAK1d14eYIhNxtB_Y7dt2O0YcVGc_6Z7WZpFra_-enjDw';

export function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || DEFAULT_TURSO_URL;
  const token = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || DEFAULT_TURSO_AUTH_TOKEN;
  return {
    url,
    token,
    enabled: Boolean(url && token)
  };
}

if (!isMainThread) {
  // --- WORKER THREAD ---
  const { sab, url, token } = workerData;
  const control = new Int32Array(sab, 0, 4);
  const dataBuf = Buffer.from(sab, 16);

  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    timeout: 30000
  });

  const hostname = url.replace(/^libsql:\/\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '');

  parentPort.on('message', async (action) => {
    try {
      const reqLen = control[1];
      const reqStr = dataBuf.toString('utf8', 0, reqLen);
      const reqObj = JSON.parse(reqStr);

      const response = await handleWorkerRequest(hostname, token, httpsAgent, reqObj);
      const respStr = JSON.stringify(response);
      const respLen = Buffer.byteLength(respStr);
      dataBuf.write(respStr, 0, respLen, 'utf8');
      control[1] = respLen;
    } catch (err) {
      const errStr = JSON.stringify({ error: err.message || String(err) });
      const errLen = Buffer.byteLength(errStr);
      dataBuf.write(errStr, 0, errLen, 'utf8');
      control[1] = errLen;
    }

    // Set status to 2 (response ready) and notify main thread
    Atomics.store(control, 0, 2);
    Atomics.notify(control, 0);
  });

  function mapParam(p) {
    if (p === null || p === undefined) return { type: 'null' };
    if (typeof p === 'number') {
      return Number.isInteger(p) ? { type: 'integer', value: String(p) } : { type: 'float', value: p };
    }
    if (typeof p === 'bigint') return { type: 'integer', value: p.toString() };
    if (Buffer.isBuffer(p)) return { type: 'blob', base64: p.toString('base64') };
    return { type: 'text', value: String(p) };
  }

  async function handleWorkerRequest(hostname, token, agent, req) {
    const { action, sql, params, statements } = req;

    if (action === 'batch') {
      const requests = (statements || []).map(s => ({
        type: 'execute',
        stmt: { sql: s, args: [] }
      }));
      requests.push({ type: 'close' });
      return await sendPipeline(hostname, token, agent, requests);
    }

    // Single query or execute
    const args = (params || []).map(mapParam);
    const requests = [
      { type: 'execute', stmt: { sql, args } },
      { type: 'close' }
    ];
    return await sendPipeline(hostname, token, agent, requests);
  }

  function sendPipeline(hostname, token, agent, requests) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ requests });
      const req = https.request({
        hostname,
        path: '/v2/pipeline',
        method: 'POST',
        agent,
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            const first = json.results?.[0];
            if (first?.type === 'error') {
              return reject(new Error(first.error?.message || 'Turso error'));
            }
            const result = first?.response?.result;
            if (!result) return resolve({ rows: [], changes: 0, lastInsertRowid: null });

            const cols = (result.cols || []).map(c => c.name);
            const rows = (result.rows || []).map(row => {
              const obj = {};
              row.forEach((val, i) => {
                const colName = cols[i];
                if (val.type === 'null') obj[colName] = null;
                else if (val.type === 'integer') obj[colName] = Number(val.value);
                else if (val.type === 'float') obj[colName] = Number(val.value);
                else obj[colName] = val.value;
              });
              return obj;
            });
            resolve({
              rows,
              changes: result.affected_row_count || 0,
              lastInsertRowid: result.last_insert_rowid !== undefined ? result.last_insert_rowid : null
            });
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

/**
 * Synchronous client bridge to Turso cloud database using Node worker_threads and SharedArrayBuffer.
 */
export class TursoBridge {
  constructor(options = {}) {
    const config = getTursoConfig();
    this.url = options.url || config.url;
    this.token = options.token || config.token;

    // 4MB shared memory buffer for synchronous IPC
    this.sab = new SharedArrayBuffer(4 * 1024 * 1024);
    this.control = new Int32Array(this.sab, 0, 4);
    this.dataBuf = Buffer.from(this.sab, 16);

    this.worker = new Worker(__filename, {
      workerData: {
        sab: this.sab,
        url: this.url,
        token: this.token
      }
    });

    this.worker.unref(); // Don't hold Node process open solely for worker
  }

  normalizeSql(sql) {
    return sql.replace(/\$\d+/g, '?');
  }

  _callSync(reqObj) {
    const reqStr = JSON.stringify(reqObj);
    const reqLen = Buffer.byteLength(reqStr);
    if (reqLen > this.dataBuf.length) {
      throw new Error(`Turso request payload too large (${reqLen} bytes)`);
    }

    this.dataBuf.write(reqStr, 0, reqLen, 'utf8');
    this.control[1] = reqLen;

    // Set status to 1 (request pending)
    Atomics.store(this.control, 0, 1);
    this.worker.postMessage('call');

    // Block main thread until status is updated to 2 (response ready)
    // Timeout at 15000ms to prevent infinite hang on network freeze
    const waitResult = Atomics.wait(this.control, 0, 1, 15000);
    if (waitResult === 'timed-out') {
      throw new Error('Turso query timed out after 15000ms');
    }

    const respLen = this.control[1];
    const respStr = this.dataBuf.toString('utf8', 0, respLen);
    const result = JSON.parse(respStr);
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  }

  query(sql, params = []) {
    const normalized = this.normalizeSql(sql);
    const result = this._callSync({ action: 'query', sql: normalized, params });
    return result.rows || [];
  }

  queryOne(sql, params = []) {
    const rows = this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  execute(sql, params = []) {
    const normalized = this.normalizeSql(sql);
    const result = this._callSync({ action: 'execute', sql: normalized, params });
    return {
      changes: result.changes || 0,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  run(sql, params = []) {
    return this.execute(sql, params);
  }

  exec(sql) {
    // Filter out PRAGMAs that are not supported or ignored by LibSQL/Turso
    const statements = sql
      .split(/;\s*[\r\n]+/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !/^PRAGMA/i.test(s));

    if (statements.length === 0) return;
    this._callSync({ action: 'batch', statements });
  }

  transaction(callback) {
    return callback();
  }

  close() {
    try {
      this.worker.terminate();
    } catch {}
  }
}
