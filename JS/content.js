// 监控当前页面的 HTTP 状态并按用户选项自动刷新（在控制台输出每次运行结果）
window.addEventListener("load", () => {
  // 从 storage 读取要监控的状态码和刷新间隔
  chrome.storage.sync.get(
    { statuses: [404, 502], intervalSeconds: 5 },
    (items) => {
      const statuses = (items.statuses || [404, 502]).map((s) => Number(s));
      const intervalSeconds = clampNumber(
        Number(items.intervalSeconds) || 5,
        1,
        1000
      );

      // 合并 title 与 body 文本以便检测
      const titleText = (document.title || "").toString();
      const bodyText =
        document.body && document.body.innerText ? document.body.innerText : "";
      const combined = (titleText + "\n" + bodyText).toLowerCase();

      // 更稳健的检测：使用词边界匹配数字（避免匹配 1502 等）并且检测常见短语
      const COMMON_PHRASES = [
        "bad gateway",
        "bad gateway",
        "502 bad gateway",
        "502 错误",
        "502 错误",
        "502错误",
      ];
      let detectedCode = null;
      for (const code of statuses) {
        if (!Number.isFinite(code)) continue;
        const codeNum = Number(code);
        const numPattern = new RegExp("\\b" + String(codeNum) + "\\b", "i");
        if (numPattern.test(combined)) {
          detectedCode = codeNum;
          break;
        }
        // 检查常见文本短语
        for (const p of COMMON_PHRASES) {
          if (
            combined.indexOf(p.toLowerCase()) !== -1 &&
            String(p).indexOf(String(codeNum)) !== -1
          ) {
            detectedCode = codeNum;
            break;
          }
        }
        if (detectedCode !== null) break;
      }

      if (detectedCode !== null) {
        // 检测到目标状态，延迟后刷新页面
        setTimeout(() => {
          location.reload();
        }, intervalSeconds * 1000);
      } else {
        // 未检测到监控的错误码，网站正常，不需要刷新
      }
    }
  );
});

function clampNumber(n, min, max) {
  if (Number.isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
