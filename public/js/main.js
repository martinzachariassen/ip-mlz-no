import { copyText } from "./clipboard.js";
import { BITS, buildCells, groupCells, HEX, scramble } from "./scramble.js";

const PLACEHOLDER_IP = {
  v4: "203.0.113.42",
  v6: "2001:db8:cebd:8e40:1c2b:9f3a:44de:1",
};

const SHORTCUT_HINT = "press C to copy plain · R for CIDR";

const DEFAULT_TITLE = document.title;

const FETCH_TIMEOUT_MS = 15_000;
const REFRESH_MIN_MS = 10_000;

const TIMING = {
  boot: {
    v4: { duration: 900, charDuration: 380 },
    v6: { duration: 1200, charDuration: 260 },
  },
  format: { duration: 650, charDuration: 220 },
};

const FORMATS = {
  hex: { key: "h", name: "hex", pool: HEX },
  bin: { key: "b", name: "binary", pool: BITS },
};

// Width measured at this size becomes the em multiplier behind --adv4/--adv6.
const RULER_PX = 100;

const ipBtn = document.getElementById("ip");
const ipText = document.getElementById("ip-text");
const ipLabel = document.getElementById("ip-label");
const metaEl = document.getElementById("meta");
const metaText = document.getElementById("meta-text");
const statusEl = document.getElementById("status");
const curlBtn = document.getElementById("curl");
const curlCmd = document.getElementById("curl-cmd");
const heroEl = document.querySelector(".hero");

const rootStyle = getComputedStyle(document.documentElement);
const EXIT_MS = parseFloat(rootStyle.getPropertyValue("--ip-exit")) || 0;
const EASE = rootStyle.getPropertyValue("--ease").trim() || "ease-out";
const ENTER_MS = 220;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  ip: "",
  family: "v4",
  format: "plain",
  failed: false,
  copyable: false,
  meta: "",
};

const params = new URLSearchParams(location.search);
const live = !["v4", "v6", "fail"].some((p) => params.has(p));

async function fetchIP() {
  if (params.has("fail")) throw new Error("forced failure");
  if (params.has("v6")) return PLACEHOLDER_IP.v6;
  if (params.has("v4")) return PLACEHOLDER_IP.v4;

  const res = await fetch("/ip", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`/ip responded ${res.status}`);
  const ip = (await res.text()).trim();
  if (!ip) throw new Error("/ip returned no address");
  return ip;
}

function expandV6(ip) {
  let s = ip.toLowerCase();
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = `${s.slice(0, -v4[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === null ? [] : Array(8 - h.length - t.length).fill("0");
  return [...h, ...fill, ...t].map((g) => g.padStart(4, "0")).join(":");
}

function formatIP(ip, family, format) {
  if (format === "plain") return ip;
  if (family === "v6") return expandV6(ip);
  const [radix, width] = format === "hex" ? [16, 2] : [2, 8];
  return ip
    .split(".")
    .map((o) => Number(o).toString(radix).padStart(width, "0"))
    .join(".");
}

function metaFor() {
  if (state.format === "plain") return SHORTCUT_HINT;
  const f = FORMATS[state.format];
  return `${f.name} · ${f.key.toUpperCase()} to go back`;
}

function setCopyable(copyable) {
  state.copyable = copyable;
  if (copyable) ipBtn.dataset.copyable = "";
  else delete ipBtn.dataset.copyable;
}

function dropPointerFocus(e) {
  if (e.detail > 0) e.currentTarget.blur();
}

let announceTimer;
function announce(message) {
  clearTimeout(announceTimer);
  statusEl.textContent = "";
  announceTimer = setTimeout(() => {
    statusEl.textContent = message;
  }, 100);
}

let metaToken = 0;
let metaRevertTimer;
let metaAnim;

function setMeta(text) {
  clearTimeout(metaRevertTimer);
  metaToken++;
  metaAnim?.cancel();
  delete metaEl.dataset.copied;
  state.meta = text;
  metaText.textContent = text;
}

function swapMeta(text, copied) {
  const token = ++metaToken;
  const shift = reduced.matches ? 0 : 3;
  const now = getComputedStyle(metaText);
  const from = { opacity: now.opacity, translate: now.translate };
  metaAnim?.cancel();
  metaAnim = metaText.animate(
    [from, { opacity: 0, translate: `0 ${-shift}px` }],
    {
      duration: EXIT_MS,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards",
    },
  );
  metaAnim.finished.then(
    () => {
      if (token !== metaToken) return;
      metaText.textContent = text;
      if (copied) metaEl.dataset.copied = "";
      else delete metaEl.dataset.copied;
      metaAnim.cancel();
      // Touch devices hide the hint in CSS; end where CSS will leave it.
      const target = getComputedStyle(metaText).opacity;
      metaAnim = metaText.animate(
        [
          { opacity: 0, translate: `0 ${shift}px` },
          { opacity: target, translate: "0 0" },
        ],
        { duration: ENTER_MS, easing: EASE },
      );
    },
    () => {},
  );
}

function flashMeta(text) {
  clearTimeout(metaRevertTimer);
  swapMeta(text, true);
  metaRevertTimer = setTimeout(() => swapMeta(state.meta, false), 1500);
}

function changeMeta(text) {
  clearTimeout(metaRevertTimer);
  state.meta = text;
  swapMeta(text, false);
}

let copyTimer;
async function copyValue(text, confirmText, announceText) {
  if (!state.copyable) return;

  ipBtn.dataset.copied = "";
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    delete ipBtn.dataset.copied;
  }, 1500);

  const ok = await copyText(text);
  flashMeta(ok ? confirmText : "copy failed");
  announce(ok ? announceText : "Copy failed");
}

function copyIP() {
  return copyValue(state.ip, "copied to clipboard", "IP address copied");
}

function copyCIDR() {
  const cidr = `${state.ip}/${state.family === "v6" ? 128 : 32}`;
  return copyValue(cidr, `copied ${cidr}`, "IP address copied as CIDR");
}

let curlTimer;
async function copyCurl() {
  const cmd = curlCmd.textContent;
  curlBtn.dataset.copied = "";
  clearTimeout(curlTimer);
  curlTimer = setTimeout(() => {
    delete curlBtn.dataset.copied;
  }, 1500);

  const ok = await copyText(cmd);
  flashMeta(ok ? `copied ${cmd}` : "copy failed");
  announce(ok ? "Command copied" : "Copy failed");
}

function setFormat(format) {
  if (state.failed || !state.ip || format === state.format) return;
  if (format === "bin" && state.family === "v6") {
    flashMeta("128 bits won't fit");
    return;
  }
  state.format = format;
  show(TIMING.format);
  changeMeta(metaFor());
  announce(
    format === "plain"
      ? `Showing ${state.ip}`
      : `Showing the address in ${FORMATS[format].name}`,
  );
}

ipBtn.addEventListener("click", dropPointerFocus);
ipBtn.addEventListener("click", copyIP);
curlBtn.addEventListener("click", dropPointerFocus);
curlBtn.addEventListener("click", copyCurl);

document.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

  const t = e.target;
  if (
    t instanceof HTMLElement &&
    (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))
  ) {
    return;
  }

  // `key` can be missing on synthetic keydowns (e.g. Chrome autofill).
  const key = e.key?.toLowerCase();
  if (key === "c") {
    e.preventDefault();
    copyIP();
  } else if (key === "r") {
    e.preventDefault();
    copyCIDR();
  } else if (key === "escape") {
    setFormat("plain");
  } else {
    const format = Object.keys(FORMATS).find((f) => FORMATS[f].key === key);
    if (!format) return;
    e.preventDefault();
    setFormat(state.format === format ? "plain" : format);
  }
});

const rulerBox = document.createElement("span");
rulerBox.className = "ip-display";
rulerBox.setAttribute("aria-hidden", "true");
rulerBox.style.cssText =
  "position:absolute;left:-9999px;top:0;visibility:hidden;" +
  `font-size:${RULER_PX}px;height:auto;max-width:none;padding:0;`;

const ruler = document.createElement("span");
ruler.className = "ip-text";
ruler.style.cssText = "flex-wrap:nowrap;max-width:none;";
rulerBox.appendChild(ruler);
heroEl.appendChild(rulerBox);

function advanceOf(version, cells) {
  rulerBox.dataset.version = version;
  ruler.replaceChildren(...groupCells(cells));
  return ruler.getBoundingClientRect().width / RULER_PX;
}

const gridAdvance = (text, version) => advanceOf(version, buildCells(text));

function twoLineAdvance(text) {
  const parts = text.match(/[^.:]*[.:]|[^.:]+$/g);
  const widths = parts.map((part) => gridAdvance(part, "v6"));
  const total = widths.reduce((a, b) => a + b, 0);
  let best = total;
  let head = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    head += widths[i];
    best = Math.min(best, Math.max(head, total - head));
  }
  return best;
}

// Long forms (v6, binary v4) share the v6 size cap and narrow-screen wrap.
function shownValue() {
  if (state.failed) return { text: "0.0.0.0", size: "v4" };
  const text = formatIP(state.ip, state.family, state.format);
  const size = state.family === "v6" || state.format === "bin" ? "v6" : "v4";
  return { text, size, pool: FORMATS[state.format]?.pool };
}

function measureAdvances() {
  const value = shownValue();
  const advance = gridAdvance(value.text, value.size);
  const showingV6 = value.size === "v6";

  const set = (name, val) => heroEl.style.setProperty(name, val.toFixed(4));

  heroEl.dataset.v6 = showingV6 ? "address" : "none";
  if (showingV6) {
    set("--adv6", advance);
    set("--adv6h", twoLineAdvance(value.text));
  } else {
    set("--adv4", advance);
    heroEl.style.removeProperty("--adv6");
    heroEl.style.removeProperty("--adv6h");
  }
}

function show(timing) {
  const { text, size, pool } = shownValue();
  ipBtn.dataset.version = size;
  measureAdvances();
  return scramble(ipText, text, { ...timing, pool });
}

function render(ip, { changed = false } = {}) {
  state.ip = ip;
  state.family = ip.includes(":") ? "v6" : "v4";
  state.failed = false;
  if (state.family === "v6" && state.format === "bin") state.format = "plain";

  ipBtn.classList.remove("is-failed");
  setCopyable(true);
  ipLabel.textContent = `Copy IP address ${ip}`;
  document.title = `${ip} · ip.mlz.no`;
  show(TIMING.boot[state.family]);

  if (changed) {
    state.meta = metaFor();
    flashMeta("address changed");
    announce(`Your IP address changed to ${ip}`);
  } else {
    setMeta(metaFor());
  }
}

function renderFailure() {
  state.failed = true;
  setCopyable(false);
  ipBtn.classList.add("is-failed");
  ipBtn.dataset.version = "v4";
  ipLabel.textContent = "IP address unavailable";
  document.title = DEFAULT_TITLE;
  measureAdvances();
  setMeta("no route · can't see you from here");
  scramble(ipText, "0.0.0.0", { perpetual: true });
  announce("Could not determine your IP address");
}

let lastCheck = 0;
let checking = false;

async function refresh() {
  if (!live || checking || document.hidden) return;
  if (performance.now() - lastCheck < REFRESH_MIN_MS) return;
  checking = true;
  lastCheck = performance.now();
  try {
    const ip = await fetchIP();
    if (state.failed || ip !== state.ip) render(ip, { changed: true });
  } catch {
    // A failed recheck keeps the last address; the next one may succeed.
  } finally {
    checking = false;
  }
}

function boot() {
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  lastCheck = performance.now();
  fetchIP().then(
    (ip) => {
      render(ip);
      fontsReady.then(measureAdvances);
    },
    () => {
      renderFailure();
      fontsReady.then(measureAdvances);
    },
  );

  document.addEventListener("visibilitychange", refresh);
  addEventListener("online", refresh);
  navigator.connection?.addEventListener?.("change", refresh);
}

boot();
