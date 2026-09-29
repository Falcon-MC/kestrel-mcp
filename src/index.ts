#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Instances } from "./instance.js";
import { registerAccount } from "./tools/account.js";
import { registerDebug } from "./tools/debug.js";
import { registerGame } from "./tools/game.js";
import { registerInput } from "./tools/input.js";
import { registerLifecycle } from "./tools/lifecycle.js";
import { registerPackets } from "./tools/packets.js";
import { registerScreen } from "./tools/screen.js";
import { registerServers } from "./tools/servers.js";
import { registerSettings } from "./tools/settings.js";

const instructions = `Drives Kestrel, a native Minecraft Bedrock client.

Start with kestrel_launch (mode "hidden" keeps everything off screen but still renders, so screenshots work; "headless" is only the network connection; "window" is a normal window) or kestrel_attach for a Kestrel started with --agent. kestrel_launch with connect joins a server without going through the menus.

Look before acting: screenshot shows the screen, get_client_state says which screen and dialog are up, get_ui_widgets lists clickable controls with their labels and pixel boxes. Prefer open_menu, click_widget, answer_form and connect over raw mouse clicks. Most tools that change the screen take screenshot: true to return an image after the change.

In game: get_game_state for the player and world, get_events or wait_for to follow chat, forms and connection changes, move/look/interact/hold_action to play, inventory_action for the inventory. packet_capture and packet_log record traffic for protocol debugging.

Several Kestrels can run at once; every tool takes an optional instance name.`;

const server = new McpServer({ name: "kestrel-mcp", version: "0.1.0" }, { instructions });
const instances = new Instances();
const context = { server, instances };

registerLifecycle(context);
registerScreen(context);
registerInput(context);
registerGame(context);
registerPackets(context);
registerAccount(context);
registerServers(context);
registerSettings(context);
registerDebug(context);

async function shutdown(): Promise<void> {
  await instances.stopAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);

await server.connect(new StdioServerTransport());
