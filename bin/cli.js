#!/usr/bin/env node
// postjson-watch — watch a directory tree and POST .json files on save.
//
// Usage:
//   postjson-watch [dir] [options]
//   postjson-watch --once <file> [options]

import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";

import {
  discoverConfig,
  loadConfig,
  resolveOptions,
  validateForWatch,
} from "../src/config.js";
import { startWatcher } from "../src/watcher.js";
import { postToUrls, anyFailed } from "../src/post.js";

const HELP = `postjson-watch — POST .json files as their contents when saved, from any editor.

Usage:
  postjson-watch [dir] [options]        watch a directory tree
  postjson-watch --once <file>          post one file and exit

Options:
  -c, --config <path>   explicit config file
  -u, --url <url>       add a POST URL (repeatable; overrides config urls)
      --timeout <ms>    per-URL timeout (default 10000)
      --debounce <ms>   save debounce (default 200)
      --once <file>     post a single file and exit (non-zero if any URL fails)
      --dry-run         log what would be posted, send nothing
  -v, --verbose         extra logging
  -h, --help            show this help
      --version         show version

Config discovery (first match wins):
  --config → postjson.config.json in the watched dir → walking up from cwd
  → user config dir. See postjson.config.example.json.
`;

function readVersion() {
  try {
    const pkgPath = path.join(import.meta.dirname, "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  } catch {
    return "unknown";
  }
}

function parse() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", short: "c" },
      url: { type: "string", short: "u", multiple: true },
      timeout: { type: "string" },
      debounce: { type: "string" },
      once: { type: "string" },
      "dry-run": { type: "boolean" },
      verbose: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });

  const num = (v) => (v === undefined ? undefined : Number(v));
  return {
    values,
    watchDir: positionals[0],
    cli: {
      urls: values.url || [],
      timeout: num(values.timeout),
      debounce: num(values.debounce),
      dryRun: values["dry-run"],
      verbose: values.verbose,
    },
  };
}

async function main() {
  let parsed;
  try {
    parsed = parse();
  } catch (err) {
    console.error(`Error: ${err.message}\n`);
    process.stderr.write(HELP);
    process.exit(2);
  }
  const { values, watchDir, cli } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    console.log(readVersion());
    return;
  }

  // Load config (discovery is scoped to the watched dir when one was given).
  let cfg = {};
  try {
    const configPath = discoverConfig({ explicit: values.config, watchDir });
    if (configPath) {
      cfg = loadConfig(configPath);
      if (cli.verbose) console.log(`Config: ${configPath}`);
    } else if (cli.verbose) {
      console.log("Config: none found (using flags/defaults)");
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  const opts = resolveOptions(cfg, { ...cli, watchDir });

  // --once: post a single file and exit, bypassing the watcher entirely.
  if (values.once) {
    await runOnce(values.once, opts);
    return;
  }

  await runWatch(opts);
}

async function runOnce(file, opts) {
  if (!opts.urls.length) {
    console.error("Error: No POST URL configured. Pass --url or add a config.");
    process.exit(2);
  }
  const abs = path.resolve(process.cwd(), file);
  let contents;
  try {
    contents = fs.readFileSync(abs, "utf8");
  } catch (err) {
    console.error(`Error: could not read ${abs}: ${err.message}`);
    process.exit(2);
  }

  console.log(`Posting ${path.basename(abs)} to ${opts.urls.length} URL(s):`);
  const results = await postToUrls(opts.urls, contents, opts);
  process.exit(anyFailed(results) ? 1 : 0);
}

async function runWatch(opts) {
  try {
    validateForWatch(opts);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  // Banner — printing the resolved URL count up front makes a misconfigured
  // config (e.g. a URL that isn't being read) obvious immediately.
  console.log(`postjson-watch — watching ${opts.watch}`);
  console.log(`  ${opts.urls.length} URL(s), ${opts.timeoutMs}ms timeout:`);
  for (const u of opts.urls) console.log(`    · ${u}`);
  if (opts.dryRun) console.log("  (dry run — nothing will actually be posted)");
  console.log("  Ctrl-C to stop.\n");

  // Label saves relative to the watch root. When the root is a single file,
  // relative(file, file) is "", so use the file's own name instead.
  const onSaved = async (absPath, contents) => {
    const label = path.relative(opts.watch, absPath) || path.basename(absPath);
    console.log(`saved ${label}`);
    await postToUrls(opts.urls, contents, opts);
  };

  const watcher = startWatcher(opts.watch, opts, onSaved);

  const shutdown = () => {
    console.log("\nStopping.");
    watcher.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`Fatal: ${err.stack || err.message}`);
  process.exit(1);
});
