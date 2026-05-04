const { app, BrowserWindow, dialog, session } = require('electron');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const APP_TITLE = 'RagInt Desktop';
const BACKEND_HOST = '127.0.0.1';
const DEFAULT_PORT = 8512;
const MAX_PORT = 8599;
const HEALTH_TIMEOUT_MS = 120000;

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let quitting = false;
let backendLogPaths = null;
let backendErrorTail = [];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function isPackaged() {
  return app.isPackaged;
}

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function resourceRoot() {
  return isPackaged() ? process.resourcesPath : repoRoot();
}

function resolveUserDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendLogLine(filePath, line) {
  fs.appendFileSync(filePath, line, 'utf8');
}

function attachProcessLogging(child, stdoutPath, stderrPath) {
  const onChunk = (targetPath, isError) => (chunk) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    appendLogLine(targetPath, text);
    if (isError) {
      backendErrorTail.push(text);
      if (backendErrorTail.length > 50) backendErrorTail = backendErrorTail.slice(-50);
    }
  };

  if (child.stdout) child.stdout.on('data', onChunk(stdoutPath, false));
  if (child.stderr) child.stderr.on('data', onChunk(stderrPath, true));
}

function resolveDevPython() {
  const explicit = String(process.env.RAGINT_DESKTOP_PYTHON || '').trim();
  if (explicit) {
    return { command: explicit, args: [] };
  }

  const pythonWhere = spawnSync('where', ['python'], { encoding: 'utf8', shell: false });
  if (pythonWhere.status === 0) {
    const first = String(pythonWhere.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
    if (first) return { command: first, args: [] };
  }

  const pyWhere = spawnSync('where', ['py'], { encoding: 'utf8', shell: false });
  if (pyWhere.status === 0) {
    const first = String(pyWhere.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)[0];
    if (first) return { command: first, args: ['-3'] };
  }

  throw new Error('python_runtime_not_found');
}

function checkPathExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label}_missing:${targetPath}`);
  }
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, BACKEND_HOST);
  });
}

async function findFreePort(startPort = DEFAULT_PORT, maxPort = MAX_PORT) {
  for (let port = startPort; port <= maxPort; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  throw new Error(`no_free_port_in_range:${startPort}-${maxPort}`);
}

function backendHealthUrl(port) {
  return `http://${BACKEND_HOST}:${port}/health`;
}

async function waitForBackendReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const url = backendHealthUrl(port);

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`backend_start_timeout:${url}`);
}

function runtimeEnv({ port }) {
  const env = { ...process.env };
  const runtimeDataDir = resolveUserDataDir();
  const resources = resourceRoot();
  const repo = repoRoot();
  const logDir = path.join(app.getPath('userData'), 'logs');
  const templateDir = isPackaged() ? path.join(resources, 'data-template') : path.join(repo, 'backend', 'data');
  const padFrontendDir = isPackaged() ? path.join(resources, 'frontend', 'pad') : path.join(repo, 'pad-frontend');
  const ragintFrontendDir = isPackaged() ? path.join(resources, 'frontend', 'ragint') : path.join(repo, 'fronted', 'build-ragint');

  ensureDir(runtimeDataDir);
  ensureDir(logDir);

  checkPathExists(templateDir, 'data_template_dir');
  checkPathExists(padFrontendDir, 'pad_frontend_dir');
  checkPathExists(ragintFrontendDir, 'ragint_frontend_dir');

  env.RAGINT_DESKTOP = '1';
  env.RAGINT_HOST = BACKEND_HOST;
  env.RAGINT_PORT = String(port);
  env.RAGINT_DEBUG = '0';
  env.RAGINT_STATE_BACKEND = 'memory';
  env.RAGINT_DATA_DIR = runtimeDataDir;
  env.RAGINT_DATA_TEMPLATE_DIR = templateDir;
  env.RAGINT_PAD_FRONTEND_DIR = padFrontendDir;
  env.RAGINT_RAGINT_FRONTEND_DIR = ragintFrontendDir;
  env.RAGINT_CORS_ORIGINS = `http://${BACKEND_HOST}:${port},http://localhost:${port}`;

  return { env, runtimeDataDir, logDir };
}

function buildBackendCommand({ port }) {
  const runtime = runtimeEnv({ port });
  const logDir = runtime.logDir;
  const stdoutPath = path.join(logDir, 'backend.stdout.log');
  const stderrPath = path.join(logDir, 'backend.stderr.log');
  backendLogPaths = { stdoutPath, stderrPath };

  if (isPackaged()) {
    const exePath = path.join(resourceRoot(), 'backend', 'ragint-backend.exe');
    checkPathExists(exePath, 'backend_executable');
    return {
      command: exePath,
      args: [],
      cwd: path.dirname(exePath),
      env: runtime.env,
      stdoutPath,
      stderrPath,
    };
  }

  const python = resolveDevPython();
  return {
    command: python.command,
    args: [...python.args, '-m', 'backend'],
    cwd: repoRoot(),
    env: runtime.env,
    stdoutPath,
    stderrPath,
  };
}

function killBackendProcess() {
  if (!backendProcess) return;
  const pid = backendProcess.pid;
  const child = backendProcess;
  backendProcess = null;

  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (_) {
    // ignore
  }
  child.removeAllListeners();
}

async function startBackend() {
  backendPort = await findFreePort();
  const cmd = buildBackendCommand({ port: backendPort });

  backendErrorTail = [];
  backendProcess = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    env: cmd.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  attachProcessLogging(backendProcess, cmd.stdoutPath, cmd.stderrPath);

  backendProcess.once('exit', (code, signal) => {
    if (!quitting) {
      const reason = `backend_exit:${code == null ? 'null' : code}:${signal || 'nosignal'}`;
      const tail = backendErrorTail.join('\n').trim();
      dialog.showErrorBox(APP_TITLE, `${reason}\n\n${tail || 'No backend error log captured.'}`);
      app.quit();
    }
  });

  await waitForBackendReady(backendPort, HEALTH_TIMEOUT_MS);
}

function backendAppUrl() {
  return `http://${BACKEND_HOST}:${backendPort}/`;
}

function configurePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    title: APP_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(backendAppUrl());
}

async function boot() {
  configurePermissions();
  await startBackend();
  createMainWindow();
}

app.whenReady().then(boot).catch((error) => {
  const detail = error && error.message ? error.message : String(error || 'unknown_error');
  const tail = backendErrorTail.join('\n').trim();
  dialog.showErrorBox(APP_TITLE, `${detail}\n\n${tail || 'No backend error log captured.'}`);
  app.exit(1);
});

app.on('before-quit', () => {
  quitting = true;
  killBackendProcess();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMainWindow();
});
