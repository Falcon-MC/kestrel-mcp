import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where Kestrel keeps its settings, logs and agent.json, the same way
 * Kestrel's own platform code works it out.
 */
export function kestrelDataDirectory(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? process.cwd(), "Kestrel");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Kestrel");
  }
  const data = process.env.XDG_DATA_HOME;
  return path.join(data && data.length > 0 ? data : path.join(os.homedir(), ".local", "share"), "Kestrel");
}

const WindowsRuntimeDlls = ["libssl-3-x64.dll", "libcrypto-3-x64.dll", "zlib1.dll"];

/**
 * KESTREL_BINARY may be the .exe, a folder that contains it, or a path
 * without the .exe suffix.
 */
export function resolveKestrelBinary(binary: string): string {
  let resolved = path.resolve(binary);
  if (process.platform === "win32" && !resolved.toLowerCase().endsWith(".exe")) {
    const withExe = resolved + ".exe";
    if (fs.existsSync(withExe)) {
      resolved = withExe;
    } else if (fs.existsSync(path.join(resolved, "Kestrel.exe"))) {
      resolved = path.join(resolved, "Kestrel.exe");
    }
  } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const nested = process.platform === "win32" ? path.join(resolved, "Kestrel.exe") : path.join(resolved, "Kestrel");
    if (fs.existsSync(nested)) {
      resolved = nested;
    }
  }
  return resolved;
}

function dllSearchRoots(exeDir: string): string[] {
  const roots = [exeDir];
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  roots.push(...pathEnv.split(sep).filter((entry) => entry.length > 0));
  if (process.platform === "win32") {
    roots.push("C:\\msys64\\ucrt64\\bin", "C:\\msys64\\mingw64\\bin", "C:\\msys64\\clang64\\bin");
  }
  return roots;
}

/**
 * MinGW Kestrel loads OpenSSL and zlib from the exe folder. Copy them next
 * to Kestrel.exe when they are missing but present on PATH / MSYS.
 */
export function ensureWindowsRuntimeDlls(exePath: string): void {
  if (process.platform !== "win32") {
    return;
  }
  const exeDir = path.dirname(exePath);
  const roots = dllSearchRoots(exeDir);
  for (const name of WindowsRuntimeDlls) {
    const dest = path.join(exeDir, name);
    if (fs.existsSync(dest)) {
      continue;
    }
    const source = roots.map((root) => path.join(root, name)).find((candidate) => fs.existsSync(candidate));
    if (source) {
      fs.copyFileSync(source, dest);
    }
  }
}

export function launchEnvironment(exePath: string, extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const exeDir = path.dirname(exePath);
  const sep = process.platform === "win32" ? ";" : ":";
  const pathEnv = process.env.PATH ?? "";
  return { ...process.env, ...extra, PATH: exeDir + sep + pathEnv };
}
