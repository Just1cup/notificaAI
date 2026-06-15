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
  const PLAY_DEBOUNCE_MS = 800;
  const WATCHDOG_INTERVAL_MS = 30 * 1000;
  const CHAT_LIST_SELECTOR = '#pane-side';
  const UNREAD_BADGE_SELECTOR = [
    '[aria-label*="unread"]',
    '[aria-label*="não lida"]',
    '[aria-label*="não lidas"]',
    '[aria-label*="nao lida"]',
    '[aria-label*="nao lidas"]',
    'span',
    'div',
  ].join(',');

  const processedIds = new Set();

  let chatObserver = null;
  let chatListObserver = null;
  let rootObserver = null;
  let titleObserver = null;
  let watchdogTimer = null;
  let currentRoot = null;
  let currentChatList = null;
  let syncUntil = 0;
  let lastUnreadCount = 0;
  let lastChatListUnreadTotal = 0;
  let lastPlayAt = 0;
  let config = {
    enabled: true,
    volume: 0.8,
    hasAudio: false,
    durationSeconds: 10,
  };

  async function init() {
    config = await loadConfig();
    lastUnreadCount = getUnreadCountFromTitle();
    waLog('content', 'content initialized', {
      unreadCount: lastUnreadCount,
      enabled: config.enabled,
      hasAudio: config.hasAudio,
      volume: config.volume,
      durationSeconds: config.durationSeconds,
    });
    bindStorageChanges();
    watchForChatRoot();
    watchTitleUnreadCount();
    watchChatListUnreadBadges();
    observeCurrentChat();
    startWatchdog();
  }

  function loadConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get(['enabled', 'volume', 'hasAudio', 'durationSeconds'], data => {
        if (chrome.runtime.lastError) {
          waLog('content', 'failed to load config', { error: chrome.runtime.lastError.message });
          console.warn('[WA-Notify] Falha ao carregar configuracoes:', chrome.runtime.lastError.message);
          resolve(config);
          return;
        }

        resolve({
          enabled: data.enabled ?? true,
          volume: data.volume ?? 0.8,
          hasAudio: data.hasAudio ?? false,
          durationSeconds: data.durationSeconds ?? 10,
        });
      });
    });
  }

  function bindStorageChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.enabled) config.enabled = changes.enabled.newValue;
      if (changes.volume) config.volume = changes.volume.newValue;
      if (changes.hasAudio) config.hasAudio = changes.hasAudio.newValue;
      if (changes.durationSeconds) config.durationSeconds = changes.durationSeconds.newValue;
      waLog('content', 'storage changed', {
        keys: Object.keys(changes),
        enabled: config.enabled,
        hasAudio: config.hasAudio,
        volume: config.volume,
        durationSeconds: config.durationSeconds,
      });
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
    waLog('content', 'watching chat root');
  }

  function startWatchdog() {
    if (watchdogTimer) return;

    watchdogTimer = setInterval(() => {
      waLog('content', 'watchdog tick', {
        unreadCount: getUnreadCountFromTitle(),
        chatListUnreadTotal: getChatListUnreadTotal(),
        hasChatObserver: Boolean(chatObserver),
        hasChatListObserver: Boolean(chatListObserver),
        hasTitleObserver: Boolean(titleObserver),
      });

      observeCurrentChat();
      watchTitleUnreadCount();
      watchChatListUnreadBadges();
      detectUnreadChanges('watchdog');
    }, WATCHDOG_INTERVAL_MS);

    waLog('content', 'watchdog started', { intervalMs: WATCHDOG_INTERVAL_MS });
  }

  function watchTitleUnreadCount() {
    if (titleObserver) return;

    const titleElement = document.querySelector('title');
    if (!titleElement) return;

    titleObserver = new MutationObserver(() => {
      detectUnreadChanges('title');
    });

    titleObserver.observe(titleElement, {
      childList: true,
    });
    waLog('content', 'watching title unread count');
  }

  function watchChatListUnreadBadges() {
    const chatList = document.querySelector(CHAT_LIST_SELECTOR);
    if (!chatList) {
      waLog('content', 'chat list not found yet');
      return;
    }

    if (chatListObserver && chatList === currentChatList && document.contains(chatList)) return;

    if (chatListObserver) {
      chatListObserver.disconnect();
      waLog('content', 'chat list observer reattached');
    }

    currentChatList = chatList;
    lastChatListUnreadTotal = getChatListUnreadTotal();

    chatListObserver = new MutationObserver(() => {
      detectUnreadChanges('chat-list');
    });

    chatListObserver.observe(chatList, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });

    waLog('content', 'watching chat list unread badges', {
      unreadTotal: lastChatListUnreadTotal,
    });
  }

  function detectUnreadChanges(source) {
    const unreadCount = getUnreadCountFromTitle();
    const chatListUnreadTotal = getChatListUnreadTotal();
    const titleIncreased = unreadCount > lastUnreadCount;
    const chatListIncreased = chatListUnreadTotal > lastChatListUnreadTotal;

    if (titleIncreased || chatListIncreased) {
      waLog('content', 'unread count increased', {
        source,
        previousTitle: lastUnreadCount,
        currentTitle: unreadCount,
        previousChatList: lastChatListUnreadTotal,
        currentChatList: chatListUnreadTotal,
      });
      playConfiguredAudio();
    }

    lastUnreadCount = unreadCount;
    lastChatListUnreadTotal = chatListUnreadTotal;
  }

  function observeCurrentChat() {
    const root = document.querySelector(CHAT_ROOT_SELECTOR);
    if (!root || root === currentRoot) return;

    currentRoot = root;
    waLog('content', 'chat root observed', { existingMessages: root.querySelectorAll(MESSAGE_SELECTOR).length });

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
    if (options.silent) {
      waLog('content', 'incoming message ignored during history sync');
      return;
    }

    waLog('content', 'incoming message detected');
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
    if (!config.enabled || !config.hasAudio) {
      waLog('content', 'play skipped by config', {
        enabled: config.enabled,
        hasAudio: config.hasAudio,
      });
      return;
    }

    const now = Date.now();
    if (now - lastPlayAt < PLAY_DEBOUNCE_MS) {
      waLog('content', 'play skipped by debounce', { elapsedMs: now - lastPlayAt });
      return;
    }
    lastPlayAt = now;

    waLog('content', 'sending play request', {
      volume: config.volume,
      durationSeconds: config.durationSeconds,
    });

    chrome.runtime.sendMessage({
      type: 'PLAY_STORED_SOUND',
      payload: {
        volume: normalizeVolume(config.volume),
        durationSeconds: normalizeDuration(config.durationSeconds),
      },
    }, response => {
      if (chrome.runtime.lastError) {
        waLog('content', 'play request failed', { error: chrome.runtime.lastError.message });
        console.warn('[WA-Notify] Background indisponivel:', chrome.runtime.lastError.message);
        return;
      }

      if (response && response.ok === false) {
        waLog('content', 'play response failed', { error: response.error });
        console.warn('[WA-Notify] Audio nao foi reproduzido:', response.error);
        return;
      }

      waLog('content', 'play response ok');
    });
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

  function getUnreadCountFromTitle() {
    const match = document.title.match(/\((\d+)\)/);
    if (!match) return 0;

    const count = Number(match[1]);
    return Number.isFinite(count) ? count : 0;
  }

  function getChatListUnreadTotal() {
    const chatList = document.querySelector(CHAT_LIST_SELECTOR);
    if (!chatList) return 0;

    let total = 0;
    const badges = findUnreadBadges(chatList);
    for (const badge of badges) {
      total += getUnreadCountFromText(badge.getAttribute('aria-label') || badge.textContent || '');
    }

    return total;
  }

  function findUnreadBadges(chatList) {
    const badges = [];
    for (const candidate of chatList.querySelectorAll(UNREAD_BADGE_SELECTOR)) {
      if (!isUnreadBadge(candidate)) continue;
      addUnreadBadge(badges, candidate);
    }

    return badges;
  }

  function addUnreadBadge(badges, candidate) {
    for (let index = badges.length - 1; index >= 0; index -= 1) {
      const existing = badges[index];
      if (existing.contains(candidate)) {
        badges.splice(index, 1);
        continue;
      }

      if (candidate.contains(existing)) {
        return;
      }
    }

    badges.push(candidate);
  }

  function isUnreadBadge(element) {
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    if (isUnreadText(ariaLabel)) return true;

    const text = normalizeBadgeText(element.textContent || '');
    if (!/^\d{1,4}$/.test(text)) return false;
    if (!isSmallVisibleElement(element)) return false;

    return hasGreenBadgeStyle(element);
  }

  function isUnreadText(text) {
    return /unread|não lida|não lidas|nao lida|nao lidas|mensagem não lida|mensagens não lidas|mensagem nao lida|mensagens nao lidas/i.test(text);
  }

  function normalizeBadgeText(text) {
    return String(text).trim().replace(/\D/g, '');
  }

  function isSmallVisibleElement(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return rect.width <= 44 && rect.height <= 44;
  }

  function hasGreenBadgeStyle(element) {
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      const style = getComputedStyle(current);
      if (isGreenishColor(style.backgroundColor)) return true;
    }

    return false;
  }

  function isGreenishColor(color) {
    const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/i);
    if (!match) return false;

    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    const alpha = match[4] === undefined ? 1 : Number(match[4]);

    return alpha > 0.25 && green >= 120 && green > red * 1.2 && green > blue * 1.2;
  }

  function getUnreadCountFromText(text) {
    const match = String(text).replace(/\./g, '').match(/\d+/);
    if (!match) return 1;

    const count = Number(match[0]);
    return Number.isFinite(count) ? count : 1;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
