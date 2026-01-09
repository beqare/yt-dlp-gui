const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
} = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

let mainWindow;
let downloadProcess = null;
let isDownloading = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    resizable: true,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile("index.html");
  // mainWindow.webContents.openDevTools(); // For debugging
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("start-download", async (event, options) => {
  if (isDownloading) {
    return { error: "Another download is already in progress" };
  }

  const savePath = dialog.showOpenDialogSync(mainWindow, {
    title: "Select Download Directory",
    properties: ["openDirectory", "createDirectory"],
    buttonLabel: "Select Folder",
  });

  if (!savePath) return { error: "No directory selected" };

  const ytDlpPath = path.join(__dirname, "bin", "yt-dlp.exe");

  if (!fs.existsSync(ytDlpPath)) {
    return {
      error:
        "yt-dlp.exe not found in bin folder. Please download it from https://github.com/yt-dlp/yt-dlp",
    };
  }

  let args = [
    "--newline",
    "--progress",
    "-o",
    path.join(savePath[0], "%(title).100s.%(ext)s"),
    "--add-metadata",
    "--embed-thumbnail",
    "--no-warnings",
  ];

  if (options.format === "mp3") {
    args.push(
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      options.bitrate
    );
  } else if (options.format === "best") {
    args.push("-f", "bestvideo+bestaudio/best");
  } else {
    args.push("-f", options.quality);
  }

  if (options.subtitles) {
    args.push("--write-subs", "--sub-lang", "en,de", "--embed-subs");
  }

  if (options.playlist) {
    args.push("--yes-playlist");
  }

  args.push(options.url);

  isDownloading = true;

  return new Promise((resolve) => {
    downloadProcess = spawn(ytDlpPath, args);
    let errorOutput = "";

    downloadProcess.stdout.on("data", (data) => {
      const text = data.toString();
      mainWindow.webContents.send("download-log", text);

      // Extract progress percentage
      const progressMatch = text.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        mainWindow.webContents.send("download-progress", progress);
      }
    });

    downloadProcess.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      mainWindow.webContents.send("download-log", text);
    });

    downloadProcess.on("close", (code) => {
      isDownloading = false;
      downloadProcess = null;

      if (code === 0) {
        mainWindow.webContents.send("download-finished");
        if (options.notifications) {
          new Notification({
            title: "Download Complete",
            body: "Your video/audio has been downloaded successfully!",
            icon: path.join(__dirname, "assets", "success.png"),
          }).show();
        }
        resolve({ success: true });
      } else {
        mainWindow.webContents.send("download-error", errorOutput);
        resolve({
          error: `Download failed with code ${code}`,
          details: errorOutput,
        });
      }
    });

    downloadProcess.on("error", (err) => {
      isDownloading = false;
      downloadProcess = null;
      mainWindow.webContents.send("download-error", err.message);
      resolve({ error: err.message });
    });
  });
});

ipcMain.handle("cancel-download", () => {
  if (downloadProcess && isDownloading) {
    downloadProcess.kill();
    isDownloading = false;
    downloadProcess = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle("get-version", () => {
  const ytDlpPath = path.join(__dirname, "bin", "yt-dlp.exe");
  if (!fs.existsSync(ytDlpPath)) return { version: "Not found" };

  return new Promise((resolve) => {
    const process = spawn(ytDlpPath, ["--version"]);
    let version = "";

    process.stdout.on("data", (data) => {
      version += data.toString().trim();
    });

    process.on("close", () => {
      resolve({ version });
    });
  });
});

ipcMain.handle("open-folder", async (event, folderPath) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return { success: true };
  }
  return { success: false };
});
