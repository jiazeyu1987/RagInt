const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { normalizeAsrText, resolveFixtureById } = require('./fixtures/asr-accuracy/manifest');

const RUN_REAL_ASR = String(process.env.PW_REAL_ASR || '').trim() === '1';
const FIXTURE_ID = String(process.env.PW_ASR_FIXTURE_ID || '').trim();
const PROBE_ONLY = String(process.env.PW_ASR_PROBE_ONLY || '').trim() === '1';
const APP_ORIGIN = 'http://127.0.0.1:4981';

function readProbeState(raw) {
  const probe = raw && typeof raw === 'object' ? raw : {};
  return {
    lastFinalTextBeforePostProcess: String(probe.lastFinalTextBeforePostProcess || ''),
    lastFinalReceivedAtMs: Number(probe.lastFinalReceivedAtMs || 0),
    lastInputTextFromAsr: String(probe.lastInputTextFromAsr || ''),
    lastInputTextFromAsrAtMs: Number(probe.lastInputTextFromAsrAtMs || 0),
    inputText: String(probe.inputText || ''),
    queueStatus: String(probe.queueStatus || ''),
    isRecording: !!probe.isRecording,
    isRecognizing: !!probe.isRecognizing,
    recognitionStage: String(probe.recognitionStage || 'idle'),
    asrPostProcessStage: String(probe.asrPostProcessStage || 'idle'),
    lastPostProcessResult: probe.lastPostProcessResult && typeof probe.lastPostProcessResult === 'object'
      ? { ...probe.lastPostProcessResult }
      : null,
    lastUpdatedAtMs: Number(probe.lastUpdatedAtMs || 0),
  };
}

function isRecognitionActive(probe) {
  return !!(probe && (probe.isRecording || probe.isRecognizing || probe.recognitionStage !== 'idle'));
}

async function holdRecordButton(page, locator, holdMs) {
  await locator.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
  });
  await expect
    .poll(
      async () => {
        const probe = readProbeState(await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null));
        return isRecognitionActive(probe) ? probe.recognitionStage || 'active' : '';
      },
      { timeout: 5_000 }
    )
    .not.toBe('');
  const startedProbe = readProbeState(await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null));
  await page.waitForTimeout(Math.max(200, Number(holdMs) || 0));
  await locator.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 0,
  });
  await page.waitForTimeout(150);
  const releasedProbe = readProbeState(await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null));
  return { startedProbe, releasedProbe };
}

test.describe('real asr accuracy', () => {
  test.skip(!RUN_REAL_ASR, 'Set PW_REAL_ASR=1 to run real ASR accuracy checks.');

  test('recognizes fixture wav through fake microphone and real SAUC ASR', async ({ page, context }, testInfo) => {
    const fixture = resolveFixtureById(FIXTURE_ID);
    if (!fixture) throw new Error(`unknown_fixture:${FIXTURE_ID || '<empty>'}`);

    const resultJsonPath = testInfo.outputPath('asr-result.json');
    const screenshotPath = testInfo.outputPath(`${fixture.id}.png`);
    const browserConsole = [];
    const failedResponses = [];
    const resultPayload = {
      fixtureId: fixture.id,
      fixtureTitle: fixture.title,
      audioPath: fixture.audioPath,
      expectedText: fixture.expectedText,
      expectedNormalizedText: fixture.expectedNormalizedText,
      probeOnly: PROBE_ONLY,
      status: 'started',
    };

    try {
      page.on('console', (message) => {
        browserConsole.push({
          type: message.type(),
          text: message.text(),
        });
      });
      page.on('pageerror', (error) => {
        browserConsole.push({
          type: 'pageerror',
          text: String((error && error.message) || error || 'unknown_page_error'),
        });
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        failedResponses.push({
          status: response.status(),
          method: response.request().method(),
          url: response.url(),
        });
      });

      await page.addInitScript(() => {
        window.__RAGINT_E2E__ = window.__RAGINT_E2E__ || {};
      });
      await context.grantPermissions(['microphone'], { origin: APP_ORIGIN });

      await page.goto('/ragint/');
      await expect(page.locator('.app')).toBeVisible();
      await expect(page.locator('.input-section')).toBeVisible();

      await expect
        .poll(
          async () =>
            page.evaluate(() => ({
              getAsrProbeState: typeof window.__RAGINT_E2E__?.getAsrProbeState,
              emitAsrFinal: typeof window.__RAGINT_E2E__?.emitAsrFinal,
              setConversationEnabled: typeof window.__RAGINT_E2E__?.setConversationEnabled,
            })),
          { timeout: 10_000 }
        )
        .toEqual({
          getAsrProbeState: 'function',
          emitAsrFinal: 'undefined',
          setConversationEnabled: 'undefined',
        });

      resultPayload.probeInterface = await page.evaluate(() => ({
        getAsrProbeState: typeof window.__RAGINT_E2E__?.getAsrProbeState,
        emitAsrFinal: typeof window.__RAGINT_E2E__?.emitAsrFinal,
        setConversationEnabled: typeof window.__RAGINT_E2E__?.setConversationEnabled,
      }));

      if (PROBE_ONLY) {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        resultPayload.screenshotPath = screenshotPath;
        resultPayload.status = 'passed';
        return;
      }

      const recordButton = page.getByRole('button', { name: '语音输入' });
      await expect(recordButton).toBeVisible();
      const stableRecordButton = page.locator('button.record-btn');
      await expect(stableRecordButton).toBeVisible();

      resultPayload.recordingLifecycle = await holdRecordButton(page, stableRecordButton, fixture.holdMs);

      await expect
        .poll(
          async () => {
            const probe = await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null);
            return normalizeAsrText(readProbeState(probe).lastFinalTextBeforePostProcess);
          },
          { timeout: fixture.maxFinalWaitMs }
        )
        .toBe(fixture.expectedNormalizedText);

      await expect
        .poll(
          async () => normalizeAsrText(await page.locator('input[type="text"]').first().inputValue()),
          { timeout: 5_000 }
        )
        .toBe(fixture.expectedNormalizedText);

      const probe = readProbeState(await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null));
      const inputValue = await page.locator('input[type="text"]').first().inputValue();

      resultPayload.observedFinalText = probe.lastFinalTextBeforePostProcess;
      resultPayload.observedNormalizedText = normalizeAsrText(probe.lastFinalTextBeforePostProcess);
      resultPayload.observedInputText = inputValue;
      resultPayload.observedInputNormalizedText = normalizeAsrText(inputValue);
      resultPayload.lastFinalReceivedAtMs = probe.lastFinalReceivedAtMs;
      resultPayload.lastInputTextFromAsrAtMs = probe.lastInputTextFromAsrAtMs;
      resultPayload.asrPostProcessStage = probe.asrPostProcessStage;

      await page.screenshot({ path: screenshotPath, fullPage: true });
      resultPayload.screenshotPath = screenshotPath;
      resultPayload.status = 'passed';
    } catch (error) {
      resultPayload.status = 'failed';
      resultPayload.error = String((error && error.message) || error || 'unknown_error');
      throw error;
    } finally {
      try {
        const finalProbe = await page.evaluate(() => window.__RAGINT_E2E__?.getAsrProbeState?.() || null);
        resultPayload.finalProbeState = readProbeState(finalProbe);
      } catch (_) {
        // ignore probe read failures during teardown
      }
      try {
        resultPayload.finalInputValue = await page.locator('input[type="text"]').first().inputValue();
      } catch (_) {
        // ignore missing input during teardown
      }
      resultPayload.browserConsole = browserConsole.slice(-40);
      resultPayload.failedResponses = failedResponses.slice(-20);
      try {
        if (!resultPayload.screenshotPath) {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          resultPayload.screenshotPath = screenshotPath;
        }
      } catch (_) {
        // ignore screenshot failures during teardown
      }
      fs.writeFileSync(resultJsonPath, `${JSON.stringify(resultPayload, null, 2)}\n`, 'utf8');
    }
  });
});
