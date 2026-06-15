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

  waLog('offscreen', 'message received', { type: message.type });

  if (message.type === 'PLAY_STORED_SOUND') {
    playStoredAudio(message.payload).catch(error => {
      waLog('offscreen', 'stored audio play failed', { error: error.message });
      console.warn('[WA-Notify] Falha ao carregar audio salvo:', error.message);
    });
  }

  if (message.type === 'STOP_SOUND') {
    stopAudio();
  }
});

async function playStoredAudio(payload = {}) {
  waLog('offscreen', 'play stored audio start', {
    volume: payload.volume,
    durationSeconds: payload.durationSeconds,
  });
  stopAudio();

  const audioRecord = await getAudioRecord();
  if (!audioRecord || !audioRecord.blob) {
    waLog('offscreen', 'no audio record found');
    console.warn('[WA-Notify] Nenhum audio salvo para reproducao.');
    return;
  }

  waLog('offscreen', 'audio record loaded', {
    name: audioRecord.name,
    type: audioRecord.type,
    size: audioRecord.blob.size,
    updatedAt: audioRecord.updatedAt,
  });

  currentObjectUrl = URL.createObjectURL(audioRecord.blob);
  currentAudio = new Audio(currentObjectUrl);
  currentAudio.volume = normalizeVolume(payload.volume);
  currentAudio.currentTime = 0;

  const durationMs = normalizeDuration(payload.durationSeconds) * 1000;
  stopTimer = setTimeout(stopAudio, durationMs);

  currentAudio.addEventListener('ended', clearStopTimer, { once: true });
  currentAudio.play().catch(error => {
    clearStopTimer();
    waLog('offscreen', 'audio element play rejected', { error: error.message });
    console.warn('[WA-Notify] Falha ao reproduzir audio:', error.message);
  });
  waLog('offscreen', 'audio play called');
}

function stopAudio() {
  clearStopTimer();

  if (!currentAudio) {
    waLog('offscreen', 'stop ignored: no current audio');
    return;
  }

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio.src = '';
  currentAudio = null;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  waLog('offscreen', 'audio stopped');
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
  waLog('offscreen', 'opening indexeddb');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE);
      }
    };

    request.onsuccess = () => {
      waLog('offscreen', 'indexeddb opened');
      resolve(request.result);
    };
    request.onerror = () => {
      waLog('offscreen', 'indexeddb open failed', { error: request.error?.message || 'unknown' });
      reject(request.error || new Error('Falha ao abrir IndexedDB'));
    };
  });
}

async function getAudioRecord() {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readonly');
    const request = transaction.objectStore(AUDIO_STORE).get(AUDIO_KEY);

    request.onsuccess = () => {
      waLog('offscreen', 'indexeddb audio read complete', { found: Boolean(request.result) });
      resolve(request.result || null);
    };
    request.onerror = () => {
      waLog('offscreen', 'indexeddb audio read failed', { error: request.error?.message || 'unknown' });
      reject(request.error || new Error('Falha ao ler audio'));
    };
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Falha ao ler audio'));
    };
  });
}
