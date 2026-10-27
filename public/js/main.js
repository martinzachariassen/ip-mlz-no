import { copyText } from "./clipboard.js";
import { buildCells, groupCells, scramble } from "./scramble.js";

const PLACEHOLDER_IP = {
  v4: "203.0.113.42",
  v6: "2001:db8:cebd:8e40:1c2b:9f3a:44de:1",
};

const SHORTCUT_HINT = "press C to copy plain · R for CIDR";

const FETCH_TIMEOUT_MS = 15_000;

const TIMING = {
  boot: {
    v4: { duration: 900, charDuration: 380 },
    v6: { duration: 1200, charDuration: 260 },
  },
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
  failed: false,
  copyable: false,
  meta: "",
};

const params = new URLSearchParams(location.search);

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

function twoLineAdvance(ip) {
  const parts = ip.split(":");
  const widths = parts.map((g, i) =>
    gridAdvance(i < parts.length - 1 ? `${g}:` : g, "v6"),
  );
  const total = widths.reduce((a, b) => a + b, 0);
  let best = total;
  let head = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    head += widths[i];
    best = Math.min(best, Math.max(head, total - head));
  }
  return best;
}

function shownValue() {
  return state.failed
    ? { text: "0.0.0.0", size: "v4" }
    : { text: state.ip, size: state.family };
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

function render() {
  const { ip, family } = state;
  setCopyable(true);
  ipBtn.dataset.version = family;
  ipLabel.textContent = `Copy IP address ${ip}`;
  setMeta(SHORTCUT_HINT);
  scramble(ipText, ip, TIMING.boot[family]);
}

function renderFailure() {
  state.failed = true;
  measureAdvances();
  setCopyable(false);
  ipBtn.classList.add("is-failed");
  ipBtn.dataset.version = "v4";
  ipLabel.textContent = "IP address unavailable";
  setMeta("no route · can't see you from here");
  scramble(ipText, "0.0.0.0", { perpetual: true });
  announce("Could not determine your IP address");
}

function boot() {
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fetchIP().then(
    (ip) => {
      state.ip = ip;
      state.family = ip.includes(":") ? "v6" : "v4";
      measureAdvances();
      fontsReady.then(measureAdvances);
      render();
    },
    () => {
      renderFailure();
      fontsReady.then(measureAdvances);
    },
  );
}

boot();
