# postjson-watch

Watch a directory tree and **POST every `.json` file's contents** to one or more
URLs whenever it's saved — from **any** editor, on **any** OS.

This is the editor-agnostic successor to a Sublime Text plugin that did the same
thing only inside Sublime. Instead of hooking an editor, it watches the
filesystem, so it works the same whether you save from VS Code, Vim, JetBrains,
Sublime, or `echo > file.json`.

## Why a watcher

"Post on save" inside an editor only works in that editor. A filesystem watcher
is editor-independent: start the process, point it at a folder, and any `.json`
saved under that folder gets posted — no plugin, no editor API.

## Requirements

- Node.js **>= 20** (uses built-in `fetch` and `AbortSignal.timeout`).
  Developed and verified on Node 22.

## Install

```bash
# one-off, no install:
npx postjson-watch <dir>

# or install globally for a persistent `postjson-watch` command:
npm install -g postjson-watch
```

npm creates the right launcher on every platform (a shim on Windows, a symlink
on macOS/Linux), so `postjson-watch` just works everywhere.

## Usage

```bash
postjson-watch [dir] [options]        # watch a directory tree
postjson-watch --once <file>          # post one file and exit
```

| Option | Meaning |
|--------|---------|
| `-c, --config <path>` | Explicit config file |
| `-u, --url <url>` | Add a POST URL (repeatable; overrides config URLs) |
| `--timeout <ms>` | Per-URL timeout (default 10000) |
| `--debounce <ms>` | Save debounce (default 200) |
| `--once <file>` | Post a single file and exit; exit code is non-zero if any URL failed |
| `--dry-run` | Log what would be posted, send nothing |
| `-v, --verbose` | Extra logging |
| `-h, --help` / `--version` | Help / version |

Precedence: **CLI flags > config file > defaults.** The positional `[dir]`
overrides the config's `watch`.

## Configuration

Settings live in a `postjson.config.json`:

```json
{
  "watch": ".",
  "post_urls": [
    "http://localhost:8000/api/upload",
    "https://internal.vpn-only.example.com/api/upload"
  ],
  "timeout_ms": 10000,
  "debounce_ms": 200,
  "headers": { "Csrf-token": "nocheck" },
  "ignore": ["**/node_modules/**", "**/.git/**"]
}
```

- **`watch`** — the directory tree to watch, resolved **relative to the config
  file** (so the config is portable). A `[dir]` argument overrides it.
- **`post_urls`** — the list of endpoints. A bare `"post_url": "…"` string is
  also accepted; if both are present, `post_urls` wins.
- **`headers`** — merged onto the request. `Content-Type: application/json` is
  always sent and cannot be overridden; `Csrf-token: nocheck` is the default.
- **`ignore`** — extra glob-ish patterns to skip, on top of the built-in
  temp/backup ignores.

### Where config is found (first match wins)

1. `--config <path>`
2. `postjson.config.json` in the watched directory
3. `postjson.config.json` walking up from the current directory
4. User config dir:
   - macOS/Linux: `$XDG_CONFIG_HOME/postjson/config.json` or
     `~/.config/postjson/config.json`
   - Windows: `%APPDATA%\postjson\config.json`

If none is found and no `--url` is given, it prints an error and exits.

See [`postjson.config.example.json`](postjson.config.example.json).

## What gets posted

- **Only `.json` files** (case-insensitive) trigger a post. Other file types
  under the watched tree are ignored.
- The request body is the file's **raw bytes**, sent as-is. (The
  `application/json` header is sent regardless — the file is expected to contain
  JSON, but its contents are not re-serialized or validated.)
- Newly created files, including in newly created subdirectories, are picked up
  automatically.

## Output

Every save prints one line per URL — successes and failures alike, uniformly:

```
saved config/data.json
  ✓ http://localhost:8000/api/upload (200)
  ✗ https://internal.vpn-only.example.com/api/upload refused the connection
```

| Outcome | Line |
|---------|------|
| 2xx response | `✓ <url> (200)` |
| HTTP error status | `✗ <url> HTTP 500 — <body snippet>` |
| Timed out / refused / DNS failure / unreachable | `✗ <url> <reason>` |
| TLS/certificate failure | `✗ <url> failed TLS verification` |
| Bad URL / other | `✗ <url> <message>` |

**An unreachable endpoint is just a failure line — it never stops the watcher
and never stops the other URLs.** This is deliberate: you can list an endpoint
that's only reachable over a VPN alongside a local one, and when the VPN is off
the local endpoint keeps receiving saves while the VPN one simply logs
`refused the connection` / `timed out`. The watcher runs until you stop it
(Ctrl-C), whatever the endpoints do.

### `--once` exit codes

`postjson-watch --once file.json` posts once and exits **0** if every URL
succeeded, **1** if any failed. Useful in scripts and CI. (The long-running
watcher, by contrast, never exits on a failed post.)

## How saves are detected reliably

Editors save in different ways — in-place writes, atomic rename
(write-temp-then-`rename`), and backup+rename dances. postjson-watch uses
[chokidar](https://github.com/paulmillr/chokidar) with atomic-write handling and
"await write finish", plus a per-file debounce, so each save produces **exactly
one** post with the final file contents — no double-fires, no half-written
bodies. Temp/backup artifacts (`*.tmp`, `*~`, `*.swp`, emacs lock files, Vim's
probe file, dotfiles) are ignored.

## Project layout

```
bin/cli.js      # CLI: args, config resolution, watch vs --once, signals
src/config.js   # config discovery, load, validate, URL normalization
src/watcher.js  # chokidar wiring + save detection + debounce
src/http.js     # POST + outcome classification + human-readable reasons
src/post.js     # fan-out across URLs + one-line-per-URL reporting
```

## License

MIT
