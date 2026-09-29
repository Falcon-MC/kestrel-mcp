import { z } from "zod";
import { define, ToolContext } from "./shared.js";

export function registerLifecycle(context: ToolContext): void {
  define(
    context,
    "kestrel_launch",
    "Start Kestrel with its agent port open and connect to it. mode 'hidden' (default) draws offscreen with no window on screen, so menus, joins and screenshots all happen in the background; 'window' shows a normal window; 'headless' runs only the network connection with no rendering (fast bots, no screenshots or menus). Pass connect to join a server straight away without the start screen. Replaces a Kestrel this instance already launched.",
    {
      mode: z.enum(["hidden", "window", "headless"]).optional(),
      connect: z.string().optional().describe("host:port, realm:<id> or a realm invite code to join right after launch"),
      playerName: z.string().optional().describe("Offline player name, used when no Microsoft account is signed in"),
      width: z.number().int().min(320).max(7680).optional(),
      height: z.number().int().min(240).max(4320).optional(),
      binary: z.string().optional().describe("Path to the Kestrel executable; defaults to KESTREL_BINARY"),
      extraArgs: z.array(z.string()).optional(),
      timeoutMs: z.number().int().optional(),
    },
    async (args, kestrel) => {
      const hello = await kestrel.launch({ ...args, mode: args.mode ?? "hidden" });
      return { launched: hello, status: kestrel.status() };
    },
  );

  define(
    context,
    "kestrel_attach",
    "Connect to a Kestrel that is already running with --agent. Port and token are read from agent.json in Kestrel's data directory unless given.",
    { port: z.number().int().optional(), token: z.string().optional() },
    async (args, kestrel) => ({ attached: await kestrel.attach(args.port, args.token), status: kestrel.status() }),
  );

  define(context, "kestrel_status", "Whether the instance is launched and connected, its mode, port and process state.", {}, async (_args, kestrel) => kestrel.status(), { readOnlyHint: true });

  define(context, "kestrel_instances", "List every Kestrel instance this server knows about.", {}, async () => context.instances.list().map((instance) => instance.status()), { readOnlyHint: true });

  define(context, "kestrel_quit", "Close Kestrel (or just detach when it was attached rather than launched).", {}, async (_args, kestrel) => {
    await kestrel.stop();
    return kestrel.status();
  });

  define(
    context,
    "kestrel_process_log",
    "The last lines Kestrel printed to stdout and stderr, for launched instances. Headless mode prints chat here too.",
    { lines: z.number().int().min(1).max(2000).optional() },
    async (args, kestrel) => kestrel.tail(args.lines ?? 100).join("\n") || "(nothing printed)",
    { readOnlyHint: true },
  );

  define(
    context,
    "kestrel_call",
    "Call any agent method directly, for anything the other tools do not cover. See the README for the method list.",
    { method: z.string(), params: z.record(z.string(), z.unknown()).optional(), timeoutMs: z.number().int().optional() },
    async (args, kestrel) => kestrel.call(args.method, args.params ?? {}, args.timeoutMs),
  );
}
