// ============================================================
// WhatsApp Sound Notify — popup.js
// Gerencia a interface do popup: upload de áudio, volume,
// toggle de ativação e botão de teste.
// ============================================================

'use strict';

// ── Atalho para getElementById ──────────────────────────────
const $ = id => document.getElementById(id);

// ── Estado local carregado do storage ──────────────────────
let state = {
  enabled: true,
  volume: 0.8,
  durationSeconds: 10,
  hasAudio: false,
  audioName: null,     // nome do arquivo para exibição
};

const DB_NAME = 'whatsapp-sound-notify';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio';
const AUDIO_KEY = 'notification-sound';
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;

// ── Inicialização ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  renderUI();
  bindEvents();
  await refreshLogCount();
  waLog('popup', 'popup loaded', {
    enabled: state.enabled,
    hasAudio: state.hasAudio,
    audioName: state.audioName,
    volume: state.volume,
    durationSeconds: state.durationSeconds,
  });
});

// ── Carrega configurações salvas ────────────────────────────
async function loadState() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['enabled', 'volume', 'durationSeconds', 'hasAudio', 'audioName'],
      data => {
        if (chrome.runtime.lastError) {
          waLog('popup', 'failed to load state', { error: chrome.runtime.lastError.message });
          console.warn('[WA-Notify] Falha ao carregar configuracoes:', chrome.runtime.lastError.message);
          resolve();
          return;
        }

        state.enabled      = data.enabled      ?? true;
        state.volume       = data.volume       ?? 0.8;
        state.durationSeconds = normalizeDuration(data.durationSeconds ?? 10);
        state.hasAudio     = data.hasAudio     ?? false;
        state.audioName    = data.audioName    ?? null;
        resolve();
      }
    );
  });
}

// ── Persiste estado no storage e notifica o content script ──
async function saveState() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({
      enabled:      state.enabled,
      volume:       state.volume,
      durationSeconds: state.durationSeconds,
      hasAudio:     state.hasAudio,
      audioName:    state.audioName,
    }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

// ── Atualiza toda a interface com o estado atual ─────────────
function renderUI() {
  // Toggle
  $('toggleEnabled').checked = state.enabled;

  // Volume
  $('volumeSlider').value    = Math.round(state.volume * 100);
  $('volumeDisplay').textContent = Math.round(state.volume * 100) + '%';

  $('durationInput').value = state.durationSeconds;
  $('durationDisplay').textContent = state.durationSeconds + 's';
  $('durationInfo').textContent = state.durationSeconds + ' segundos';

  // Áudio
  if (state.hasAudio) {
    $('audioName').textContent = state.audioName ?? 'Arquivo de áudio';
    $('btnClearAudio').hidden  = false;
    $('btnTest').disabled      = false;
    $('btnPause').disabled     = false;
  } else {
    $('audioName').textContent = 'Nenhum arquivo selecionado';
    $('btnClearAudio').hidden  = true;
    $('btnTest').disabled      = true;
    $('btnPause').disabled     = true;
  }

  // Status bar
  updateStatusBar();
}

// ── Atualiza a barra de status ───────────────────────────────
function updateStatusBar() {
  const dot  = $('statusDot');
  const text = $('statusText');

  if (!state.enabled) {
    dot.className  = 'status-dot disabled';
    text.textContent = 'Extensão desativada';
    return;
  }

  if (!state.hasAudio) {
    dot.className  = 'status-dot error';
    text.textContent = 'Aguardando arquivo de áudio';
    return;
  }

  dot.className  = 'status-dot active';
  text.textContent = 'Monitorando mensagens';
}

// ── Vincula todos os eventos de UI ───────────────────────────
function bindEvents() {

  // Toggle ativar/desativar
  $('toggleEnabled').addEventListener('change', async e => {
    state.enabled = e.target.checked;
    try {
      await saveState();
      waLog('popup', 'enabled changed', { enabled: state.enabled });
      updateStatusBar();
    } catch (err) {
      state.enabled = !state.enabled;
      renderUI();
      showToast('Nao foi possivel salvar a configuracao.', 'error');
      console.error('[WA-Notify] Erro ao salvar toggle:', err);
    }
  });

  // Botão "Escolher arquivo" abre o input oculto
  $('btnChooseFile').addEventListener('click', () => {
    waLog('popup', 'choose file clicked');
    $('fileInput').click();
  });

  // Seleção de arquivo
  $('fileInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) {
      waLog('popup', 'file selection cancelled');
      return;
    }

    waLog('popup', 'file selected', {
      name: file.name,
      size: file.size,
      type: file.type || '(empty)',
    });

    // Valida que é um arquivo de áudio. Alguns navegadores deixam file.type vazio.
    if (!isAudioFile(file)) {
      waLog('popup', 'file rejected: invalid audio type', {
        name: file.name,
        type: file.type || '(empty)',
      });
      showToast('Selecione um arquivo de áudio válido.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AUDIO_BYTES) {
      waLog('popup', 'file rejected: too large', {
        name: file.name,
        size: file.size,
        limit: MAX_AUDIO_BYTES,
      });
      showToast('Use um audio de ate 50 MB.', 'error');
      e.target.value = '';
      return;
    }

    try {
      await saveAudioFile(file);

      state.hasAudio = true;
      state.audioName    = file.name;

      await saveState();
      renderUI();
      await refreshLogCount();
      waLog('popup', 'audio saved', {
        name: file.name,
        size: file.size,
        type: file.type || inferAudioType(file.name),
      });
      showToast('Áudio salvo com sucesso!');
    } catch (err) {
      waLog('popup', 'audio save failed', { error: err.message });
      console.error('[WA-Notify] Erro ao salvar arquivo:', err);
      showToast('Erro ao salvar o arquivo.', 'error');
    }

    // Reseta o input para permitir re-seleção do mesmo arquivo
    e.target.value = '';
  });

  // Botão remover áudio
  $('btnClearAudio').addEventListener('click', async () => {
    state.hasAudio = false;
    state.audioName    = null;
    try {
      await deleteAudioFile();
      await saveState();
      renderUI();
      waLog('popup', 'audio removed');
      await refreshLogCount();
    } catch (err) {
      waLog('popup', 'audio remove failed', { error: err.message });
      showToast('Nao foi possivel remover o audio.', 'error');
      console.error('[WA-Notify] Erro ao remover audio:', err);
    }
  });

  // Botão testar som
  $('btnTest').addEventListener('click', () => {
    if (!state.hasAudio) return;
    waLog('popup', 'test audio clicked', {
      volume: state.volume,
      durationSeconds: state.durationSeconds,
    });
    playAudio(state.volume, state.durationSeconds);
  });

  // Botão pausar som em execução
  $('btnPause').addEventListener('click', () => {
    waLog('popup', 'pause audio clicked');
    stopAudio();
  });

  // Slider de volume
  $('volumeSlider').addEventListener('input', e => {
    const pct = parseInt(e.target.value, 10);
    state.volume = pct / 100;
    $('volumeDisplay').textContent = pct + '%';
  });

  // Salva volume quando o usuário solta o slider
  $('volumeSlider').addEventListener('change', async () => {
    try {
      await saveState();
      waLog('popup', 'volume saved', { volume: state.volume });
    } catch (err) {
      waLog('popup', 'volume save failed', { error: err.message });
      showToast('Nao foi possivel salvar o volume.', 'error');
      console.error('[WA-Notify] Erro ao salvar volume:', err);
    }
  });

  $('durationInput').addEventListener('input', e => {
    state.durationSeconds = normalizeDuration(e.target.value);
    $('durationDisplay').textContent = state.durationSeconds + 's';
    $('durationInfo').textContent = state.durationSeconds + ' segundos';
  });

  $('durationInput').addEventListener('change', async e => {
    state.durationSeconds = normalizeDuration(e.target.value);
    e.target.value = state.durationSeconds;
    renderDuration();

    try {
      await saveState();
      waLog('popup', 'duration saved', { durationSeconds: state.durationSeconds });
    } catch (err) {
      waLog('popup', 'duration save failed', { error: err.message });
      showToast('Nao foi possivel salvar a duracao.', 'error');
      console.error('[WA-Notify] Erro ao salvar duracao:', err);
    }
  });

  $('btnExportLogs').addEventListener('click', async () => {
    try {
      waLog('popup', 'export logs clicked');
      await exportLogs();
      await refreshLogCount();
    } catch (err) {
      waLog('popup', 'export logs failed', { error: err.message });
      showToast('Nao foi possivel exportar logs.', 'error');
    }
  });

  $('btnClearLogs').addEventListener('click', async () => {
    try {
      await waClearLogs();
      waLog('popup', 'logs cleared');
      await refreshLogCount();
      showToast('Logs limpos.');
    } catch (err) {
      waLog('popup', 'clear logs failed', { error: err.message });
      showToast('Nao foi possivel limpar logs.', 'error');
    }
  });
}

function isAudioFile(file) {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
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

async function saveAudioFile(file) {
  waLog('popup', 'indexeddb save start', {
    name: file.name,
    size: file.size,
    type: file.type || inferAudioType(file.name),
  });

  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE);

    store.put({
      blob: file,
      name: file.name,
      type: file.type || inferAudioType(file.name),
      updatedAt: Date.now(),
    }, AUDIO_KEY);

    transaction.oncomplete = () => {
      db.close();
      waLog('popup', 'indexeddb save complete', { name: file.name, size: file.size });
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      waLog('popup', 'indexeddb save error', { error: transaction.error?.message || 'unknown' });
      reject(transaction.error || new Error('Falha ao salvar audio'));
    };
  });
}

async function deleteAudioFile() {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');
    transaction.objectStore(AUDIO_STORE).delete(AUDIO_KEY);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Falha ao remover audio'));
    };
  });
}

function inferAudioType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  const types = {
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };

  return types[ext] || 'audio/mpeg';
}

function playAudio(volume = 1, durationSeconds = 10) {
  chrome.runtime.sendMessage({
    type: 'PLAY_STORED_SOUND',
    payload: {
      volume: normalizeVolume(volume),
      durationSeconds: normalizeDuration(durationSeconds),
    },
  }, response => {
    if (chrome.runtime.lastError) {
      waLog('popup', 'play message failed', { error: chrome.runtime.lastError.message });
      showToast('Nao foi possivel tocar o audio.', 'error');
      console.warn('[WA-Notify] Background indisponivel:', chrome.runtime.lastError.message);
      return;
    }

    if (response && response.ok === false) {
      waLog('popup', 'play response failed', { error: response.error });
      showToast('Nao foi possivel tocar o audio.', 'error');
      console.warn('[WA-Notify] Audio nao foi reproduzido:', response.error);
      return;
    }

    waLog('popup', 'play response ok');
  });
}

function stopAudio() {
  chrome.runtime.sendMessage({ type: 'STOP_SOUND' }, response => {
    if (chrome.runtime.lastError) {
      waLog('popup', 'stop message failed', { error: chrome.runtime.lastError.message });
      showToast('Nao foi possivel pausar o audio.', 'error');
      console.warn('[WA-Notify] Background indisponivel:', chrome.runtime.lastError.message);
      return;
    }

    if (response && response.ok === false) {
      waLog('popup', 'stop response failed', { error: response.error });
      showToast('Nao foi possivel pausar o audio.', 'error');
      console.warn('[WA-Notify] Audio nao foi pausado:', response.error);
      return;
    }

    waLog('popup', 'stop response ok');
  });
}

async function exportLogs() {
  const logs = await waExportLogs();
  const payload = {
    exportedAt: new Date().toISOString(),
    extension: 'WhatsApp Sound Notify',
    logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `whatsapp-sound-notify-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('Logs exportados.');
}

async function refreshLogCount() {
  const logs = await waExportLogs();
  const countEl = $('logCount');
  if (countEl) countEl.textContent = String(logs.length);
}

function renderDuration() {
  $('durationInput').value = state.durationSeconds;
  $('durationDisplay').textContent = state.durationSeconds + 's';
  $('durationInfo').textContent = state.durationSeconds + ' segundos';
}

function normalizeVolume(volume) {
  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) return 0.8;
  return Math.max(0, Math.min(1, numericVolume));
}

function normalizeDuration(durationSeconds) {
  const numericDuration = Number(durationSeconds);
  if (!Number.isFinite(numericDuration)) return 10;
  return Math.max(1, Math.min(120, Math.round(numericDuration)));
}

// ── Toast de feedback ────────────────────────────────────────
function showToast(message, type = 'success') {
  // Remove toast anterior se existir
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;

  // Estilos inline para o toast (não requer classe extra no CSS)
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '36px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   type === 'error' ? '#ff4d4f' : '#25d366',
    color:        '#fff',
    padding:      '6px 14px',
    borderRadius: '20px',
    fontSize:     '12px',
    fontWeight:   '600',
    whiteSpace:   'nowrap',
    zIndex:       '9999',
    boxShadow:    '0 2px 10px rgba(0,0,0,.4)',
    animation:    'fadeIn .15s ease',
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}
