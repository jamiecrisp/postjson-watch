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

## Install

This tool runs on **Node.js** (a program for running JavaScript outside a
browser). If you've never used Node or a terminal before, follow every step
below in order — you only do the setup once.

Everything happens in a **terminal** (a text window where you type commands):

- **macOS** — open **Terminal** (press `Cmd+Space`, type "Terminal", hit Enter).
- **Windows** — open **PowerShell** (press the Start button, type "PowerShell",
  hit Enter).
- **Linux** — open your terminal app (often `Ctrl+Alt+T`).

Throughout, "run a command" means type it into that window and press Enter.

### Step 1 — Install Node.js (version 20 or newer)

First check whether you already have it. Run:

```bash
node --version
```

If that prints something like `v20.x.x` or `v22.x.x`, you're done — skip to
Step 2. If it says "command not found" (or a version below 20), install it:

- **macOS / Windows** — go to **<https://nodejs.org>**, download the **LTS**
  installer, open it, and click through with the default options. When it
  finishes, **close and reopen your terminal**, then run `node --version` again
  to confirm.

- **Linux (Debian/Ubuntu)** — the version in the default package manager is
  often too old. Install a current one with:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

  (Other distributions: install the `nodejs` package version 20+ from your
  package manager, or use [nvm](https://github.com/nvm-sh/nvm).)

Installing Node also installs **npm** and **npx**, two helper commands used
below. You don't need to install those separately.

### Step 2 — Get postjson-watch

There are two ways to download the code. **Pick one.** Option A needs no extra
tools; Option B uses git if you have it (or don't mind installing it).

#### Option A — Download a ZIP (no git needed)

1. Open **<https://github.com/jamiecrisp/postjson-watch>** in your browser.
2. Click the green **`< > Code`** button, then **Download ZIP**.
   (Direct link: <https://github.com/jamiecrisp/postjson-watch/archive/refs/heads/main.zip>)
3. **Unzip** the downloaded file:
   - **macOS** — double-click the `.zip` in Finder.
   - **Windows** — right-click the `.zip` → **Extract All…**.
   - **Linux** — double-click it, or run `unzip postjson-watch-main.zip`.
4. You'll get a folder named **`postjson-watch-main`**. In your terminal, move
   into it — the easiest way is to type `cd ` (with a trailing space) and then
   **drag the folder from your file manager onto the terminal window**, which
   pastes its path, then press Enter. For example:

   ```bash
   cd ~/Downloads/postjson-watch-main
   ```

Then continue to "**Install the dependencies**" below.

#### Option B — Clone with git

Requires [git](https://git-scm.com). Check with `git --version`; if it's
missing, install it from <https://git-scm.com/downloads> (or, on macOS, running
`git --version` once will offer to install it for you).

```bash
git clone https://github.com/jamiecrisp/postjson-watch.git
cd postjson-watch
```

#### Install the dependencies

Whichever option you used, you should now be **inside the project folder** in
your terminal. Run:

```bash
npm install
```

This downloads the one library the tool needs and creates a `node_modules`
folder — that's normal, and you never edit it.

> **Note for ZIP users:** the folder is named `postjson-watch-main` (not
> `postjson-watch`), and updating later means downloading a fresh ZIP and
> running `npm install` again. With git (Option B) you can update in place with
> `git pull`. Everything else works identically.

### Step 3 — Run it

From inside the `postjson-watch` folder, run the tool with `node`:

```bash
node bin/cli.js --help
```

If you see the help text, everything works. See **Usage** below for real
commands. Whenever you run it, either be inside the `postjson-watch` folder and
use `node bin/cli.js …`, or use the full path
`node /path/to/postjson-watch/bin/cli.js …`.

#### Optional: a shorter `postjson-watch` command

If you'd like to type `postjson-watch` from anywhere instead of
`node bin/cli.js`, run this once from inside the folder:

```bash
npm install -g .
```

After that, `postjson-watch --help` works in any directory. (On some systems the
global install needs elevated permissions — if it fails with a permissions
error, either prefix it with `sudo` on macOS/Linux, or just keep using
`node bin/cli.js`, which needs no special setup.)

### Requirements at a glance

- **Node.js 20 or newer** (uses built-in `fetch` and `AbortSignal.timeout`;
  developed and verified on Node 22).
- **git**, to download the code.

## Usage

> The examples below write `postjson-watch`, which works if you did the optional
> global install in Step 3. If you didn't, replace `postjson-watch` with
> `node bin/cli.js` (run from inside the `postjson-watch` folder) — everything
> else is identical.

```bash
postjson-watch [dir] [options]        # watch a directory tree
postjson-watch --once <file>          # post one file and exit
```

A complete first run, watching the current folder and posting to a local server:

```bash
postjson-watch . --url http://localhost:8000/api/upload
```

Leave it running; every `.json` you save under that folder is posted. Press
`Ctrl+C` to stop.

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
