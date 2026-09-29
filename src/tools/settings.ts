import { z } from "zod";
import { define, ToolContext } from "./shared.js";

export function registerSettings(context: ToolContext): void {
  define(
    context,
    "get_settings",
    "Video, audio, language and key binding settings.",
    {},
    async (_args, kestrel) => kestrel.call("settings.get"),
    { readOnlyHint: true },
  );

  define(
    context,
    "set_settings",
    "Change settings; only what is given changes and Kestrel saves it. Volumes are percentages for main, music, ambient, weather, blocks, hostile, friendly, players, records and interface. keyBindings maps forward, back, left, right, up, down, perspective, chat, inventory and drop to key names. Headless mode only takes renderDistance.",
    {
      renderDistance: z.number().int().min(2).max(32).optional(),
      maxFps: z.number().int().min(0).max(240).optional().describe("0 is unlimited"),
      fov: z.number().int().min(30).max(110).optional(),
      interfaceScale: z.number().min(0.25).max(4).optional(),
      language: z.string().optional().describe("Like en_US or tr_TR"),
      paperDollHidden: z.boolean().optional(),
      safeArea: z.number().min(0.9).max(1).optional(),
      fullscreen: z.boolean().optional(),
      volumes: z.array(z.number().int().min(0).max(100)).max(10).optional(),
      keyBindings: z.record(z.string(), z.string()).optional(),
    },
    async (args, kestrel) => {
      const { instance: _instance, ...settings } = args as typeof args & { instance?: string };
      return kestrel.call("settings.set", settings);
    },
  );
}
