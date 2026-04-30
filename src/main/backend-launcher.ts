import { spawn, ChildProcess } from "node:child_process";
import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import log from "electron-log";

const PORT_FILE_POLL_MS = 100;
const HEALTH_POLL_MS = 500;
const STARTUP_TIMEOUT_MS = 30_000;

let backend: ChildProcess | null = null;
let backendPort: number | null = null;
let restartCount = 0;
let lastRestartTime = 0;

function portFilePath(): string {
  return path.join(app.getPath("userData"), "backend.port");
}

function resolveDevBinary(): string {
  return path.join(
    app.getAppPath(),
    ".venv",
    "bin",
    process.platform === "win32" ? "python.exe" : "python"
  );
}

function backendSourceDir(): string {
  return path.join(process.resourcesPath, "backend");
}

function backendWorkDir(): string {
  return path.join(app.getPath("userData"), "backend");
}

function isAppImage(): boolean {
  return !!process.env.APPIMAGE;
}

/** Copy the bundled backend to a writable directory so we can execute it.
 *  AppImage FUSE mounts don't support execve(), so we must copy out first. */
async function ensureBackendExtracted(): Promise<string> {
  const srcDir = backendSourceDir();
  const workDir = backendWorkDir();
  const binaryName =
    process.platform === "win32" ? "wildlife_backend.exe" : "wildlife_backend";
  const workBinary = path.join(workDir, binaryName);

  log.info(`Backend source: ${srcDir}`);
  log.info(`Backend work dir: ${workDir}`);
  log.info(`Is AppImage: ${isAppImage()}`);

  // Always re-extract for AppImage (source may have changed between versions)
  if (isAppImage()) {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      log.info("Removed previous backend extract");
    } catch {
      // first run, nothing to remove
    }
  } else {
    // For .deb etc., skip copy if already present
    try {
      await fs.access(workBinary);
      log.info(`Backend already extracted at ${workBinary}`);
      return workBinary;
    } catch {
      // not yet copied
    }
  }

  log.info(`Extracting backend from ${srcDir} to ${workDir}...`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    await copyDir(srcDir, workDir);
  } catch (err) {
    log.error(`Failed to copy backend: ${err}`);
    throw err;
  }

  // Ensure executable on Unix
  if (process.platform !== "win32") {
    await fs.chmod(workBinary, 0o755);
    log.info(`chmod +x ${workBinary}`);
  }

  // Verify the binary exists and is executable
  await fs.access(workBinary);
  log.info(`Backend extracted successfully: ${workBinary}`);

  return workBinary;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function resolveBackendArgs(): string[] {
  const portFile = portFilePath();
  if (app.isPackaged) {
    return ["--port-file", portFile];
  }
  return [
    path.join(app.getAppPath(), "src", "backend", "main.py"),
    "--port-file",
    portFile,
  ];
}

async function waitForPortFile(timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await fs.readFile(portFilePath(), "utf8");
      const port = parseInt(content.trim(), 10);
      if (!isNaN(port) && port > 0) return port;
    } catch {
      // not yet written
    }
    await sleep(PORT_FILE_POLL_MS);
  }
  throw new Error(`Backend port file never appeared after ${timeoutMs}ms`);
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`Backend health check timed out after ${timeoutMs}ms`);
}

function handleBackendExit(code: number | null, signal: string | null): void {
  log.warn(`Backend exited (code=${code}, signal=${signal})`);
  const now = Date.now();
  if (now - lastRestartTime > 60_000) restartCount = 0;
  restartCount++;
  lastRestartTime = now;

  if (restartCount <= 1) {
    log.info("Attempting backend restart...");
    startBackend().catch((err) => log.error("Backend restart failed", err));
  } else {
    log.error("Backend crashed twice within 60s — giving up");
  }
}

export async function startBackend(): Promise<number> {
  await fs.rm(portFilePath(), { force: true });

  let binary: string;
  if (!app.isPackaged) {
    binary = resolveDevBinary();
  } else {
    binary = await ensureBackendExtracted();
  }

  const args = resolveBackendArgs();
  const modelDir = path.join(app.getPath("userData"), "models");
  log.info(`Spawning backend: ${binary} ${args.join(" ")}`);
  log.info(`Model directory: ${modelDir}`);

  backend = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env, WILDLIFE_MODEL_DIR: modelDir },
  });

  backend.on("error", (err) => {
    log.error(`Backend spawn error: ${err.message}`);
  });

  backend.stdout?.on("data", (b: Buffer) =>
    log.info(`[backend] ${b.toString().trimEnd()}`)
  );
  backend.stderr?.on("data", (b: Buffer) =>
    log.warn(`[backend] ${b.toString().trimEnd()}`)
  );
  backend.on("exit", handleBackendExit);

  backendPort = await waitForPortFile(STARTUP_TIMEOUT_MS);
  await waitForHealth(backendPort, STARTUP_TIMEOUT_MS);

  log.info(`Backend ready on port ${backendPort}`);
  return backendPort;
}

export function stopBackend(): void {
  if (backend) {
    backend.removeAllListeners("exit");
    backend.kill("SIGTERM");
    backend = null;
  }
  backendPort = null;
}

export function getBackendUrl(): string {
  if (!backendPort) throw new Error("Backend not started");
  return `http://127.0.0.1:${backendPort}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
