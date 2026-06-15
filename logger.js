// ============================================================
// WhatsApp Sound Notify - logger.js
// Guarda logs leves no chrome.storage.local para depuracao.
// ============================================================

'use strict';

const WA_NOTIFY_LOG_KEY = 'waNotifyLogs';
const WA_NOTIFY_LOG_LIMIT = 500;

function waLog(source, message, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    source,
    message,
    data: sanitizeLogData(data),
  };

  console.log('[WA-Notify]', source, message, entry.data);

  if (!chrome?.storage?.local) return;

  chrome.storage.local.get([WA_NOTIFY_LOG_KEY], result => {
    if (chrome.runtime.lastError) {
      console.warn('[WA-Notify] logger storage read failed:', chrome.runtime.lastError.message);
      return;
    }

    const logs = Array.isArray(result[WA_NOTIFY_LOG_KEY]) ? result[WA_NOTIFY_LOG_KEY] : [];
    logs.push(entry);

    const trimmedLogs = logs.slice(-WA_NOTIFY_LOG_LIMIT);
    chrome.storage.local.set({ [WA_NOTIFY_LOG_KEY]: trimmedLogs }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[WA-Notify] logger storage write failed:', chrome.runtime.lastError.message);
      }
    });
  });
}

function waExportLogs() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([WA_NOTIFY_LOG_KEY], result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(Array.isArray(result[WA_NOTIFY_LOG_KEY]) ? result[WA_NOTIFY_LOG_KEY] : []);
    });
  });
}

function waClearLogs() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [WA_NOTIFY_LOG_KEY]: [] }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function sanitizeLogData(data) {
  const safeData = {};

  for (const [key, value] of Object.entries(data || {})) {
    if (/audio|blob|dataurl|base64/i.test(key)) {
      safeData[key] = '[omitted]';
      continue;
    }

    if (value instanceof Error) {
      safeData[key] = value.message;
      continue;
    }

    if (typeof value === 'string' && value.length > 300) {
      safeData[key] = value.slice(0, 300) + '...';
      continue;
    }

    safeData[key] = value;
  }

  return safeData;
}
