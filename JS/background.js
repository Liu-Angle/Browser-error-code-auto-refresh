// 混合刷新实现：短周期 (<60s) 使用 setInterval；长周期 (>=60s) 使用 chrome.alarms
const refreshIntervals = new Map(); // tabId -> intervalId
const activeAlarmsKeyPrefix = "auto-refresh-alarm-"; // 存储在 chrome.storage.local 的键前缀

function clampNumber(n, min, max) {
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// 点击 action 时触发一次预检并可能开始自动刷新
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.url) return;
  chrome.storage.sync.get(
    { statuses: [404, 502], intervalSeconds: 5 },
    (items) => {
      const statuses = (items.statuses || [404, 502])
        .map((s) => Number(s))
        .filter(Number.isFinite);
      let intervalSeconds = Number(items.intervalSeconds);
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
        intervalSeconds = 5;
      intervalSeconds = clampNumber(intervalSeconds, 1, 60 * 60); // 上限 1 小时

      // 预检一次目标 URL 的状态，决定是否启动自动刷新
      fetch(tab.url)
        .then((response) => {
          if (statuses.includes(response.status)) {
            safeReload(tab.id);
            startAutoRefresh(tab.id, tab.url, statuses, intervalSeconds);
          }
        })
        .catch(() => {
          // 网络错误时也尝试刷新并启动自动刷新
          safeReload(tab.id);
          startAutoRefresh(tab.id, tab.url, statuses, intervalSeconds);
        });
    }
  );
});

function safeReload(tabId) {
  try {
    chrome.tabs.reload(tabId);
  } catch (e) {
    // ignore
  }
}

// 启动自动刷新（混合策略）
function startAutoRefresh(tabId, url, statuses, intervalSeconds) {
  if (!Number.isInteger(tabId)) return;

  // 如果已有短周期 interval 存在，则不用重复创建
  if (refreshIntervals.has(tabId)) return;

  if (intervalSeconds < 60) {
    // 使用 setInterval（短周期），注意：service worker 可能会被暂停，短周期在活跃期可工作
    const ms = Math.max(1000, Math.floor(intervalSeconds) * 1000);
    const id = setInterval(() => {
      fetch(url)
        .then((response) => {
          if (!statuses.includes(response.status)) {
            stopAutoRefresh(tabId);
          } else {
            safeReload(tabId);
          }
        })
        .catch(() => {
          // network errors — 忽略，继续轮询
        });
    }, ms);
    refreshIntervals.set(tabId, id);
    return;
  }

  // 长周期：使用 chrome.alarms，创建持续的 alarm
  const alarmName = `auto-refresh-${tabId}`;
  const periodInMinutes = Math.max(1 / 60, intervalSeconds / 60); // 允许小于 1 分钟的传入，但 chrome 可能会合并

  // 保存元数据以便 service worker 重启后仍能识别
  const metaKey = activeAlarmsKeyPrefix + alarmName;
  const meta = { tabId, url, statuses, intervalSeconds };
  chrome.storage.local.set({ [metaKey]: meta }, () => {
    try {
      chrome.alarms.create(alarmName, { periodInMinutes });
    } catch (e) {
      // fallback: 若创建失败，则不阻塞
    }
  });
}

// 停止某 tab 的自动刷新（包含短周期与长周期）
function stopAutoRefresh(tabId) {
  // 清理短周期 interval
  if (refreshIntervals.has(tabId)) {
    const id = refreshIntervals.get(tabId);
    try {
      clearInterval(id);
    } catch (e) {}
    refreshIntervals.delete(tabId);
  }

  // 清理对应 alarm
  const alarmName = `auto-refresh-${tabId}`;
  const metaKey = activeAlarmsKeyPrefix + alarmName;
  try {
    chrome.alarms.clear(alarmName, () => {
      // delete persisted meta
      try {
        chrome.storage.local.remove(metaKey);
      } catch (e) {}
    });
  } catch (e) {
    // ignore
  }
}

// 当标签页关闭时清理定时器与 alarm
chrome.tabs.onRemoved.addListener((tabId) => {
  stopAutoRefresh(tabId);
});

// alarm 触发时检查对应页状态并决定是否 reload 或 停止 alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  const alarmName = alarm.name;
  if (!alarmName || !alarmName.startsWith("auto-refresh-")) return;
  const metaKey = activeAlarmsKeyPrefix + alarmName;
  chrome.storage.local.get(metaKey, (items) => {
    const meta = items ? items[metaKey] : null;
    if (!meta) {
      // 没有元数据，尝试清除 alarm
      try {
        chrome.alarms.clear(alarmName);
      } catch (e) {}
      return;
    }
    const { tabId, url, statuses } = meta;
    // 执行一次 fetch 验证当前状态
    fetch(url)
      .then((response) => {
        if (!statuses || !Array.isArray(statuses)) return;
        if (!statuses.includes(response.status)) {
          stopAutoRefresh(tabId);
        } else {
          safeReload(tabId);
        }
      })
      .catch(() => {
        // 网络错误：忽略，下一次 alarm 继续触发
      });
  });
});
