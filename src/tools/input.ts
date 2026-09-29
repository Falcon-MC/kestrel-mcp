import { z } from "zod";
import { KestrelInstance } from "../instance.js";
import { define, screenshotFlag, sleep, ToolContext, withScreenshot } from "./shared.js";

function needsWindow(kestrel: KestrelInstance): void {
  if (kestrel.mode === "headless") {
    throw new Error("Headless Kestrel has no window input; use move, look, interact and hold_action instead");
  }
}

export function registerInput(context: ToolContext): void {
  define(
    context,
    "mouse",
    "Move or click the mouse at window pixel coordinates (the same pixels a full width screenshot shows).",
    {
      x: z.number().optional(),
      y: z.number().optional(),
      action: z.enum(["move", "click", "down", "up", "right_click", "right_down", "right_up", "middle_click"]).optional().describe("Default click"),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      needsWindow(kestrel);
      const result = await kestrel.call("input.mouse", { x: args.x, y: args.y, action: args.action ?? "click" });
      return withScreenshot(kestrel, result, args.screenshot);
    },
  );

  define(
    context,
    "scroll",
    "Turn the mouse wheel; negative scrolls down lists, and in game it cycles the hotbar.",
    { amount: z.number(), x: z.number().optional(), y: z.number().optional() },
    async (args, kestrel) => {
      needsWindow(kestrel);
      return kestrel.call("input.scroll", args);
    },
  );

  define(
    context,
    "press_key",
    "Press, hold or release a key by name: A to Z, 0 to 9, Space, Shift, Ctrl, Alt, Tab, Enter, Backspace, Escape, Up, Down, Left, Right, F1 to F12. With holdMs the key stays down that long, which moves the player when it is a movement key.",
    {
      key: z.string(),
      action: z.enum(["press", "down", "up"]).optional(),
      holdMs: z.number().int().min(0).max(60000).optional(),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      needsWindow(kestrel);
      if (args.holdMs !== undefined) {
        await kestrel.call("input.key", { key: args.key, action: "down" });
        await sleep(args.holdMs);
        const result = await kestrel.call("input.key", { key: args.key, action: "up" });
        return withScreenshot(kestrel, result, args.screenshot);
      }
      return withScreenshot(kestrel, await kestrel.call("input.key", { key: args.key, action: args.action ?? "press" }), args.screenshot);
    },
  );

  define(
    context,
    "type_text",
    "Type text into whatever field has focus (chat, server form fields, search boxes), optionally pressing Enter after.",
    { text: z.string(), submit: z.boolean().optional(), screenshot: screenshotFlag },
    async (args, kestrel) => {
      needsWindow(kestrel);
      return withScreenshot(kestrel, await kestrel.call("input.text", { text: args.text, submit: args.submit ?? false }), args.screenshot);
    },
  );

  define(context, "release_all_input", "Let go of every key and mouse button the agent is holding.", {}, async (_args, kestrel) => {
    if (kestrel.mode === "headless") {
      await kestrel.call("motion.set", { forward: 0, sideways: 0, jump: false, sneak: false, sprint: false });
      return kestrel.call("hold", { attack: false, use: false });
    }
    return kestrel.call("input.releaseAll");
  });

  define(
    context,
    "look",
    "Turn the player's view. yaw and pitch are absolute Minecraft degrees (yaw 0 faces south, 90 west, 180 north, 270 east; pitch -90 up, 90 down); turnYaw and turnPitch turn relative to now.",
    {
      yaw: z.number().optional(),
      pitch: z.number().min(-90).max(90).optional(),
      turnYaw: z.number().optional(),
      turnPitch: z.number().optional(),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      const { screenshot: wanted, ...params } = args;
      return withScreenshot(kestrel, await kestrel.call("camera.look", params), wanted, 150);
    },
  );

  define(
    context,
    "move",
    "Walk for a while: forward 1 walks forward, -1 back; sideways 1 strafes left, -1 right. Jump, sneak and sprint are held for the whole time. Works in every mode; with a window it holds the bound movement keys, so the player must be in game with no screen open.",
    {
      forward: z.number().min(-1).max(1).optional(),
      sideways: z.number().min(-1).max(1).optional(),
      jump: z.boolean().optional(),
      sneak: z.boolean().optional(),
      sprint: z.boolean().optional(),
      durationMs: z.number().int().min(0).max(120000).describe("How long to keep moving"),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      const before = (await kestrel.call("session.state", { actors: false, inventory: false })).player?.feet;
      if (kestrel.mode === "headless") {
        await kestrel.call("motion.set", { forward: args.forward ?? 0, sideways: args.sideways ?? 0, jump: !!args.jump, sneak: !!args.sneak, sprint: !!args.sprint });
        await sleep(args.durationMs);
        await kestrel.call("motion.set", { forward: 0, sideways: 0, jump: false, sneak: false, sprint: false });
      } else {
        const bindings = (await kestrel.call("settings.get")).keyBindings as Record<string, string>;
        const keys: string[] = [];
        const forward = args.forward ?? 0;
        const sideways = args.sideways ?? 0;
        if (forward > 0) keys.push(bindings.forward);
        if (forward < 0) keys.push(bindings.back);
        if (sideways > 0) keys.push(bindings.left);
        if (sideways < 0) keys.push(bindings.right);
        if (args.jump) keys.push(bindings.up);
        if (args.sneak) keys.push(bindings.down);
        if (args.sprint) keys.push("Ctrl");
        for (const key of keys) {
          await kestrel.call("input.key", { key, action: "down" });
        }
        await sleep(args.durationMs);
        for (const key of keys) {
          await kestrel.call("input.key", { key, action: "up" });
        }
      }
      await sleep(100);
      const after = (await kestrel.call("session.state", { actors: false, inventory: false })).player?.feet;
      return withScreenshot(kestrel, { from: before, to: after }, args.screenshot, 100);
    },
  );
}
