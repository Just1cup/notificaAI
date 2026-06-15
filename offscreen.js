// ============================================================
// WhatsApp Sound Notify - offscreen.js
// Reproduz e interrompe o audio fora da pagina do WhatsApp.
// ============================================================

'use strict';

let currentAudio = null;
let stopTimer = null;
let currentObjectUrl = null;

const DB_NAME = 'whatsapp-sound-notify';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio';
const AUDIO_KEY = 'notification-sound';

chrome.runtime.onMessage.addListener(message => {
  if (!message || message.target !== 'offscreen') return;

  if (message.type === 'PLAY_STORED_SOUND') {
    playStoredAudio(message.payload).catch(error => {
      console.warn('[WA-Notify] Falha ao carregar audio salvo:', error.message);
    });
  }

  if (message.type === 'STOP_SOUND') {
    stopAudio();
  }
});

async function playStoredAudio(payload = {}) {
  stopAudio();

  const audioRecord = await getAudioRecord();
  if (!audioRecord || !audioRecord.blob) {
    console.warn('[WA-Notify] Nenhum audio salvo para reproducao.');
    return;
  }

  currentObjectUrl = URL.createObjectURL(audioRecord.blob);
  currentAudio = new Audio(currentObjectUrl);
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

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
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

function openAudioDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB'));
  });
}

async function getAudioRecord() {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readonly');
    const request = transaction.objectStore(AUDIO_STORE).get(AUDIO_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Falha ao ler audio'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Falha ao ler audio'));
    };
  });
}
