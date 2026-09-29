import { z } from "zod";
import { KestrelInstance } from "../instance.js";
import { define, plain, screenshotFlag, sleep, ToolContext, withScreenshot } from "./shared.js";

type GameEvent = { seq: number; kind: string; [key: string]: unknown };

async function lastEvent(kestrel: KestrelInstance): Promise<number> {
  return (await kestrel.call("events", { since: Number.MAX_SAFE_INTEGER, limit: 1 })).last as number;
}

async function eventsSince(kestrel: KestrelInstance, since: number): Promise<{ last: number; events: GameEvent[] }> {
  return kestrel.call("events", { since, limit: 4000 });
}

/**
 * Polls until check gives something back or the time runs out.
 */
async function poll<T>(timeoutMs: number, intervalMs: number, check: () => Promise<T | undefined>): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  do {
    const found = await check();
    if (found !== undefined) {
      return found;
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
  return undefined;
}

async function waitForJoin(kestrel: KestrelInstance, timeoutMs: number, acceptPacks: boolean | undefined): Promise<Record<string, unknown>> {
  let answeredPacks = false;
  const outcome = await poll(timeoutMs, 400, async () => {
    const state = await kestrel.call("session.state", { actors: false, inventory: false });
    if (state.packs?.prompt && acceptPacks !== undefined && !answeredPacks) {
      answeredPacks = true;
      await kestrel.call("session.packs", { accept: acceptPacks });
    }
    if (state.state === "failed" || state.state === "disconnected") {
      return { joined: false, state: state.state, error: state.error };
    }
    if (state.state !== "joined") {
      return undefined;
    }
    if (kestrel.mode !== "headless") {
      // A windowed client counts as in game once the terrain around the player is drawn.
      const client = await kestrel.call("state");
      if (!client.inGame || client.dialog === "connecting") {
        return undefined;
      }
    }
    return { joined: true, server: state.server, levelName: state.levelName, gameMode: state.gameMode, feet: state.player?.feet };
  });
  return outcome ?? { joined: false, state: "timeout", error: `Not joined after ${timeoutMs} ms` };
}

export function registerGame(context: ToolContext): void {
  define(
    context,
    "connect",
    "Join a server (host:port, host with the default port 19132, realm:<id>, or a realm invite code) and by default wait until the player is in the world. Online servers need a signed in Microsoft account (see sign_in).",
    {
      address: z.string(),
      name: z.string().optional().describe("Label shown for the server"),
      wait: z.boolean().optional().describe("Wait for the join to finish; default true"),
      timeoutMs: z.number().int().min(1000).max(300000).optional(),
      acceptPacks: z.boolean().optional().describe("Answer a resource pack prompt: true downloads, false skips"),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      await kestrel.call("session.connect", { address: args.address, name: args.name ?? args.address });
      if (args.wait === false) {
        return { connecting: args.address };
      }
      const result = await waitForJoin(kestrel, args.timeoutMs ?? 60000, args.acceptPacks);
      return withScreenshot(kestrel, result, args.screenshot && result.joined === true, 800);
    },
  );

  define(context, "disconnect", "Leave the server.", {}, async (_args, kestrel) => kestrel.call("session.disconnect"));
  define(context, "respawn", "Respawn after dying.", {}, async (_args, kestrel) => kestrel.call("session.respawn"));
  define(
    context,
    "answer_resource_packs",
    "Answer the server's resource pack prompt: accept downloads them, otherwise they are skipped when the server allows it.",
    { accept: z.boolean() },
    async (args, kestrel) => kestrel.call("session.packs", { accept: args.accept }),
  );

  define(
    context,
    "get_game_state",
    "Everything known about the player and world: connection state and errors, position, health, hunger, xp, effects, boss bars, hotbar, armor and inventory, any open container, the block under the crosshair, the scoreboard sidebar, the player list, world time and weather, nearby entities by distance and optionally the server's command list.",
    {
      actors: z.boolean().optional().describe("Include nearby entities; default true"),
      actorRadius: z.number().min(0).optional().describe("Blocks; default 64"),
      actorLimit: z.number().int().min(0).max(4096).optional(),
      inventory: z.boolean().optional().describe("Include inventory, armor and containers; default true"),
      commands: z.boolean().optional().describe("Include the commands the server offers"),
    },
    async (args, kestrel) => kestrel.call("session.state", args),
    { readOnlyHint: true },
  );

  define(
    context,
    "send_chat",
    "Send a chat message, or a command when it starts with a slash.",
    { text: z.string().min(1) },
    async (args, kestrel) => kestrel.call("chat.send", { text: args.text }),
  );

  define(
    context,
    "run_command",
    "Send a slash command and return the chat, titles, toasts and forms that came back within waitMs.",
    { command: z.string().min(1), waitMs: z.number().int().min(0).max(30000).optional(), keepFormatting: z.boolean().optional() },
    async (args, kestrel) => {
      const since = await lastEvent(kestrel);
      const command = args.command.startsWith("/") ? args.command : `/${args.command}`;
      await kestrel.call("chat.send", { text: command });
      await sleep(args.waitMs ?? 1500);
      const { events } = await eventsSince(kestrel, since);
      return events
        .filter((event) => ["chat", "title", "actionbar", "toast", "form"].includes(event.kind))
        .map((event) => (event.kind === "chat" && !args.keepFormatting ? { kind: "chat", text: plain(String(event.text)) } : event));
    },
  );

  define(
    context,
    "chat_log",
    "The latest chat lines as the chat screen shows them.",
    { limit: z.number().int().min(1).max(1000).optional(), keepFormatting: z.boolean().optional() },
    async (args, kestrel) => {
      const { lines } = await kestrel.call("chat.log", { limit: args.limit ?? 50 });
      return args.keepFormatting ? lines : (lines as string[]).map(plain);
    },
    { readOnlyHint: true },
  );

  define(
    context,
    "get_events",
    "What happened since a sequence number: chat (with raw text and translation parameters), forms, titles, action bar, toasts, joins, disconnects, errors, deaths, dimension changes and pack prompts. Pass the returned last as since next time.",
    {
      since: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(4000).optional(),
      kinds: z.array(z.string()).optional().describe("Only these kinds"),
    },
    async (args, kestrel) => {
      const limit = args.limit ?? 200;
      const result = await kestrel.call("events", { since: args.since ?? 0, limit: args.kinds?.length ? 4000 : limit });
      if (args.kinds?.length) {
        result.events = (result.events as GameEvent[]).filter((event) => args.kinds!.includes(event.kind)).slice(0, limit);
      }
      return result;
    },
    { readOnlyHint: true },
  );

  define(
    context,
    "wait_for",
    "Wait until something happens: joined, disconnected, a form opens, a chat line matches a regular expression, an event of some kind arrives, the client reaches a screen, or the queued input is done. Returns what matched or times out.",
    {
      condition: z.enum(["joined", "disconnected", "form", "chat", "event", "screen", "input_done"]),
      pattern: z.string().optional().describe("Regular expression for chat, ignoring colour codes"),
      kind: z.string().optional().describe("Event kind for condition event"),
      screen: z.string().optional().describe("Screen name for condition screen"),
      timeoutMs: z.number().int().min(100).max(600000).optional(),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      const timeoutMs = args.timeoutMs ?? 30000;
      let since = await lastEvent(kestrel);
      const nextEvent = async (match: (event: GameEvent) => boolean): Promise<GameEvent | undefined> => {
        const { last, events } = await eventsSince(kestrel, since);
        since = last;
        return events.find(match);
      };
      let found: unknown;
      switch (args.condition) {
        case "joined":
          found = await poll(timeoutMs, 400, async () => {
            const state = await kestrel.call("session.state", { actors: false, inventory: false });
            return state.state === "joined" ? { joined: true, levelName: state.levelName } : undefined;
          });
          break;
        case "disconnected":
          found = await poll(timeoutMs, 400, async () => {
            const state = await kestrel.call("session.state", { actors: false, inventory: false });
            return state.state !== "joined" && state.state !== "connecting" && state.state !== "resolving" ? { state: state.state, error: state.error } : undefined;
          });
          break;
        case "form": {
          const open = await kestrel.call("forms.list");
          found = open.forms.length ? open : await poll(timeoutMs, 250, () => nextEvent((event) => event.kind === "form" && !event.close));
          break;
        }
        case "chat": {
          const pattern = new RegExp(args.pattern ?? ".", "i");
          found = await poll(timeoutMs, 250, () => nextEvent((event) => event.kind === "chat" && pattern.test(plain(String(event.text)))));
          break;
        }
        case "event":
          found = await poll(timeoutMs, 250, () => nextEvent((event) => event.kind === args.kind));
          break;
        case "screen":
          found = await poll(timeoutMs, 200, async () => {
            const state = await kestrel.call("state");
            return state.screen === args.screen ? state : undefined;
          });
          break;
        case "input_done":
          found = await poll(timeoutMs, 100, async () => {
            const state = await kestrel.call("state");
            return state.pendingInput === 0 ? { done: true } : undefined;
          });
          break;
      }
      const result = found === undefined ? { matched: false, timeoutMs } : { matched: true, result: found };
      return withScreenshot(kestrel, result, args.screenshot && found !== undefined, 300);
    },
  );

  define(
    context,
    "select_hotbar",
    "Select a hotbar slot, 0 to 8.",
    { slot: z.number().int().min(0).max(8) },
    async (args, kestrel) => kestrel.call("hotbar.select", { slot: args.slot }),
  );

  define(
    context,
    "interact",
    "Act on what the crosshair points at, once: attack hits the entity or starts breaking the block, use uses the held item or places a block, pick_block picks the block (withData copies its contents in creative).",
    { action: z.enum(["attack", "use", "pick_block"]), withData: z.boolean().optional(), screenshot: screenshotFlag },
    async (args, kestrel) => withScreenshot(kestrel, await kestrel.call("interact", { action: args.action, withData: args.withData }), args.screenshot),
  );

  define(
    context,
    "hold_action",
    "Hold attack (keeps mining the targeted block) or use for a while, then let go.",
    { action: z.enum(["attack", "use"]), durationMs: z.number().int().min(0).max(120000) },
    async (args, kestrel) => {
      if (kestrel.mode === "headless") {
        await kestrel.call("hold", { attack: args.action === "attack", use: args.action === "use" });
        await sleep(args.durationMs);
        return kestrel.call("hold", { attack: false, use: false });
      }
      const [down, up] = args.action === "attack" ? ["down", "up"] : ["right_down", "right_up"];
      await kestrel.call("input.mouse", { action: down });
      await sleep(args.durationMs);
      return kestrel.call("input.mouse", { action: up });
    },
  );

  define(
    context,
    "open_inventory",
    "Open the player's inventory screen (window modes, in game only).",
    { screenshot: screenshotFlag },
    async (args, kestrel) => withScreenshot(kestrel, await kestrel.call("inventory.open"), args.screenshot),
  );

  define(context, "close_inventory", "Close the inventory or container screen.", {}, async (_args, kestrel) => kestrel.call("inventory.close"));

  define(
    context,
    "inventory_action",
    "Do what a click in the inventory does, by slot address: 0 to 35 inventory (0 to 8 hotbar), 36 to 39 armor, 40 offhand, 41 to 49 crafting grid, 50 cursor, 51 craft output, 52 and up the open container. primary is a left click, secondary a right click, quick_move a shift click, drop drops (all for the stack), hotbar_swap swaps with hotbar slot value, collect gathers to the cursor, distribute spreads over slots, creative takes creative item value, craft crafts recipe value (all for as many as fit), select_recipe fills the grid with recipe value.",
    {
      action: z.enum(["open", "close", "primary", "secondary", "quick_move", "drop", "hotbar_swap", "collect", "distribute", "creative", "craft", "select_recipe"]),
      slot: z.number().int().optional(),
      value: z.number().int().optional(),
      all: z.boolean().optional(),
      slots: z.array(z.number().int()).optional(),
    },
    async (args, kestrel) => kestrel.call("inventory.command", args),
  );

  define(
    context,
    "list_forms",
    "Server forms on screen (simple button lists, modals and custom forms) with the JSON the server sent.",
    {},
    async (_args, kestrel) => kestrel.call("forms.list"),
    { readOnlyHint: true },
  );

  define(
    context,
    "answer_form",
    "Answer a server form (the newest one unless id is given): button is the index among the buttons of a simple form, or 0 and 1 for a modal's two buttons; values are the answers of a custom form in element order (labels and headers take null); response sends raw JSON; close dismisses it.",
    {
      id: z.number().int().optional(),
      button: z.number().int().min(0).optional(),
      values: z.array(z.union([z.boolean(), z.number(), z.string(), z.null()])).optional(),
      response: z.string().optional(),
      close: z.boolean().optional(),
      screenshot: screenshotFlag,
    },
    async (args, kestrel) => {
      const { screenshot: wanted, ...params } = args;
      return withScreenshot(kestrel, await kestrel.call("forms.answer", params), wanted);
    },
  );
}
