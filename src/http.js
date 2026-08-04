// The HTTP layer: post a body to a single URL and classify the outcome.
//
// We distinguish "the server answered with an error" from "there was no answer
// at all" because they mean different things (a bad status is a real failure; an
// unreachable host may just be an offline VPN endpoint). fetch's error model
// makes this non-obvious: a non-2xx response RESOLVES (with res.ok === false),
// while a genuine network failure REJECTS with a TypeError whose real cause is
// on err.cause. We recover the distinction by inspecting err.name and
// err.cause.code.
//
// Every result is printed uniformly by the caller — there is no "loud" vs
// "silent" routing here. Classification exists only to compose a readable line.

const DEFAULT_TIMEOUT_MS = 10000;

// Map a structured error code (or, as a fallback, a raw message) to a short
// human phrase. Driven off err.cause.code, which is far more reliable than
// parsing message text.
export function plainReason(code, fallbackMessage = "") {
  switch (code) {
    case "ECONNREFUSED":
      return "refused the connection";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "could not be resolved";
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
      return "timed out";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "is unreachable";
    case "ECONNRESET":
    case "UND_ERR_SOCKET":
      return "connection reset";
    default:
      break;
  }

  // TLS/certificate failures: the host IS reachable, the cert is the problem.
  // Node surfaces a family of codes for these; match the common ones plus the
  // ERR_TLS* / *CERT* shapes.
  if (
    code &&
    (code.startsWith("ERR_TLS") ||
      code.includes("CERT") ||
      code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      code === "SELF_SIGNED_CERT_IN_CHAIN")
  ) {
    return "failed TLS verification";
  }

  if (code === "ERR_INVALID_URL") {
    return "invalid URL";
  }

  // Last resort: fall back to fuzzy message matching so exotic causes that
  // carry no recognizable code still read reasonably.
  const text = String(fallbackMessage).toLowerCase();
  if (text.includes("timed out") || text.includes("timeout")) return "timed out";
  if (text.includes("refused")) return "refused the connection";
  if (
    text.includes("nodename") ||
    text.includes("name or service") ||
    text.includes("getaddrinfo")
  )
    return "could not be resolved";
  if (text.includes("certificate") || text.includes("ssl"))
    return "failed TLS verification";
  if (text.includes("no route") || text.includes("unreachable"))
    return "is unreachable";

  return fallbackMessage ? String(fallbackMessage) : "failed";
}

// Turn a rejected fetch into a result object. Never throws.
export function classifyRejection(err) {
  // AbortSignal.timeout() fires a TimeoutError; older/edge shapes use
  // AbortError. Either way it means we gave up waiting — no response.
  if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return { kind: "unreachable", reason: "timed out" };
  }

  // A network-level failure: fetch rejects with a TypeError and the real
  // detail hangs off .cause.
  const cause = err && err.cause ? err.cause : err;
  const code = cause && cause.code ? cause.code : undefined;
  const message = (cause && cause.message) || (err && err.message) || String(err);

  // Config mistakes (bad URL) are our fault, not the network's.
  if (code === "ERR_INVALID_URL") {
    return { kind: "error", reason: plainReason(code, message) };
  }

  return { kind: "unreachable", reason: plainReason(code, message) };
}

// POST `body` (a string of raw file contents) to `url`.
// Returns one of:
//   { kind: "ok",          status, body }   2xx
//   { kind: "http_error",  status, body }   server answered with an error status
//   { kind: "unreachable", reason }         no response (timeout/refused/DNS/TLS/…)
//   { kind: "error",       reason }          anything else (e.g. bad URL)
// Never throws.
export async function send(url, body, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Content-Type is always forced to application/json; any configured headers
  // layer on top, but cannot override the content type.
  const headers = {
    "Csrf-token": "nocheck",
    ...(opts.headers || {}),
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }

    if (res.ok) {
      return { kind: "ok", status: res.status, body: text.slice(0, 200) };
    }
    return { kind: "http_error", status: res.status, body: text.slice(0, 200) };
  } catch (err) {
    return classifyRejection(err);
  }
}
