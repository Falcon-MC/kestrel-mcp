import { z } from "zod";
import { define, ToolContext } from "./shared.js";

type PacketRecord = { seq: number; direction: string; id: number; name: string; size: number; head?: string };

export function registerPackets(context: ToolContext): void {
  define(
    context,
    "packet_capture",
    "Start or stop recording packets, and choose what is kept: capacity is how many records the ring holds, headBytes how much of each payload is kept as hex, only and ignore filter by packet id. Counting per packet id always runs, recording or not.",
    {
      recording: z.boolean(),
      capacity: z.number().int().min(0).max(100000).optional(),
      headBytes: z.number().int().min(0).max(65536).optional(),
      only: z.array(z.number().int()).optional().describe("Record only these packet ids"),
      ignore: z.array(z.number().int()).optional().describe("Never record these packet ids"),
    },
    async (args, kestrel) => kestrel.call("packets.configure", args),
  );

  define(
    context,
    "packet_log",
    "Recorded packets after a sequence number, oldest first, with direction, id, name, size and the payload's first bytes in hex. Pass the returned last as since to page forward.",
    {
      since: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(5000).optional(),
      direction: z.enum(["in", "out"]).optional(),
      names: z.array(z.string()).optional().describe("Keep only packets with these names, like Text or MovePlayer"),
      hex: z.boolean().optional().describe("Include payload bytes; default true"),
    },
    async (args, kestrel) => {
      const result = await kestrel.call("packets.list", { since: args.since ?? 0, limit: args.limit ?? 200, hex: args.hex ?? true });
      const names = args.names?.map((name) => name.toLowerCase());
      result.packets = (result.packets as PacketRecord[]).filter(
        (packet) => (!args.direction || packet.direction === args.direction) && (!names || names.includes(packet.name.toLowerCase())),
      );
      return result;
    },
    { readOnlyHint: true },
  );

  define(
    context,
    "packet_stats",
    "Packet counts and bytes per packet id and direction since the last clear, busiest first.",
    { top: z.number().int().min(1).max(1000).optional() },
    async (args, kestrel) => {
      const { packets } = await kestrel.call("packets.stats");
      return (packets as { count: number }[]).sort((a, b) => b.count - a.count).slice(0, args.top ?? 100);
    },
    { readOnlyHint: true },
  );

  define(context, "packet_clear", "Forget recorded packets and counts.", {}, async (_args, kestrel) => kestrel.call("packets.clear"));

  define(
    context,
    "send_raw_packet",
    "Send a raw game packet to the server: hex of the payload as the game encodes it, packet header (the id varint) included, without batching or compression. The server sees exactly these bytes, so a wrong payload can get you kicked.",
    { hex: z.string().min(2) },
    async (args, kestrel) => kestrel.call("packets.send", { hex: args.hex }),
    { destructiveHint: true },
  );
}
