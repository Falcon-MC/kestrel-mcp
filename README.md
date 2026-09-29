<p align="center">
	<b>kestrel-mcp</b>
	<br>
	An MCP server that lets AI agents play and test with <a href="https://github.com/Falcon-MC/Kestrel">Kestrel</a>
</p>

## What is this?

Kestrel is a native Minecraft: Bedrock Edition client. Started with `--agent`, it opens a small JSON control port
on 127.0.0.1. This server speaks MCP on one side and that port on the other, so an agent can launch Kestrel, join
servers without clicking through the menus, look at the screen, open any menu, fill in forms, walk around, read
chat and record packets.

Kestrel has three ways to run for an agent:

| Mode | What you get |
| --- | --- |
| `hidden` | The full client drawn offscreen. No window shows up, but menus, joins and screenshots all work. The default. |
| `window` | A normal window you can watch while the agent drives it. |
| `headless` | Only the connection: no window, no rendering, no menus. Cheap enough to run several bots at once. |

## Setup

Build Kestrel from its main branch, then this server:

```
npm install
npm run build
```

Add it to Claude Code, pointing `KESTREL_BINARY` at the Kestrel executable
(on Windows, `Kestrel.exe`; MinGW builds also need `libssl-3-x64.dll`,
`libcrypto-3-x64.dll` and `zlib1.dll` next to the exe — the server copies
them from PATH / MSYS if they are missing):

```
claude mcp add kestrel -e KESTREL_BINARY=/path/to/Kestrel/build/Kestrel -- node /path/to/kestrel-mcp/dist/index.js
```

Any other MCP client works the same way: run `node dist/index.js` over stdio with `KESTREL_BINARY` set.

To drive a Kestrel you started yourself, run it with `--agent` and use `kestrel_attach`. It reads the port and token
from `agent.json` in Kestrel's data directory (`~/.local/share/Kestrel`, `%APPDATA%\Kestrel` or
`~/Library/Application Support/Kestrel`).

## Tools

Every tool takes an optional `instance` name, so one server can drive several Kestrels at once (say a hidden
client and two headless bots). Tools that change the screen take `screenshot: true` to send back an image once the
screen settles.

**Lifecycle:** `kestrel_launch`, `kestrel_attach`, `kestrel_status`, `kestrel_instances`, `kestrel_quit`,
`kestrel_process_log`, and `kestrel_call` for any agent method directly.

**Screen and menus:** `screenshot` (scaled or cropped), `get_client_state`, `get_ui_widgets` (every clickable control
with its label and pixel box), `click_widget`, `open_menu` (title, play, settings with any page, server form,
marketplace, dressing room, profile), `show_dialog`, `go_back`.

**Input:** `mouse`, `scroll`, `press_key` (with hold), `type_text`, `release_all_input`, `look`, `move`.

**Playing:** `connect` (waits for the join and can answer the pack prompt), `disconnect`, `respawn`,
`answer_resource_packs`, `get_game_state`, `send_chat`, `run_command`, `chat_log`, `get_events`, `wait_for`,
`select_hotbar`, `interact`, `hold_action`, `open_inventory`, `close_inventory`, `inventory_action`, `list_forms`,
`answer_form`.

**Packets:** `packet_capture`, `packet_log`, `packet_stats`, `packet_clear`, `send_raw_packet`.

**Account and servers:** `account_status`, `sign_in` (hands back the device code link), `cancel_sign_in`, `sign_out`,
`list_servers`, `add_server`, `update_server`, `remove_server`, `favorite_server`, `ping_server`.

**Settings and debugging:** `get_settings`, `set_settings`, `debug_info` (the F3 screen and frame timings),
`read_debug_log`.

## Agent protocol

One JSON object per line, both ways. Requests are `{"id", "method", "params"}` and answers are `{"id", "result"}` or
`{"id", "error": {"message"}}`. The first request on a connection has to be `hello` with the token.

| Group | Methods |
| --- | --- |
| Both modes | `hello`, `session.connect`, `session.disconnect`, `session.respawn`, `session.packs`, `session.state`, `chat.send`, `chat.log`, `hotbar.select`, `interact`, `inventory.command`, `forms.list`, `forms.answer`, `events`, `packets.configure`, `packets.list`, `packets.stats`, `packets.clear`, `packets.send`, `account.state`, `account.signIn`, `account.cancel`, `account.signOut`, `camera.look`, `state`, `debug.info`, `settings.set`, `app.quit` |
| Window and hidden | `screenshot`, `ui.widgets`, `ui.click`, `input.mouse`, `input.scroll`, `input.key`, `input.text`, `input.releaseAll`, `menu.open`, `menu.dialog`, `menu.back`, `inventory.open`, `inventory.close`, `settings.get`, `servers.list`, `servers.add`, `servers.update`, `servers.remove`, `servers.favorite`, `servers.ping` |
| Headless | `motion.set`, `hold` |

The port only listens on 127.0.0.1, and the token is passed through `KESTREL_AGENT_TOKEN` rather than the command
line. `agent.json` is readable only by the user running Kestrel.

## Known gaps

Screenshots read frames back from the GPU (Vulkan, Direct3D 12 and Metal), including hidden windows.
