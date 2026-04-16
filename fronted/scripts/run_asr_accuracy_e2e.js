#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { fixtures, resolveFixtureById } = require('../e2e/fixtures/asr-accuracy/manifest');

const FRONTED_DIR = path.resolve(__dirname, '..');
const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8101';

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BACKEND_BASE).trim().replace(/\/+$/, '');
}

function parseArgs(argv) {
  const args = {
    check: false,
    probeOnly: false,
    fixture: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--check') args.check = true;
    else if (token === '--probe-only') args.probeOnly = true;
    else if (token === '--fixture') {
      args.fixture = String(argv[i + 1] || '').trim();
      i += 1;
    } else {
      throw new Error(`unknown_arg:${token}`);
    }
  }
  return args;
}

function requestJson(method, targetUrl, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = transport.request(
      url,
      {
        method,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': String(payload.length),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (error) {
            reject(new Error(`invalid_json_response:${method}:${targetUrl}:${error.message}`));
            return;
          }
          resolve({
            statusCode: Number(res.statusCode || 0),
            body: parsed,
          });
        });
      }
    );
    req.on('error', (error) => reject(error));
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureHealth(backendBase) {
  const healthResp = await requestJson('GET', `${backendBase}/health`);
  if (healthResp.statusCode !== 200 || !healthResp.body || typeof healthResp.body !== 'object') {
    throw new Error(`backend_health_failed:${healthResp.statusCode}`);
  }

  const saucResp = await requestJson('GET', `${backendBase}/api/asr/sauc/health`);
  if (saucResp.statusCode !== 200 || !saucResp.body || saucResp.body.ok !== true) {
    throw new Error(`sauc_health_failed:${saucResp.statusCode}`);
  }
}

async function getAppSettings(backendBase) {
  const resp = await requestJson('GET', `${backendBase}/api/app_settings`);
  if (resp.statusCode !== 200 || !resp.body || typeof resp.body.settings !== 'object') {
    throw new Error(`app_settings_get_failed:${resp.statusCode}`);
  }
  return resp.body.settings;
}

async function putAppSettings(backendBase, settings) {
  const resp = await requestJson('PUT', `${backendBase}/api/app_settings`, { settings });
  if (resp.statusCode !== 200 || !resp.body || typeof resp.body.settings !== 'object') {
    throw new Error(`app_settings_put_failed:${resp.statusCode}`);
  }
  return resp.body.settings;
}

function buildDeterministicAsrSettings(current) {
  const settings = current && typeof current === 'object' ? { ...current } : {};
  const requiredKeys = ['saucWsUrl', 'saucResourceId', 'saucAppKey', 'saucAccessKey'];
  for (const key of requiredKeys) {
    if (!String(settings[key] || '').trim()) {
      throw new Error(`missing_required_setting:${key}`);
    }
  }
  return {
    ...settings,
    asrProviderType: 'sauc_ws',
    wakeWordEnabled: false,
    wakeWordStrict: false,
    asrTextFilterEnabled: false,
    playTourRecordingEnabled: false,
    tourRecordingEnabled: false,
    asrMinRecordMs: 900,
    asrStopGraceMs: 480,
    asrFinalWaitMs: 4000,
    settingsActiveTab: 'asr',
  };
}

function validateFixtures(selectedFixtureId) {
  const selected = selectedFixtureId ? [resolveFixtureById(selectedFixtureId)] : fixtures;
  if (selectedFixtureId && !selected[0]) throw new Error(`unknown_fixture:${selectedFixtureId}`);
  for (const fixture of selected) {
    if (!fs.existsSync(fixture.audioPath)) throw new Error(`missing_audio:${fixture.id}:${fixture.audioPath}`);
    if (!String(fixture.expectedText || '').trim()) throw new Error(`missing_expected:${fixture.id}`);
    if (!(Number(fixture.holdMs) > 0)) throw new Error(`missing_hold:${fixture.id}`);
    if (!(Number(fixture.maxFinalWaitMs) > 0)) throw new Error(`missing_timeout:${fixture.id}`);
  }
  return selected;
}

function buildSpawnEnv(extraEnv) {
  const merged = {};
  let resolvedPath = '';
  for (const [key, value] of Object.entries(process.env)) {
    if (String(key).toLowerCase() === 'path') {
      if (!resolvedPath) resolvedPath = String(value || '');
      continue;
    }
    merged[key] = value;
  }
  if (resolvedPath) merged.Path = resolvedPath;
  return {
    ...merged,
    ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}),
  };
}

function removeDirIfExists(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (_) {
    // ignore cleanup failures
  }
}

function findFileRecursive(rootDir, targetName) {
  if (!fs.existsSync(rootDir)) return '';
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFileRecursive(nextPath, targetName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === targetName) {
      return nextPath;
    }
  }
  return '';
}

function runPlaywrightForFixture(fixture, { backendBase, probeOnly }) {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(FRONTED_DIR, 'test-results', 'asr-accuracy', fixture.id);
    removeDirIfExists(outputDir);

    const env = buildSpawnEnv({
      BROWSER: 'none',
      PW_REAL_ASR: '1',
      PW_ASR_FIXTURE_ID: fixture.id,
      PW_ASR_AUDIO_FILE: fixture.audioPath,
      PW_ASR_PROBE_ONLY: probeOnly ? '1' : '0',
      PW_REAL_BACKEND_URL: backendBase,
      REACT_APP_BACKEND_URL: backendBase,
    });

    const child = spawn(
      'npx playwright test --config playwright.asr-accuracy.config.js e2e/asr-accuracy.real.spec.js --workers=1',
      {
        cwd: FRONTED_DIR,
        env,
        stdio: 'inherit',
        shell: true,
      }
    );

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      const resultJsonPath = findFileRecursive(outputDir, 'asr-result.json');
      let payload = null;
      if (resultJsonPath) {
        payload = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
      }
      resolve({
        code: Number(code || 0),
        outputDir,
        resultJsonPath,
        payload,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backendBase = normalizeBaseUrl(process.env.PW_REAL_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || DEFAULT_BACKEND_BASE);
  const selectedFixtures = validateFixtures(args.fixture);

  console.log(`backend_base=${backendBase}`);
  console.log(`fixture_count=${selectedFixtures.length}`);

  await ensureHealth(backendBase);
  console.log('health_ok=true');

  const originalSettings = await getAppSettings(backendBase);
  const deterministicSettings = buildDeterministicAsrSettings(originalSettings);
  let restoreAttempted = false;

  try {
    await putAppSettings(backendBase, deterministicSettings);
    console.log('settings_apply_ok=true');

    if (args.check) {
      console.log('check_only=true');
      return;
    }

    const failures = [];
    for (const fixture of selectedFixtures) {
      console.log(`running_fixture=${fixture.id}`);
      const result = await runPlaywrightForFixture(fixture, {
        backendBase,
        probeOnly: args.probeOnly,
      });
      const payload = result.payload || {};
      console.log(`fixture_exit_code=${fixture.id}:${result.code}`);
      if (result.resultJsonPath) console.log(`result_json=${result.resultJsonPath}`);
      if (payload.screenshotPath) console.log(`screenshot=${payload.screenshotPath}`);
      if (payload.observedFinalText) console.log(`observed_final_text=${fixture.id}:${payload.observedFinalText}`);
      if (payload.status !== 'passed' || result.code !== 0) {
        failures.push({
          fixtureId: fixture.id,
          exitCode: result.code,
          error: payload.error || 'playwright_failed',
          resultJsonPath: result.resultJsonPath || '',
        });
      }
    }

    if (failures.length) {
      for (const failure of failures) {
        console.error(
          `fixture_failed=${failure.fixtureId}:exit=${failure.exitCode}:error=${failure.error}:result=${failure.resultJsonPath}`
        );
      }
      throw new Error(`fixture_failures:${failures.length}`);
    }

    console.log('all_fixtures_passed=true');
  } finally {
    try {
      await putAppSettings(backendBase, originalSettings);
      restoreAttempted = true;
      console.log('settings_restore_ok=true');
    } catch (error) {
      console.error(`settings_restore_failed=${String((error && error.message) || error || 'unknown_error')}`);
      if (!restoreAttempted) process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(String((error && error.message) || error || 'unknown_error'));
  process.exit(1);
});
