// Fan a body out to every configured URL and print one line per outcome.
//
// Reporting is deliberately uniform: success, HTTP error, TLS error and
// unreachable endpoints all print the same way (a "✓" or "✗" line per URL).
// The Sublime plugin's loud-dialog/silent-status-bar split existed only to
// avoid a modal popup; a terminal has no modal to suppress, so there is nothing
// to route around.

import { send } from "./http.js";

// Compose the single line shown for one URL's result.
export function formatResult(url, result) {
  switch (result.kind) {
    case "ok":
      return `  ✓ ${url} (${result.status})`;
    case "http_error": {
      const snippet = result.body ? ` — ${oneLine(result.body)}` : "";
      return `  ✗ ${url} HTTP ${result.status}${snippet}`;
    }
    case "unreachable":
    case "error":
    default:
      return `  ✗ ${url} ${result.reason}`;
  }
}

function oneLine(s) {
  const flat = String(s).replace(/\s+/g, " ").trim();
  return flat.length > 120 ? flat.slice(0, 117) + "…" : flat;
}

// Post `body` to every url. All URLs are attempted; one failing never stops the
// others. Returns [{ url, result }] so callers (e.g. --once) can derive an exit
// code. `log` is injectable for testing; defaults to console.log.
export async function postToUrls(urls, body, opts = {}) {
  const log = opts.log || ((line) => console.log(line));

  if (opts.dryRun) {
    log(`  (dry run) would post ${body.length} bytes to ${urls.length} URL(s):`);
    for (const url of urls) log(`    · ${url}`);
    return urls.map((url) => ({ url, result: { kind: "dry-run" } }));
  }

  const results = await Promise.all(
    urls.map(async (url) => ({ url, result: await send(url, body, opts) }))
  );

  for (const { url, result } of results) {
    log(formatResult(url, result));
  }

  return results;
}

// True if any result represents a failure — used for --once exit codes.
export function anyFailed(results) {
  return results.some(({ result }) => result.kind !== "ok" && result.kind !== "dry-run");
}
