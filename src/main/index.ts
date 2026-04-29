import { app, BrowserWindow, shell, protocol } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import log from "electron-log";
import { startBackend, stopBackend } from "./backend-launcher";
import { registerIpcHandlers } from "./ipc-handlers";

log.initialize();
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "main.log");

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#fbfaf6",
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

  try {
    await startBackend();
  } catch (err) {
    log.error("Failed to start backend on launch", err);
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
