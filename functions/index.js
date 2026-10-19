const { isIP } = require("node:net");
const { onRequest } = require("firebase-functions/v2/https");

exports.ip = onRequest(
  {
    region: "europe-west1",
    cors: false,
    concurrency: 250,
    // Keeps the in-memory rate limit flat and is the real cost ceiling:
    // raising it loosens the limit by the same factor.
    maxInstances: 1,
    memory: "256MiB",
    timeoutSeconds: 10,
    minInstances: 0,
  },
  (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.set("Allow", "GET, HEAD");
      res.status(405).type("text/plain").send("method not allowed\n");
      return;
    }

    const forwarded = req.headers["x-forwarded-for"];
    const address = normalize(
      (Array.isArray(forwarded) ? forwarded[0] : (forwarded ?? ""))
        .split(",")[0]
        .trim() ||
        req.socket?.remoteAddress ||
        (process.env.FUNCTIONS_EMULATOR === "true" ? "127.0.0.1" : ""),
    );

    res.set("Cache-Control", "no-store, private");
    res.set("Vary", "Accept");
    res.set("X-Robots-Tag", "noindex");

    if (!address) {
      respond(req, res, 502, { error: "could not determine address" });
      return;
    }

    const retryAfter = rateLimit(address);
    if (retryAfter !== null) {
      res.set("Retry-After", String(retryAfter));
      respond(req, res, 429, { error: "too many requests" });
      return;
    }

    const family = isIP(address) === 6 ? "v6" : "v4";
    respond(req, res, 200, { ip: address, family });
  },
);

const MAX_ADDRESS_LENGTH = 45;

// X-Forwarded-For is caller-controlled on the raw Cloud Run URL. Validating
// keeps junk from being echoed and bounds every rate-limit key to 45 bytes.
function normalize(raw) {
  if (raw.length > MAX_ADDRESS_LENGTH || isIP(raw) === 0) return "";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : raw;
}

function respond(req, res, status, body) {
  res.status(status);
  if ((req.headers.accept || "").includes("application/json")) {
    res.json(body);
  } else {
    const text = body.error ? `error: ${body.error}` : body.ip;
    res.type("text/plain").send(`${text}\n`);
  }
}

const WINDOW_MS = 60_000;
const WINDOW_MAX = 20;
// Past the cap new addresses go untracked (fail open) so a flood from many
// addresses can't OOM the instance.
const MAX_TRACKED = 20_000;

let windowStart = Date.now();
let hits = new Map();

function rateLimit(address) {
  // The emulator has no front end setting X-Forwarded-For, so local traffic
  // and CI polling would otherwise limit themselves.
  if (
    process.env.FUNCTIONS_EMULATOR === "true" &&
    (address === "127.0.0.1" || address === "::1")
  ) {
    return null;
  }

  const now = Date.now();

  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    hits = new Map();
  }

  const count = hits.get(address);

  if (count === undefined) {
    if (hits.size < MAX_TRACKED) hits.set(address, 1);
    return null;
  }

  if (count >= WINDOW_MAX) {
    return Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
  }

  hits.set(address, count + 1);
  return null;
}
