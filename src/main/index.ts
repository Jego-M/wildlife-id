import { app, BrowserWindow, shell, protocol } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import log from "electron-log";
import { startBackend, stopBackend, BackendStartStage } from "./backend-launcher";
import { registerIpcHandlers } from "./ipc-handlers";

log.initialize();
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "main.log");

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

const SPLASH_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; height:100%; background:#fbfaf6; color:#1f2220;
    font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;
    user-select:none; -webkit-user-select:none; cursor:default; overflow:hidden; }
  body { display:flex; align-items:center; justify-content:center; }
  .wrap { text-align:center; padding:0 24px; }
  .glyph { display:block; margin:0 auto 14px; }
  .title { font-family:"Fraunces",Georgia,"Times New Roman",serif; font-weight:500;
    font-size:26px; letter-spacing:-0.01em; color:#1f2220; }
  .title em { color:#4f6a4c; font-style:italic; font-weight:400; }
  .status { margin-top:16px; font-size:11.5px; color:#7a7f7a; letter-spacing:0.04em; min-height:14px; }
  .bar { margin:14px auto 0; width:200px; height:3px; background:#e5ede2;
    border-radius:999px; overflow:hidden; position:relative; }
  .bar i { position:absolute; top:0; left:0; width:40%; height:100%;
    background:linear-gradient(90deg,#4f6a4c,#6a8566); border-radius:999px;
    animation:slide 1.4s ease-in-out infinite; }
  @keyframes slide {
    0%   { left:-40%; } 100% { left:100%; }
  }
</style></head><body>
<div class="wrap">
  <svg class="glyph" width="40" height="40" viewBox="0 0 44 44" fill="none">
    <circle cx="22" cy="22" r="18" stroke="#4f6a4c" stroke-width="1.5" fill="none"/>
    <circle cx="22" cy="22" r="11" stroke="#4f6a4c" stroke-width="1.5" fill="#e5ede2"/>
    <circle cx="22" cy="22" r="3.5" fill="#4f6a4c"/>
  </svg>
  <div class="title">Wildlife <em>ID</em></div>
  <div class="status" id="status">Starting…</div>
  <div class="bar"><i></i></div>
</div>
</body></html>`;

const STAGE_TEXT: Record<BackendStartStage, string> = {
  extracting:     "Extracting backend…",
  starting:       "Starting backend…",
  "loading-model": "Loading model…",
  ready:          "Almost ready…",
};

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    show: true,
    backgroundColor: "#fbfaf6",
    icon: path.join(app.getAppPath(), "assets/icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  splashWindow.setMenu(null);
  splashWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML));
  splashWindow.on("closed", () => { splashWindow = null; });
}

function setSplashStatus(text: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const escaped = JSON.stringify(text);
  splashWindow.webContents
    .executeJavaScript(`(()=>{const e=document.getElementById('status');if(e)e.textContent=${escaped};})()`)
    .catch(() => { /* splash already gone */ });
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#fbfaf6",
    show: false,
    icon: path.join(app.getAppPath(), "assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    closeSplash();
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Serve images from userData/images/ via local-image:// protocol
  const imagesDir = path.join(app.getPath("userData"), "images");
  mkdirSync(imagesDir, { recursive: true });
  protocol.handle("local-image", async (request) => {
    const imageName = decodeURIComponent(request.url.replace("local-image://", ""));
    const filePath = path.join(imagesDir, path.basename(imageName));
    try {
      const data = await readFile(filePath);
      return new Response(data, { headers: { "content-type": "image/jpeg" } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  registerIpcHandlers();

  createSplash();

  try {
    await startBackend({
      onStage: (stage) => setSplashStatus(STAGE_TEXT[stage]),
    });
  } catch (err) {
    log.error("Failed to start backend on launch", err);
    setSplashStatus("Backend failed to start — opening anyway…");
    // The renderer will surface an error state via the health-check IPC call
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
});
