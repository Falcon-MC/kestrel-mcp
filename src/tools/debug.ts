import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { kestrelDataDirectory } from "../paths.js";
import { define, ToolContext } from "./shared.js";

export function registerDebug(context: ToolContext): void {
  define(
    context,
    "debug_info",
    "What the F3 screen shows (position, facing, chunk and mesh counts, target block and its states), frame timings per section, FPS, memory, renderer and where the logs are.",
    {},
    async (_args, kestrel) => kestrel.call("debug.info"),
    { readOnlyHint: true },
  );

  define(
    context,
    "read_debug_log",
    "The tail of Kestrel's debug.txt: connection steps, network diagnostics, world decode errors. previous reads the log of the connection before this one.",
    {
      lines: z.number().int().min(1).max(5000).optional(),
      previous: z.boolean().optional(),
      grep: z.string().optional().describe("Keep only lines matching this regular expression"),
    },
    async (args) => {
      const file = path.join(kestrelDataDirectory(), args.previous ? "debug.previous.txt" : "debug.txt");
      let content: string;
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        return `No ${file} yet`;
      }
      let lines = content.split(/\r?\n/).filter((line) => line.length > 0);
      if (args.grep) {
        const pattern = new RegExp(args.grep, "i");
        lines = lines.filter((line) => pattern.test(line));
      }
      return lines.slice(-(args.lines ?? 200)).join("\n") || "(empty)";
    },
    { readOnlyHint: true },
  );
}
