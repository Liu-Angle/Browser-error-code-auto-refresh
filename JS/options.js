// 使用拖放的方式管理状态码列表
// 常见与标准的 HTTP 状态码（1xx/2xx/3xx/4xx/5xx）
const COMMON_STATUSES = [
  // 1xx 信息性响应
  100, 101, 102, 103,
  // 2xx 成功
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  // 3xx 重定向
  300, 301, 302, 303, 304, 305, 306, 307, 308,
  // 4xx 客户端错误
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
  415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
  // 5xx 服务器错误
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
];

function createChip(code) {
  const el = document.createElement("div");
  el.className = "chip";
  el.draggable = true;
  el.textContent = String(code);
  el.dataset.code = String(code);

  el.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", el.dataset.code);
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  return el;
}

function setupDropzones() {
  const dropzones = document.querySelectorAll(".dropzone");
  dropzones.forEach((dz) => {
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("over");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("over");
      const code = e.dataTransfer.getData("text/plain");
      if (!code) return;

      // 如果目标已经包含该 code，什么都不做
      if (
        Array.from(dz.children).some(
          (c) => c.dataset && c.dataset.code === code
        )
      )
        return;

      // 尝试找到已经存在的 chip（在文档中），如果找到则移动它；否则新建一个
      const existing = document.querySelector(`.chip[data-code="${code}"]`);
      if (existing) {
        // 从原容器移除再添加到目标容器
        const oldParent = existing.parentElement;
        if (oldParent) oldParent.removeChild(existing);
        dz.appendChild(existing);
      } else {
        dz.appendChild(createChip(code));
      }
    });
  });
}

function saveOptions() {
  const monitor = Array.from(
    document.getElementById("monitor-list").children
  ).map((c) => Number(c.dataset.code));
  const intervalEl = document.getElementById("interval-seconds");
  const raw = intervalEl ? Number(intervalEl.value) : 5;
  const intervalSeconds = clampNumber(raw, 1, 1000);
  // reflect clamped value back to input
  if (intervalEl) intervalEl.value = intervalSeconds;
  chrome.storage.sync.set({ statuses: monitor, intervalSeconds }, () => {
    const s = document.getElementById("status");
    s.textContent = "已保存";
    setTimeout(() => (s.textContent = ""), 1500);
  });
}

function populateUI(items) {
  const monitor = (items.statuses || []).map((s) => Number(s));
  const availEl = document.getElementById("available-list");
  const monEl = document.getElementById("monitor-list");
  availEl.innerHTML = "";
  monEl.innerHTML = "";

  // put common statuses into available by default, except those already in monitor
  const used = new Set(monitor.map((n) => Number(n)));
  COMMON_STATUSES.forEach((code) => {
    if (used.has(code)) return;
    availEl.appendChild(createChip(code));
  });

  // any monitor statuses that are not in COMMON_STATUSES also show up in monitor list
  monitor.forEach((code) => {
    monEl.appendChild(createChip(code));
  });

  document.getElementById("interval-seconds").value = clampNumber(
    Number(items.intervalSeconds) || 5,
    1,
    1000
  );
}

document.addEventListener("DOMContentLoaded", () => {
  setupDropzones();
  document.getElementById("save").addEventListener("click", saveOptions);
  // 恢复默认：将 404 和 502 放入监控，其它状态码放入可用，刷新间隔设置为 5 并保存
  const resetBtn = document.getElementById("reset-default");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const monitorEl = document.getElementById("monitor-list");
      const availEl = document.getElementById("available-list");
      if (!monitorEl || !availEl) return;
      // 清空两侧
      monitorEl.innerHTML = "";
      availEl.innerHTML = "";
      // 默认监控码
      const defaults = [404, 502];
      // 先把所有 COMMON_STATUSES 中不在 defaults 的加入 available
      COMMON_STATUSES.forEach((code) => {
        if (defaults.indexOf(code) === -1) {
          availEl.appendChild(createChip(code));
        }
      });
      // 把 defaults 加入 monitor（顺序保证）
      defaults.forEach((c) => monitorEl.appendChild(createChip(c)));
      // 设置刷新间隔为 5 并保存
      const intervalEl = document.getElementById("interval-seconds");
      if (intervalEl) intervalEl.value = 5;
      // 自动保存
      try {
        saveOptions();
      } catch (e) {
        // ignore
      }
    });
  }

  // Clamp input while typing / on change
  const intervalInput = document.getElementById("interval-seconds");
  intervalInput.addEventListener("input", () => {
    const raw = Number(intervalInput.value);
    if (Number.isNaN(raw)) return;
    if (raw > 1000) intervalInput.value = 1000;
    if (raw < 1 && raw !== 0) intervalInput.value = 1; // allow empty/zero while editing
  });

  intervalInput.addEventListener("change", () => {
    const clamped = clampNumber(Number(intervalInput.value) || 5, 1, 1000);
    intervalInput.value = clamped;
  });

  // 打开状态码说明窗口（在新窗口中显示表格）
  const helpBtn = document.getElementById("help-codes");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      // 状态码中文说明映射
      const DESC = {
        100: "继续",
        101: "切换协议",
        102: "处理中 (WebDAV)",
        103: "早期提示",
        200: "请求成功",
        201: "已创建",
        202: "已接受",
        203: "非权威信息",
        204: "无内容",
        205: "重置内容",
        206: "部分内容",
        207: "多状态 (WebDAV)",
        208: "已报告 (WebDAV)",
        226: "IM 已使用",
        300: "多种选择",
        301: "永久移动",
        302: "临时移动/已找到",
        303: "另见",
        304: "未修改",
        305: "使用代理 (已废弃)",
        306: "未使用的状态码",
        307: "临时重定向",
        308: "永久重定向",
        400: "错误请求",
        401: "未授权",
        402: "付款要求",
        403: "禁止访问",
        404: "未找到",
        405: "方法不被允许",
        406: "不可接受",
        407: "需要代理认证",
        408: "请求超时",
        409: "冲突",
        410: "已删除",
        411: "需要内容长度",
        412: "前提条件失败",
        413: "实体太大",
        414: "URI 过长",
        415: "不支持的媒体类型",
        416: "所请求的范围无法满足",
        417: "预期失败",
        418: "我是茶壶 (趣味)",
        421: "错误导向的请求",
        422: "无法处理的实体",
        423: "已锁定",
        424: "依赖失败",
        425: "过早请求",
        426: "需要升级",
        428: "需要先决条件",
        429: "请求过多",
        431: "请求头字段过大",
        451: "因法律原因不可用",
        500: "服务器内部错误",
        501: "未实现",
        502: "错误网关",
        503: "服务不可用",
        504: "网关超时",
        505: "HTTP 版本不受支持",
        506: "变体也协商",
        507: "存储不足",
        508: "检测到循环",
        510: "未扩展",
        511: "需要网络认证",
      };

      // 以 COMMON_STATUSES 的顺序生成表格行
      const rows = COMMON_STATUSES.map((code) => {
        const desc = DESC[code] || "";
        return `<tr><td class="code">${code}</td><td class="desc">${desc}</td></tr>`;
      }).join("");

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>HTTP 状态码说明</title><style>
        body{font-family:Arial,Helvetica,sans-serif;padding:12px;color:#222}
        table{border-collapse:collapse;width:100%}
        td.code{width:80px;font-weight:600;border:1px solid #ddd;padding:6px}
        td.desc{border:1px solid #ddd;padding:6px}
        thead td{background:#f5f5f5;font-weight:700}
        .search-wrap{margin:8px 0}
        input#search-code{padding:6px;border:1px solid #ccc;border-radius:4px;width:160px}
        </style></head><body>
        <h2>HTTP 状态码说明</h2>
        <div class="search-wrap">
          <label>搜索状态码: <input id="search-code" type="text" placeholder="例如 502" /></label>
          <button id="do-search" style="margin-left:8px;padding:6px 8px;border:1px solid #1e90ff;background:#1e90ff;color:#fff;border-radius:4px;cursor:pointer">查询</button>
          <button id="clear-search" style="margin-left:8px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;cursor:pointer">清除</button>
        </div>
        <table>
          <thead><tr><td>状态码</td><td>说明</td></tr></thead>
          <tbody id="codes-body">${rows}</tbody>
        </table>
        </body></html>`;

      try {
        const w = window.open(
          "",
          "_blank",
          "width=640,height=640,resizable=yes"
        );
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
          // 在弹出窗口加载完成后，由父窗口向其注入交互逻辑以确保事件绑定可靠
          try {
            w.addEventListener("load", () => {
              try {
                const input = w.document.getElementById("search-code");
                const tbody = w.document.getElementById("codes-body");
                function filter() {
                  const q = (input.value || "").trim();
                  const rows = Array.from(tbody.querySelectorAll("tr"));
                  // 不含查询则显示全部
                  if (!q) {
                    rows.forEach((r) => (r.style.display = ""));
                    const no = w.document.getElementById("no-result");
                    if (no) no.style.display = "none";
                    return;
                  }
                  rows.forEach((r) => {
                    const codeEl = r.querySelector(".code");
                    const codeText = codeEl ? codeEl.textContent : "";
                    if (codeText.indexOf(q) !== -1) r.style.display = "";
                    else r.style.display = "none";
                  });
                  // 显示未找到提示
                  const visible = Array.from(tbody.querySelectorAll("tr")).some(
                    (r) => r.style.display !== "none"
                  );
                  let no = w.document.getElementById("no-result");
                  if (!visible) {
                    if (!no) {
                      no = w.document.createElement("tr");
                      no.id = "no-result";
                      const td = w.document.createElement("td");
                      td.setAttribute("colspan", "2");
                      td.textContent = "未找到对应的状态码";
                      td.style.padding = "8px";
                      no.appendChild(td);
                      tbody.appendChild(no);
                    }
                    no.style.display = "";
                  } else {
                    if (no) no.style.display = "none";
                  }
                }
                // 限制输入仅允许数字（非数字自动移除）
                input.addEventListener("input", () => {
                  const cleaned = (input.value || "").replace(/\D+/g, "");
                  if (input.value !== cleaned) input.value = cleaned;
                });
                const doBtn = w.document.getElementById("do-search");
                if (doBtn) doBtn.addEventListener("click", filter);
                const clearBtn = w.document.getElementById("clear-search");
                if (clearBtn)
                  clearBtn.addEventListener("click", () => {
                    input.value = "";
                    filter();
                    input.focus();
                  });
              } catch (e) {
                // binding failed
              }
            });
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // fallback: 在新标签页显示简单文本
        try {
          window.open(
            "https://www.runoob.com/http/http-status-codes.html",
            "_blank"
          );
        } catch (e) {}
      }
    });
  }

  // 全部移出：将所有持续刷新的状态码移动到可用状态码
  const moveAllOutBtn = document.getElementById("move-all-out");
  if (moveAllOutBtn) {
    moveAllOutBtn.addEventListener("click", () => {
      const monitorEl = document.getElementById("monitor-list");
      const availEl = document.getElementById("available-list");
      if (!monitorEl || !availEl) return;
      const availCodes = new Set(
        Array.from(availEl.children).map((c) => c.dataset.code)
      );
      const chips = Array.from(monitorEl.children);
      chips.forEach((chip) => {
        const code = chip.dataset.code;
        if (!availCodes.has(code)) {
          availEl.appendChild(chip);
          availCodes.add(code);
        } else {
          chip.remove();
        }
      });
      // 移动后自动保存设置
      try {
        saveOptions();
      } catch (e) {
        // ignore
      }
    });
  }

  // 全部移入：将所有可用状态码移动到持续刷新的状态码
  const moveAllInBtn = document.getElementById("move-all-in");
  if (moveAllInBtn) {
    moveAllInBtn.addEventListener("click", () => {
      const monitorEl = document.getElementById("monitor-list");
      const availEl = document.getElementById("available-list");
      if (!monitorEl || !availEl) return;
      const monitorCodes = new Set(
        Array.from(monitorEl.children).map((c) => c.dataset.code)
      );
      const chips = Array.from(availEl.children);
      chips.forEach((chip) => {
        const code = chip.dataset.code;
        if (!monitorCodes.has(code)) {
          monitorEl.appendChild(chip);
          monitorCodes.add(code);
        } else {
          chip.remove();
        }
      });
      // 移动后自动保存设置
      try {
        saveOptions();
      } catch (e) {
        // ignore
      }
    });
  }

  chrome.storage.sync.get(
    { statuses: [404, 502], intervalSeconds: 5 },
    (items) => {
      populateUI(items);
    }
  );
});

function clampNumber(n, min, max) {
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
