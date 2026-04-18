const fs = require('fs');
const path = require('path');
const http = require('http');
const { Readable } = require('stream');
const { spawnSync } = require('child_process');

const FRONTED_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTED_ROOT, '..');
const PAD_ROOT = path.join(REPO_ROOT, 'pad-frontend');
const RAGINT_BUILD_ROOT = path.join(FRONTED_ROOT, 'build-ragint');
const PORT = Math.max(1, Number(process.env.PORT) || 4981);
const BACKEND_PROXY_BASE = String(
  process.env.DUAL_FRONTEND_BACKEND_URL ||
    process.env.REACT_APP_BACKEND_URL ||
    process.env.PW_REAL_BACKEND_URL ||
    ''
)
  .trim()
  .replace(/\/+$/, '');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
};

function log(message) {
  process.stdout.write(`[dual-frontends] ${message}\n`);
}

function ensurePrerequisites() {
  const padIndex = path.join(PAD_ROOT, 'index.html');
  if (!fs.existsSync(padIndex)) {
    throw new Error(`pad_frontend_missing:${padIndex}`);
  }
}

function buildRagintBundle() {
  log('building legacy RagInt bundle at /ragint');
  const buildScript = require.resolve('react-scripts/scripts/build', {
    paths: [FRONTED_ROOT],
  });
  const result = spawnSync(
    process.execPath,
    [buildScript],
    {
      cwd: FRONTED_ROOT,
      env: {
        ...process.env,
        BROWSER: 'none',
        BUILD_PATH: 'build-ragint',
        CI: process.env.CI || 'true',
        PUBLIC_URL: '/ragint',
      },
      stdio: 'inherit',
    }
  );
  if (result.status !== 0) {
    const suffix = result.error ? `${result.error.code || 'error'}:${result.error.message}` : `${result.status}`;
    throw new Error(`ragint_build_failed:${suffix}`);
  }
  const indexPath = path.join(RAGINT_BUILD_ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`ragint_build_missing:${indexPath}`);
  }
}

function safeResolve(rootDir, relativePath) {
  const target = path.resolve(rootDir, relativePath);
  if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
    return null;
  }
  return target;
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function sendFile(res, filePath, method) {
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeFor(filePath));
  res.setHeader('Content-Length', stat.size);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.js' || ext === '.css') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', body.length);
  res.end(body);
}

async function proxyToBackend(req, res) {
  if (!BACKEND_PROXY_BASE) {
    sendJson(res, 502, {
      ok: false,
      error: 'backend_proxy_unavailable',
      detail: 'Set REACT_APP_BACKEND_URL or DUAL_FRONTEND_BACKEND_URL to proxy /api and /health.',
    });
    return;
  }

  try {
    const target = new URL(req.url || '/', BACKEND_PROXY_BASE);
    const headers = { ...req.headers };
    delete headers.host;
    const init = {
      method: req.method,
      headers,
      redirect: 'manual',
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req;
      init.duplex = 'half';
    }

    const response = await fetch(target, init);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    if (req.method === 'HEAD' || !response.body) {
      res.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: 'backend_proxy_failed',
      detail: error && error.message ? error.message : String(error || 'unknown_error'),
    });
  }
}

function serveStatic(res, method, rootDir, requestPath, fallbackPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath.replace(/^\/+/, '');
  const candidate = safeResolve(rootDir, relativePath);
  if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(res, candidate, method);
    return;
  }
  sendFile(res, path.join(rootDir, fallbackPath), method);
}

async function main() {
  ensurePrerequisites();
  buildRagintBundle();

  const server = http.createServer((req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;

    if (pathname === '/ragint') {
      res.statusCode = 302;
      res.setHeader('Location', '/ragint/');
      res.end();
      return;
    }

    if (pathname === '/health' || pathname.startsWith('/api/')) {
      void proxyToBackend(req, res);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    if (pathname.startsWith('/ragint/')) {
      const ragintPath = pathname.replace(/^\/ragint\//, '');
      serveStatic(res, method, RAGINT_BUILD_ROOT, ragintPath, 'index.html');
      return;
    }

    serveStatic(res, method, PAD_ROOT, pathname, 'index.html');
  });

  server.listen(PORT, '127.0.0.1', () => {
    log(`serving / from ${PAD_ROOT}`);
    log(`serving /ragint from ${RAGINT_BUILD_ROOT}`);
    log(`listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((error) => {
  const message = error && error.message ? error.message : String(error || 'unknown_error');
  process.stderr.write(`[dual-frontends] ${message}\n`);
  process.exit(1);
});
