<p align="center">
	<picture>
		<source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Falcon-MC/Falcon/main/.github/logo-white.png">
		<img src="https://raw.githubusercontent.com/Falcon-MC/Falcon/main/.github/logo.png" alt="Falcon" width="200">
	</picture>
	<br>
	<b>MCP server that lets AI agents play and test with <a href="https://github.com/Falcon-MC/Kestrel">Kestrel</a></b>
	<br>
	Not affiliated with Mojang AB.
</p>

<p align="center">
	<img src="https://img.shields.io/badge/Bedrock-v1.26.51-56383E" alt="Bedrock">
	<img src="https://img.shields.io/badge/language-TypeScript-3178C6" alt="TypeScript">
	<img src="https://img.shields.io/badge/node-20%2B-339933" alt="Node 20+">
	<img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey" alt="Platform">
</p>

## What is this?

Kestrel is a native Minecraft: Bedrock Edition client. Started with `--agent`, it opens a small JSON control port
on 127.0.0.1. This server speaks MCP on one side and that port on the other, so an agent can launch Kestrel, join
servers without clicking through the menus, look at the screen, open any menu, fill in forms, walk around, read
chat and record packets.

- **Hidden** - the full client drawn offscreen. No window shows up, but menus, joins and screenshots all work. The default
- **Window** - a normal window you can watch while the agent drives it
- **Headless** - only the connection: no window, no rendering, no menus. Cheap enough to run several bots at once

## Getting started

Build [Kestrel](https://github.com/Falcon-MC/Kestrel) from its main branch, then this server:

```
npm install
npm run build
```

Add it to Claude Code, pointing `KESTREL_BINARY` at the Kestrel executable:

```
claude mcp add kestrel -e KESTREL_BINARY=/path/to/Kestrel/build/Kestrel -- node /path/to/kestrel-mcp/dist/index.js
```

On Windows, MSYS2 UCRT64 builds also need `libssl-3-x64.dll`, `libcrypto-3-x64.dll` and `zlib1.dll` next to
`Kestrel.exe`. The server copies them from `PATH` or MSYS2 when they are missing.

Any other MCP client works the same way: run `node dist/index.js` over stdio with `KESTREL_BINARY` set.

To drive a Kestrel you started yourself, run it with `--agent` and use `kestrel_attach`. It reads the port and token
from `agent.json` in Kestrel's data directory (`~/.local/share/Kestrel`, `%APPDATA%\Kestrel` or
`~/Library/Application Support/Kestrel`).

## Tools

Every tool takes an optional `instance` name, so one server can drive several Kestrels at once (say a hidden
client and two headless bots). Tools that change the screen take `screenshot: true` to send back an image once the
screen settles.

| Group | Tools |
|-------|-------|
| Lifecycle | `kestrel_launch`, `kestrel_attach`, `kestrel_status`, `kestrel_instances`, `kestrel_quit`, `kestrel_process_log`, `kestrel_call` |
| Screen and menus | `screenshot`, `get_client_state`, `get_ui_widgets`, `click_widget`, `open_menu`, `show_dialog`, `go_back` |
| Input | `mouse`, `scroll`, `press_key`, `type_text`, `release_all_input`, `look`, `move` |
| Playing | `connect`, `disconnect`, `respawn`, `answer_resource_packs`, `get_game_state`, `send_chat`, `run_command`, `chat_log`, `get_events`, `wait_for`, `select_hotbar`, `interact`, `hold_action`, `open_inventory`, `close_inventory`, `inventory_action`, `list_forms`, `answer_form` |
| Packets | `packet_capture`, `packet_log`, `packet_stats`, `packet_clear`, `send_raw_packet` |
| Account and servers | `account_status`, `sign_in`, `cancel_sign_in`, `sign_out`, `list_servers`, `add_server`, `update_server`, `remove_server`, `favorite_server`, `ping_server` |
| Settings and debugging | `get_settings`, `set_settings`, `debug_info`, `read_debug_log` |

## Agent protocol

One JSON object per line, both ways. Requests are `{"id", "method", "params"}` and answers are `{"id", "result"}` or
`{"id", "error": {"message"}}`. The first request on a connection has to be `hello` with the token.

| Mode | Methods |
|------|---------|
| All | `hello`, `session.connect`, `session.disconnect`, `session.respawn`, `session.packs`, `session.state`, `chat.send`, `chat.log`, `hotbar.select`, `interact`, `inventory.command`, `forms.list`, `forms.answer`, `events`, `packets.configure`, `packets.list`, `packets.stats`, `packets.clear`, `packets.send`, `account.state`, `account.signIn`, `account.cancel`, `account.signOut`, `camera.look`, `state`, `debug.info`, `settings.set`, `app.quit` |
| Window and hidden | `screenshot`, `ui.widgets`, `ui.click`, `input.mouse`, `input.scroll`, `input.key`, `input.text`, `input.releaseAll`, `menu.open`, `menu.dialog`, `menu.back`, `inventory.open`, `inventory.close`, `settings.get`, `servers.list`, `servers.add`, `servers.update`, `servers.remove`, `servers.favorite`, `servers.ping` |
| Headless | `motion.set`, `hold` |

The port only listens on 127.0.0.1, and the token is passed through `KESTREL_AGENT_TOKEN` rather than the command
line. `agent.json` is readable only by the user running Kestrel.

## Related repositories

- [Kestrel](https://github.com/Falcon-MC/Kestrel) - the Bedrock client this server drives
- [Falcon](https://github.com/Falcon-MC/Falcon) - Bedrock server software written from scratch in C++

## Give a star if this project helped you

[![Contributors](https://contrib.rocks/image?repo=Falcon-MC/kestrel-mcp)](https://github.com/Falcon-MC/kestrel-mcp/graphs/contributors)

## Licensing information

kestrel-mcp is not affiliated with Mojang. All brands and trademarks belong to their respective owners.
kestrel-mcp is not a Mojang-approved software, nor is it associated with Mojang.
