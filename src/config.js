// Config discovery, loading, validation, and URL normalization.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_NAME = "postjson.config.json";

// The user-level config directory, used as the global fallback when no config
// is found nearer the working directory.
function userConfigPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "postjson", "config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "postjson", "config.json");
}

function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Find a config file, first match wins:
//   1. explicit --config
//   2. postjson.config.json in the watched dir (if one was given)
//   3. walk up from cwd to the filesystem root
//   4. the user config dir
// Returns an absolute path, or null if none found.
export function discoverConfig({ explicit, watchDir, cwd = process.cwd() } = {}) {
  if (explicit) {
    const abs = path.resolve(cwd, explicit);
    if (!existsFile(abs)) {
      throw new Error(`Config file not found: ${abs}`);
    }
    return abs;
  }

  if (watchDir) {
    const inWatch = path.join(path.resolve(cwd, watchDir), CONFIG_NAME);
    if (existsFile(inWatch)) return inWatch;
  }

  let dir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (existsFile(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const userCfg = userConfigPath();
  if (existsFile(userCfg)) return userCfg;

  return null;
}

// Read and parse a config file. `watch` is resolved relative to the config
// file's own directory so a config is portable regardless of cwd.
export function loadConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw new Error(`Could not read config ${configPath}: ${err.message}`);
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Config ${configPath} is not valid JSON: ${err.message}`);
  }

  const configDir = path.dirname(configPath);
  const watch = cfg.watch ? path.resolve(configDir, cfg.watch) : configDir;

  return {
    _path: configPath,
    watch,
    post_urls: cfg.post_urls,
    post_url: cfg.post_url,
    timeout_ms: cfg.timeout_ms,
    debounce_ms: cfg.debounce_ms,
    headers: cfg.headers,
    ignore: cfg.ignore,
  };
}

// Resolve the effective URL list:
// CLI urls win; else post_urls (a bare string is coerced to one element);
// else the singular post_url. Empty entries are dropped, order preserved.
export function normalizeUrls(cfg = {}, cliUrls = []) {
  if (cliUrls && cliUrls.length) {
    return cliUrls.filter(Boolean);
  }

  let urls = cfg.post_urls;
  if (typeof urls === "string") urls = [urls];
  if (Array.isArray(urls)) {
    const filtered = urls.filter(Boolean);
    // An empty (or all-empty) post_urls falls through to the singular post_url,
    // so an accidentally-blank list doesn't silently disable posting.
    if (filtered.length) return filtered;
  }

  if (cfg.post_url) return [cfg.post_url];

  return [];
}

// Merge config + CLI flags into the final resolved options. CLI wins.
export function resolveOptions(cfg, cli = {}) {
  const watch = cli.watchDir ? path.resolve(process.cwd(), cli.watchDir) : cfg.watch;
  return {
    watch,
    urls: normalizeUrls(cfg, cli.urls),
    timeoutMs: cli.timeout ?? cfg.timeout_ms ?? 10000,
    debounceMs: cli.debounce ?? cfg.debounce_ms ?? 200,
    headers: cfg.headers || {},
    ignore: cfg.ignore || [],
    dryRun: !!cli.dryRun,
    verbose: !!cli.verbose,
  };
}

// Validate resolved options for a watch run. Throws a readable error on the
// first problem so we never start a watcher against a broken config.
export function validateForWatch(opts) {
  if (!opts.urls.length) {
    throw new Error(
      "No POST URL configured. Add post_urls to a config file or pass --url."
    );
  }
  for (const u of opts.urls) {
    try {
      new URL(u);
    } catch {
      throw new Error(`Invalid URL in configuration: ${u}`);
    }
  }
  let stat;
  try {
    stat = fs.statSync(opts.watch);
  } catch {
    throw new Error(`Watch path does not exist: ${opts.watch}`);
  }
  // A directory (watched recursively) or a single file are both valid. Watching
  // one file is the way to avoid a git checkout — which rewrites many files at
  // once — triggering a burst of posts: point the watcher only at the file you
  // actually edit.
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new Error(`Watch path is neither a file nor a directory: ${opts.watch}`);
  }
  if (stat.isFile() && !opts.watch.toLowerCase().endsWith(".json")) {
    throw new Error(`Watch path is a file but not a .json file: ${opts.watch}`);
  }
}
