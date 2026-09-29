import { z } from "zod";
import { define, sleep, ToolContext } from "./shared.js";

export function registerServers(context: ToolContext): void {
  define(
    context,
    "list_servers",
    "Saved servers with their index and latest ping (motd, version, players, latency), and the featured partner servers.",
    {},
    async (_args, kestrel) => kestrel.call("servers.list"),
    { readOnlyHint: true },
  );

  define(
    context,
    "add_server",
    "Save a server to the list.",
    { address: z.string(), name: z.string().optional() },
    async (args, kestrel) => kestrel.call("servers.add", args),
  );

  define(
    context,
    "update_server",
    "Rename a saved server or change its address.",
    { index: z.number().int().min(0), name: z.string().optional(), address: z.string().optional() },
    async (args, kestrel) => kestrel.call("servers.update", args),
  );

  define(
    context,
    "remove_server",
    "Delete a saved server.",
    { index: z.number().int().min(0) },
    async (args, kestrel) => kestrel.call("servers.remove", args),
    { destructiveHint: true },
  );

  define(
    context,
    "favorite_server",
    "Toggle a saved server's favorite mark.",
    { index: z.number().int().min(0) },
    async (args, kestrel) => kestrel.call("servers.favorite", args),
  );

  define(
    context,
    "ping_server",
    "Ping any Bedrock server without joining: motd, version, player counts and latency.",
    { address: z.string(), timeoutMs: z.number().int().min(500).max(30000).optional() },
    async (args, kestrel) => {
      const deadline = Date.now() + (args.timeoutMs ?? 6000);
      let result = await kestrel.call("servers.ping", { address: args.address });
      while (result.state === "checking" && Date.now() < deadline) {
        await sleep(300);
        result = await kestrel.call("servers.ping", { address: args.address });
      }
      return result;
    },
    { readOnlyHint: true },
  );
}
