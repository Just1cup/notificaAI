// ============================================================
// WhatsApp Sound Notify - background.js
// Centraliza a reproducao de audio em um offscreen document.
// Isso evita bloqueios de autoplay no content script do WhatsApp.
// ============================================================

'use strict';

const OFFSCREEN_DOCUMENT = 'offscreen.html';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'PLAY_SOUND') {
    playSound(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        console.error('[WA-Notify] Falha ao tocar audio:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'STOP_SOUND') {
    stopSound()
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        console.error('[WA-Notify] Falha ao pausar audio:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function playSound(payload = {}) {
  const audioDataUrl = payload.audioDataUrl;
  if (!audioDataUrl) return;

  await ensureOffscreenDocument();

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'PLAY_SOUND',
    payload: {
      audioDataUrl,
      volume: normalizeVolume(payload.volume),
      durationSeconds: normalizeDuration(payload.durationSeconds),
    },
  });
}

async function stopSound() {
  if (!(await hasOffscreenDocument())) return;

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'STOP_SOUND',
  });
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Tocar o som personalizado de notificacao do WhatsApp Web.',
  });
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)],
  });

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
