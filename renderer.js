// DOM Elements
const elements = {
  urlInput: document.getElementById("url"),
  formatSelect: document.getElementById("format"),
  qualitySelect: document.getElementById("quality"),
  bitrateSelect: document.getElementById("bitrate"),
  subtitlesCheckbox: document.getElementById("subtitles"),
  playlistCheckbox: document.getElementById("playlist"),
  notificationsCheckbox: document.getElementById("notifications"),
  downloadBtn: document.getElementById("download"),
  cancelBtn: document.getElementById("cancel"),
  clearLogBtn: document.getElementById("clear-log"),
  copyLogBtn: document.getElementById("copy-log"),
  openFolderBtn: document.getElementById("open-folder"),
  pasteBtn: document.getElementById("paste-btn"),
  logBox: document.getElementById("log"),
  progressFill: document.getElementById("progress-fill"),
  progressText: document.getElementById("progress-text"),
  statusText: document.getElementById("status"),
  versionText: document.getElementById("version"),
  logCount: document.getElementById("log-count"),
  formatButtons: document.querySelectorAll(".format-btn"),
};

// State
let isDownloading = false;
let logLines = 0;

// Initialize
document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  // Load version info
  try {
    const version = await window.api.getVersion();
    elements.versionText.textContent = `yt-dlp ${
      version.version || "Not found"
    }`;
  } catch (error) {
    elements.versionText.textContent = "Version check failed";
  }

  // Setup event listeners
  setupEventListeners();
  setupDragAndDrop();
  updateLogCount();
}

function setupEventListeners() {
  // Download button
  elements.downloadBtn.addEventListener("click", startDownload);

  // Cancel button
  elements.cancelBtn.addEventListener("click", cancelDownload);

  // Clear log button
  elements.clearLogBtn.addEventListener("click", () => {
    elements.logBox.textContent = "[System] Log cleared";
    logLines = 0;
    updateLogCount();
  });

  // Copy log button
  elements.copyLogBtn.addEventListener("click", () => {
    navigator.clipboard
      .writeText(elements.logBox.textContent)
      .then(() => showToast("Log copied to clipboard!"));
  });

  // Open folder button
  elements.openFolderBtn.addEventListener("click", () => {
    window.api.openFolder(require("electron").remote.app.getPath("downloads"));
  });

  // Paste button
  elements.pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      elements.urlInput.value = text;
      elements.urlInput.focus();
      showToast("URL pasted from clipboard");
    } catch (error) {
      showToast("Failed to paste from clipboard", "error");
    }
  });

  // Format buttons
  elements.formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.formatButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      const format = button.dataset.format;
      const quality = button.dataset.quality;

      elements.formatSelect.value = format;

      if (format === "mp3") {
        elements.bitrateSelect.value = quality;
        elements.qualitySelect.value = "bestvideo+bestaudio/best";
      } else {
        elements.qualitySelect.value = `bestvideo[height<=${quality}]+bestaudio`;
      }
    });
  });

  // Format change - show/hide bitrate
  elements.formatSelect.addEventListener("change", (e) => {
    const isAudio =
      e.target.value === "mp3" ||
      e.target.value === "m4a" ||
      e.target.value === "opus" ||
      e.target.value === "flac";
    document.getElementById("bitrate").parentElement.style.display = isAudio
      ? "flex"
      : "none";
  });

  // Initialize format display
  elements.formatSelect.dispatchEvent(new Event("change"));

  // Setup IPC listeners
  window.api.onLog((text) => {
    appendLog(text);
  });

  window.api.onProgress((progress) => {
    updateProgress(progress);
  });

  window.api.onFinished(() => {
    downloadFinished();
  });

  window.api.onError((error) => {
    downloadError(error);
  });
}

function setupDragAndDrop() {
  const urlInput = elements.urlInput;

  urlInput.addEventListener("dragenter", (e) => {
    e.preventDefault();
    urlInput.style.borderColor = "var(--primary)";
    urlInput.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.1)";
  });

  urlInput.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  urlInput.addEventListener("dragleave", () => {
    urlInput.style.borderColor = "";
    urlInput.style.boxShadow = "";
  });

  urlInput.addEventListener("drop", (e) => {
    e.preventDefault();
    urlInput.style.borderColor = "";
    urlInput.style.boxShadow = "";

    const text = e.dataTransfer.getData("text");
    if (text && text.includes("http")) {
      urlInput.value = text;
      showToast("URL dropped successfully");
    }
  });
}

async function startDownload() {
  if (isDownloading) {
    showToast("A download is already in progress", "warning");
    return;
  }

  const url = elements.urlInput.value.trim();
  if (!url) {
    showToast("Please enter a URL", "error");
    elements.urlInput.focus();
    return;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    showToast("Please enter a valid URL", "error");
    return;
  }

  // Prepare download options
  const options = {
    url: url,
    format: elements.formatSelect.value,
    quality: elements.qualitySelect.value,
    bitrate: elements.bitrateSelect.value,
    subtitles: elements.subtitlesCheckbox.checked,
    playlist: elements.playlistCheckbox.checked,
    notifications: elements.notificationsCheckbox.checked,
  };

  // Reset UI
  resetProgress();
  appendLog(`[System] Starting download from: ${url}\n`);
  updateStatus("Starting download...", "warning");

  // Disable controls
  setDownloadingState(true);

  try {
    const result = await window.api.startDownload(options);

    if (result.error) {
      throw new Error(result.error);
    }

    showToast("Download completed successfully!", "success");
  } catch (error) {
    appendLog(`[Error] ${error.message}\n`);
    updateStatus("Download failed", "error");
    showToast(`Download failed: ${error.message}`, "error");
  } finally {
    setDownloadingState(false);
  }
}

async function cancelDownload() {
  const result = await window.api.cancelDownload();
  if (result.cancelled) {
    appendLog("[System] Download cancelled by user\n");
    updateStatus("Cancelled", "error");
    showToast("Download cancelled", "warning");
  }
}

function updateProgress(progress) {
  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress.toFixed(1)}%`;
  updateStatus(`Downloading: ${progress.toFixed(1)}%`, "info");
}

function resetProgress() {
  elements.progressFill.style.width = "0%";
  elements.progressText.textContent = "0%";
  updateStatus("Ready", "success");
}

function updateStatus(text, type = "info") {
  elements.statusText.textContent = text;
  elements.statusText.style.background = getStatusColor(type);
  elements.statusText.style.color =
    type === "error" ? "#fca5a5" : type === "warning" ? "#fde68a" : "#a7f3d0";
}

function getStatusColor(type) {
  switch (type) {
    case "error":
      return "rgba(239, 68, 68, 0.1)";
    case "warning":
      return "rgba(245, 158, 11, 0.1)";
    case "success":
      return "rgba(16, 185, 129, 0.1)";
    default:
      return "rgba(59, 130, 246, 0.1)";
  }
}

function appendLog(text) {
  elements.logBox.textContent += text;
  elements.logBox.scrollTop = elements.logBox.scrollHeight;
  logLines += text.split("\n").length - 1;
  updateLogCount();
}

function updateLogCount() {
  elements.logCount.textContent = `${logLines} lines`;
}

function downloadFinished() {
  updateProgress(100);
  updateStatus("Download complete", "success");
  appendLog("\n[System] Download completed successfully!\n");
}

function downloadError(error) {
  appendLog(`\n[Error] ${error}\n`);
  updateStatus("Download failed", "error");
}

function setDownloadingState(downloading) {
  isDownloading = downloading;
  elements.downloadBtn.disabled = downloading;
  elements.cancelBtn.disabled = !downloading;
  elements.urlInput.disabled = downloading;
  // Kein Loading-Overlay mehr - nur Progress Bar ist sichtbar
}

function showToast(message, type = "info") {
  // Create toast element
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
        <i class="fas fa-${
          type === "success"
            ? "check-circle"
            : type === "error"
            ? "exclamation-circle"
            : "info-circle"
        }"></i>
        <span>${message}</span>
    `;

  // Add to page
  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add("show"), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast styles
const style = document.createElement("style");
style.textContent = `
.toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 0.75rem;
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.3s ease;
    z-index: 10000;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.toast.show {
    transform: translateY(0);
    opacity: 1;
}

.toast-success {
    border-left: 4px solid var(--success);
}

.toast-error {
    border-left: 4px solid var(--danger);
}

.toast-warning {
    border-left: 4px solid var(--warning);
}

.toast i {
    font-size: 1.25rem;
}

.toast-success i { color: var(--success); }
.toast-error i { color: var(--danger); }
.toast-warning i { color: var(--warning); }
`;
document.head.appendChild(style);
