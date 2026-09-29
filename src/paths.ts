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
