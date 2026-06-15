// ============================================================
// WhatsApp Sound Notify - content.js
// Detecta novas mensagens recebidas no WhatsApp Web e toca o
// audio configurado pelo usuario.
//
// Privacidade: o conteudo das mensagens nao e lido, copiado,
// armazenado nem enviado. O script usa apenas atributos e classes
// do DOM para diferenciar mensagens recebidas de enviadas.
// ============================================================

'use strict';

(function () {
  const CHAT_ROOT_SELECTOR = '#main';
  const MESSAGE_SELECTOR = 'div[data-id]';
  const SENT_PREFIX = 'true_';
  const RECEIVED_PREFIX = 'false_';
  const PROCESSED_LIMIT = 300;
  const PROCESSED_TRIM_COUNT = 80;
  const CHAT_SYNC_MS = 1500;
  const HISTORY_BURST_THRESHOLD = 3;

  const processedIds = new Set();

  let chatObserver = null;
  let rootObserver = null;
  let currentRoot = null;
  let syncUntil = 0;
  let config = {
    enabled: true,
    volume: 0.8,
    audioDataUrl: null,
  };

  async function init() {
    config = await loadConfig();
    bindStorageChanges();
    watchForChatRoot();
    observeCurrentChat();
  }

  function loadConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get(['enabled', 'volume', 'audioDataUrl'], data => {
        if (chrome.runtime.lastError) {
          console.warn('[WA-Notify] Falha ao carregar configuracoes:', chrome.runtime.lastError.message);
          resolve(config);
          return;
        }

        resolve({
          enabled: data.enabled ?? true,
          volume: data.volume ?? 0.8,
          audioDataUrl: data.audioDataUrl ?? null,
        });
      });
    });
  }

  function bindStorageChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.enabled) config.enabled = changes.enabled.newValue;
      if (changes.volume) config.volume = changes.volume.newValue;
      if (changes.audioDataUrl) config.audioDataUrl = changes.audioDataUrl.newValue;
    });
  }

  function watchForChatRoot() {
    if (rootObserver) return;

    rootObserver = new MutationObserver(() => {
      observeCurrentChat();
    });

    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function observeCurrentChat() {
    const root = document.querySelector(CHAT_ROOT_SELECTOR);
    if (!root || root === currentRoot) return;

    currentRoot = root;

    if (chatObserver) {
      chatObserver.disconnect();
    }

    seedExistingMessages(root);

    chatObserver = new MutationObserver(mutations => {
      const candidates = new Set();

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;

        if (mutation.removedNodes.length > 0) {
          syncUntil = Date.now() + CHAT_SYNC_MS;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          collectMessageCandidates(node, candidates);
        }
      }

      handleMessageBatch(candidates);
    });

    chatObserver.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  function seedExistingMessages(root) {
    for (const message of root.querySelectorAll(MESSAGE_SELECTOR)) {
      const id = getMessageId(message);
      if (id) processedIds.add(id);
    }

    trimProcessedIds();
  }

  function collectMessageCandidates(node, candidates) {
    if (node.matches?.(MESSAGE_SELECTOR)) {
      candidates.add(node);
    }

    const parentMessage = node.closest?.(MESSAGE_SELECTOR);
    if (parentMessage) {
      candidates.add(parentMessage);
    }

    if (node.querySelectorAll) {
      for (const child of node.querySelectorAll(MESSAGE_SELECTOR)) {
        candidates.add(child);
      }
    }
  }

  function handleMessageBatch(candidates) {
    const incomingCandidates = [];

    for (const candidate of candidates) {
      const id = getMessageId(candidate);
      if (!id) continue;
      if (!isIncomingMessage(candidate, id)) continue;
      if (processedIds.has(id)) continue;
      incomingCandidates.push({ id, el: candidate });
    }

    const isHistorySync = Date.now() < syncUntil || incomingCandidates.length >= HISTORY_BURST_THRESHOLD;
    for (const candidate of incomingCandidates) {
      handlePotentialMessage(candidate.el, { silent: isHistorySync });
    }
  }

  function handlePotentialMessage(messageEl, options = {}) {
    const id = getMessageId(messageEl);
    if (!id) return;
    if (!isIncomingMessage(messageEl, id)) return;
    if (processedIds.has(id)) return;

    processedIds.add(id);
    trimProcessedIds();
    if (options.silent) return;

    playConfiguredAudio();
  }

  function getMessageId(messageEl) {
    return messageEl.getAttribute('data-id') || '';
  }

  function isIncomingMessage(messageEl, id) {
    if (id.startsWith(SENT_PREFIX)) return false;
    if (messageEl.closest('.message-out')) return false;

    if (id.startsWith(RECEIVED_PREFIX)) return true;
    if (messageEl.closest('.message-in')) return true;

    return false;
  }

  function trimProcessedIds() {
    if (processedIds.size <= PROCESSED_LIMIT) return;

    const idsToRemove = Array.from(processedIds).slice(0, PROCESSED_TRIM_COUNT);
    for (const id of idsToRemove) {
      processedIds.delete(id);
    }
  }

  function playConfiguredAudio() {
    if (!config.enabled || !config.audioDataUrl) return;

    try {
      const audio = new Audio(config.audioDataUrl);
      audio.volume = normalizeVolume(config.volume);

      audio.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.warn('[WA-Notify] Falha ao reproduzir audio:', err.message);
        }
      });
    } catch (err) {
      console.error('[WA-Notify] Erro ao preparar audio:', err);
    }
  }

  function normalizeVolume(volume) {
    const numericVolume = Number(volume);
    if (!Number.isFinite(numericVolume)) return 0.8;
    return Math.max(0, Math.min(1, numericVolume));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
