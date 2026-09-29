import { ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { KestrelConnection, KestrelError } from "./connection.js";
import { ensureWindowsRuntimeDlls, kestrelDataDirectory, launchEnvironment, resolveKestrelBinary } from "./paths.js";

export type LaunchMode = "window" | "hidden" | "headless";

export interface LaunchRequest {
  mode: LaunchMode;
  binary?: string;
  connect?: string;
  playerName?: string;
  width?: number;
  height?: number;
  extraArgs?: string[];
  timeoutMs?: number;
}

const LogLines = 2000;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One Kestrel the server talks to: either a process it launched, whose
 * output it keeps, or one that was already running and got attached to.
 */
export class KestrelInstance {
  connection: KestrelConnection | undefined;
  process: ChildProcess | undefined;
  mode: string = "unknown";
  port = 0;
  version = "";
  private log: string[] = [];
  private exitStatus: string | undefined;

  constructor(readonly name: string) {}

  get connected(): boolean {
    return !!this.connection && !this.connection.closed;
  }

  get running(): boolean {
    return !!this.process && this.process.exitCode === null && this.process.signalCode === null;
  }

  async launch(request: LaunchRequest): Promise<Record<string, unknown>> {
    const requested = request.binary ?? process.env.KESTREL_BINARY;
    if (!requested) {
      throw new KestrelError("Set KESTREL_BINARY to the Kestrel executable, or pass binary");
    }
    const binary = resolveKestrelBinary(requested);
    ensureWindowsRuntimeDlls(binary);
    await this.stop();
    const port = await freePort();
    const token = crypto.randomBytes(16).toString("hex");
    const args = ["--agent-port", String(port)];
    if (request.mode === "hidden") {
      args.push("--hidden");
    } else if (request.mode === "headless") {
      args.push("--headless");
    }
    if (request.connect) {
      args.push("--connect", request.connect);
    }
    if (request.playerName) {
      args.push("--name", request.playerName);
    }
    if (request.width && request.height) {
      args.push("--size", `${request.width}x${request.height}`);
    }
    args.push(...(request.extraArgs ?? []));

    this.log = [];
    this.exitStatus = undefined;
    const child = spawn(binary, args, {
      cwd: path.dirname(binary),
      env: launchEnvironment(binary, { KESTREL_AGENT_TOKEN: token }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: request.mode !== "window",
    });
    this.process = child;
    const collect = (stream: string) => (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.length > 0) {
          this.log.push(`[${stream}] ${line}`);
        }
      }
      if (this.log.length > LogLines) {
        this.log.splice(0, this.log.length - LogLines);
      }
    };
    child.stdout?.on("data", collect("out"));
    child.stderr?.on("data", collect("err"));
    child.on("exit", (code, signal) => {
      this.exitStatus = signal ? `killed by ${signal}` : `exited with code ${code}`;
      this.log.push(`[kestrel-mcp] Kestrel ${this.exitStatus}`);
    });
    child.on("error", (error) => {
      this.exitStatus = error.message;
      this.log.push(`[kestrel-mcp] ${error.message}`);
    });

    const deadline = Date.now() + (request.timeoutMs ?? 60000);
    let lastError = "";
    while (Date.now() < deadline) {
      if (this.exitStatus) {
        throw new KestrelError(`Kestrel ${this.exitStatus} before the agent port opened:\n${this.tail(30).join("\n")}`);
      }
      try {
        return await this.connect(port, token);
      } catch (error) {
        lastError = (error as Error).message;
        await sleep(250);
      }
    }
    await this.stop();
    throw new KestrelError(`Kestrel did not open its agent port in time (${lastError}):\n${this.tail(30).join("\n")}`);
  }

  /**
   * Attaches to a Kestrel started elsewhere with --agent, reading its port
   * and token from agent.json unless given.
   */
  async attach(port?: number, token?: string): Promise<Record<string, unknown>> {
    if (port === undefined || token === undefined) {
      const file = path.join(kestrelDataDirectory(), "agent.json");
      let published: { port?: number; token?: string };
      try {
        published = JSON.parse(await fs.readFile(file, "utf8"));
      } catch {
        throw new KestrelError(`No ${file}; start Kestrel with --agent first`);
      }
      port ??= published.port;
      token ??= published.token;
    }
    if (!port || !token) {
      throw new KestrelError("agent.json has no port or token");
    }
    this.connection?.close();
    return this.connect(port, token);
  }

  private async connect(port: number, token: string): Promise<Record<string, unknown>> {
    const { connection, hello } = await KestrelConnection.open(port, token);
    this.connection = connection;
    this.port = port;
    this.mode = String(hello.mode ?? "unknown");
    this.version = String(hello.kestrel ?? "");
    return hello;
  }

  async call(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<any> {
    if (!this.connection || this.connection.closed) {
      throw new KestrelError(`Instance "${this.name}" is not connected; use kestrel_launch or kestrel_attach`);
    }
    return this.connection.call(method, params, timeoutMs);
  }

  tail(lines: number): string[] {
    return this.log.slice(-lines);
  }

  status(): Record<string, unknown> {
    return {
      instance: this.name,
      connected: this.connected,
      mode: this.mode,
      port: this.port,
      kestrel: this.version,
      launched: !!this.process,
      running: this.process ? this.running : undefined,
      pid: this.process?.pid,
      exit: this.exitStatus,
    };
  }

  async stop(): Promise<void> {
    if (this.connected) {
      try {
        await this.call("app.quit", {}, 3000);
      } catch {
        // Already on its way out.
      }
    }
    this.connection?.close();
    this.connection = undefined;
    if (this.process && this.running) {
      const child = this.process;
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      const timeout = sleep(5000).then(() => {
        if (child.exitCode === null) {
          child.kill();
        }
      });
      await Promise.race([exited, timeout]);
    }
    this.process = undefined;
  }
}

export class Instances {
  private all = new Map<string, KestrelInstance>();

  get(name = "default"): KestrelInstance {
    let instance = this.all.get(name);
    if (!instance) {
      instance = new KestrelInstance(name);
      this.all.set(name, instance);
    }
    return instance;
  }

  list(): KestrelInstance[] {
    return [...this.all.values()];
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.list().map((instance) => instance.stop()));
  }
}
