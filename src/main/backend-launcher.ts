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

function resolveBackendBinary(): string {
  if (app.isPackaged) {
    const ext = process.platform === "win32" ? ".exe" : "";
    return path.join(process.resourcesPath, "backend", `wildlife_backend${ext}`);
  }
  // In dev, prefer the project venv if present
  const venvPy = path.join(
    app.getAppPath(),
    ".venv",
    "bin",
    process.platform === "win32" ? "python.exe" : "python"
  );
  return venvPy;
}

function resolveBackendArgs(): string[] {
  const portFile = portFilePath();
  if (app.isPackaged) {
    return ["--port-file", portFile];
  }
  return [path.join(app.getAppPath(), "src", "backend", "main.py"), "--port-file", portFile];
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

  const binary = resolveBackendBinary();
  const args = resolveBackendArgs();
  const modelDir = path.join(app.getPath("userData"), "models");
  log.info(`Spawning backend: ${binary} ${args.join(" ")}`);
  log.info(`Model directory: ${modelDir}`);

  backend = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env, WILDLIFE_MODEL_DIR: modelDir },
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
