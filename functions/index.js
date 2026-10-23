const { isIP } = require("node:net");
const { onRequest } = require("firebase-functions/v2/https");

exports.ip = onRequest(
  {
    region: "europe-west1",
    cors: false,
    concurrency: 250,
    // The real cost ceiling.
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
    res.set("X-Robots-Tag", "noindex");
    res.type("text/plain");

    if (!address) {
      res.status(502).send("error: could not determine address\n");
      return;
    }

    res.send(`${address}\n`);
  },
);

// X-Forwarded-For is caller-controlled on the raw Cloud Run URL, so anything
// that isn't an address must not be echoed.
function normalize(raw) {
  if (isIP(raw) === 0) return "";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : raw;
}
