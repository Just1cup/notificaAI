// ============================================================
// WhatsApp Sound Notify - background.js
// Centraliza a reproducao de audio em um offscreen document.
// Isso evita bloqueios de autoplay no content script do WhatsApp.
// ============================================================

'use strict';

importScripts('logger.js');

const OFFSCREEN_DOCUMENT = 'offscreen.html';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  waLog('background', 'message received', { type: message.type });

  if (message.type === 'PLAY_STORED_SOUND') {
    playStoredSound(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        waLog('background', 'play failed', { error: error.message });
        console.error('[WA-Notify] Falha ao tocar audio:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'STOP_SOUND') {
    stopSound()
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        waLog('background', 'stop failed', { error: error.message });
        console.error('[WA-Notify] Falha ao pausar audio:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function playStoredSound(payload = {}) {
  waLog('background', 'play stored sound requested', {
    volume: payload.volume,
    durationSeconds: payload.durationSeconds,
  });
  await ensureOffscreenDocument();

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'PLAY_STORED_SOUND',
    payload: {
      volume: normalizeVolume(payload.volume),
      durationSeconds: normalizeDuration(payload.durationSeconds),
    },
  });
  waLog('background', 'play forwarded to offscreen');
}

async function stopSound() {
  if (!(await hasOffscreenDocument())) {
    waLog('background', 'stop ignored: no offscreen document');
    return;
  }

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'STOP_SOUND',
  });
  waLog('background', 'stop forwarded to offscreen');
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    waLog('background', 'offscreen already available');
    return;
  }

  waLog('background', 'creating offscreen document');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Tocar o som personalizado de notificacao do WhatsApp Web.',
  });
  waLog('background', 'offscreen document created');
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)],
  });

  waLog('background', 'offscreen context check', { count: contexts.length });
  return contexts.length > 0;
}

function normalizeVolume(volume) {
  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) return 0.8;
  return Math.max(0, Math.min(1, numericVolume));
}

function normalizeDuration(durationSeconds) {
  const numericDuration = Number(durationSeconds);
  if (!Number.isFinite(numericDuration)) return 10;
  return Math.max(1, Math.min(120, numericDuration));
}
