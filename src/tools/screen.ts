import { z } from "zod";
import { define, screenshot, screenshotFlag, ToolContext, withScreenshot } from "./shared.js";

const screens = ["title", "play", "settings", "server_form", "marketplace", "dressing_room", "profile"] as const;
const pages = ["accessibility", "keyboard", "controller", "touch", "party", "general", "video", "audio", "account", "subscriptions", "global_resources", "storage", "language", "creator"] as const;
const dialogs = ["none", "pause", "chat", "confirm_exit", "safe_area", "profile_options"] as const;

export function registerScreen(context: ToolContext): void {
  define(
    context,
    "screenshot",
    "Capture what Kestrel is drawing right now (works for hidden windows too). Coordinates in the image match the window pixels used by click and mouse tools when maxWidth equals the window width.",
    {
      maxWidth: z.number().int().min(64).max(7680).optional().describe("Scale down to this width; default 1280"),
      crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional().describe("Window pixel area to keep"),
      savePath: z.string().optional().describe("Also write the PNG to this file"),
      delayMs: z.number().int().min(0).max(30000).optional().describe("Wait before capturing, for animations to finish"),
    },
    async (args, kestrel) => {
      if (args.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, args.delayMs));
      }
      return screenshot(kestrel, args);
    },
    { readOnlyHint: true },
  );

  define(
    context,
    "get_client_state",
    "The client's own state: current screen, dialog, settings page, play tab, whether a form or the inventory is open, whether the player is in game, window size and GUI scale, renderer and FPS.",
    {},
    async (_args, kestrel) => kestrel.call("state"),
    { readOnlyHint: true },
  );

  define(
    context,
    "get_ui_widgets",
    "Every clickable control of the last frame with its id, label and window pixel box. Use it to find what to click instead of guessing coordinates.",
    {
      filter: z.string().optional().describe("Keep widgets whose id or label contains this"),
      includeHidden: z.boolean().optional().describe("Also list controls scrolled out of view"),
    },
    async (args, kestrel) => kestrel.call("ui.widgets", { filter: args.filter, visibleOnly: !args.includeHidden }),
    { readOnlyHint: true },
  );

  define(
    context,
    "click_widget",
    "Click a control by its id (exact, then partial) or its label (case insensitive). Clicks go through the real input path, so sounds and hover states behave as for a player.",
    { id: z.string().optional(), label: z.string().optional(), screenshot: screenshotFlag },
    async (args, kestrel) => {
      if (!args.id && !args.label) {
        throw new Error("Give id or label");
      }
      const result = await kestrel.call("ui.click", { id: args.id, label: args.label });
      return withScreenshot(kestrel, result, args.screenshot);
    },
  );

  define(
    context,
    "open_menu",
    "Jump straight to a menu screen without clicking through: title, play, settings (with page), server_form (add, or edit with serverIndex), marketplace, dressing_room or profile. The play screen takes tab realms or servers.",
    {
      screen: z.enum(screens),
      page: z.enum(pages).optional().describe("Settings page"),
      tab: z.enum(["realms", "servers"]).optional().describe("Play screen tab"),
      serverIndex: z.number().int().min(0).optional().describe("Edit this saved server on server_form"),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      const result = await kestrel.call("menu.open", { screen: args.screen, page: args.page, tab: args.tab, index: args.serverIndex });
      return withScreenshot(kestrel, result, args.screenshot);
    },
  );

  define(
    context,
    "show_dialog",
    "Open or dismiss a dialog: pause and chat need the player in game; none dismisses whatever is up.",
    { dialog: z.enum(dialogs), screenshot: screenshotFlag },
    async (args, kestrel) => withScreenshot(kestrel, await kestrel.call("menu.dialog", { dialog: args.dialog }), args.screenshot),
  );

  define(
    context,
    "go_back",
    "Press Escape once, which closes the topmost thing: chat, dialogs, forms, the inventory, or goes back a screen.",
    { screenshot: screenshotFlag },
    async (args, kestrel) => withScreenshot(kestrel, await kestrel.call("menu.back"), args.screenshot),
  );
}
