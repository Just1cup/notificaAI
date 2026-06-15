// ============================================================
// WhatsApp Sound Notify - offscreen.js
// Reproduz e interrompe o audio fora da pagina do WhatsApp.
// ============================================================

'use strict';

let currentAudio = null;
let stopTimer = null;

chrome.runtime.onMessage.addListener(message => {
  if (!message || message.target !== 'offscreen') return;

  if (message.type === 'PLAY_SOUND') {
    playAudio(message.payload);
  }

  if (message.type === 'STOP_SOUND') {
    stopAudio();
  }
});

function playAudio(payload = {}) {
  if (!payload.audioDataUrl) return;

  stopAudio();

  currentAudio = new Audio(payload.audioDataUrl);
  currentAudio.volume = normalizeVolume(payload.volume);
  currentAudio.currentTime = 0;

  const durationMs = normalizeDuration(payload.durationSeconds) * 1000;
  stopTimer = setTimeout(stopAudio, durationMs);

  currentAudio.addEventListener('ended', clearStopTimer, { once: true });
  currentAudio.play().catch(error => {
    clearStopTimer();
    console.warn('[WA-Notify] Falha ao reproduzir audio:', error.message);
  });
}

function stopAudio() {
  clearStopTimer();

  if (!currentAudio) return;

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio.src = '';
  currentAudio = null;
}

function clearStopTimer() {
  if (!stopTimer) return;
  clearTimeout(stopTimer);
  stopTimer = null;
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
