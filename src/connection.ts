import net from "node:net";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class KestrelError extends Error {}

/**
 * One line of JSON per message over the agent port Kestrel opens on
 * 127.0.0.1. Calls are matched to answers by id, so several can be in
 * flight at once.
 */
export class KestrelConnection {
  private socket: net.Socket;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closedReason: string | undefined;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.receive(chunk));
    socket.on("close", () => this.fail("Kestrel closed the agent connection"));
    socket.on("error", (error) => this.fail(`Agent connection error: ${error.message}`));
  }

  static open(port: number, token: string, timeoutMs = 5000): Promise<{ connection: KestrelConnection; hello: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new KestrelError(`No answer on 127.0.0.1:${port}`));
      }, timeoutMs);
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once("connect", async () => {
        clearTimeout(timer);
        const connection = new KestrelConnection(socket);
        try {
          const hello = (await connection.call("hello", { token }, timeoutMs)) as Record<string, unknown>;
          resolve({ connection, hello });
        } catch (error) {
          connection.close();
          reject(error);
        }
      });
    });
  }

  get closed(): boolean {
    return this.closedReason !== undefined;
  }

  call(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
    if (this.closedReason) {
      return Promise.reject(new KestrelError(this.closedReason));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new KestrelError(`${method} got no answer within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }

  close(): void {
    this.socket.destroy();
    this.fail("Connection closed");
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim()) {
        this.dispatch(line);
      }
    }
  }

  private dispatch(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const entry = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
    if (!entry) {
      return;
    }
    this.pending.delete(message.id!);
    clearTimeout(entry.timer);
    if (message.error) {
      entry.reject(new KestrelError(message.error.message ?? "Kestrel refused the call"));
    } else {
      entry.resolve(message.result);
    }
  }

  private fail(reason: string): void {
    if (this.closedReason) {
      return;
    }
    this.closedReason = reason;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new KestrelError(reason));
    }
    this.pending.clear();
  }
}
