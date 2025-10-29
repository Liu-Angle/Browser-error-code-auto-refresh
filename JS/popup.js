document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("open-options");
  if (!btn) return;

  btn.addEventListener("click", () => {
    try {
      if (
        chrome &&
        chrome.runtime &&
        typeof chrome.runtime.openOptionsPage === "function"
      ) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open("options.html", "_blank");
      }
    } catch (e) {
      window.open("options.html", "_blank");
    }
  });
});
