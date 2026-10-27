const MIN_BURST_CHARS = 1;
const MAX_BURST_CHARS = 3;
const MIN_BURST_DELAY_MS = 1400;
const MAX_BURST_DELAY_MS = 5200;

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// One span per letter can make screen readers spell words out, so the letters
// are hidden from them and an intact, visually hidden copy stands in.
function split(zone) {
  const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

  const letters = [];
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const ch of node.textContent) {
      if (!ch.trim()) {
        frag.append(ch);
        continue;
      }
      const span = document.createElement("span");
      span.className = "glitch";
      span.textContent = ch;
      frag.append(span);
      letters.push(span);
    }
    node.replaceWith(frag);
  }

  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  visual.append(...zone.childNodes);
  const spoken = document.createElement("span");
  spoken.className = "sr-only";
  spoken.textContent = visual.textContent;
  zone.append(visual, spoken);
  return letters;
}

function burst(letters) {
  const span = MAX_BURST_CHARS - MIN_BURST_CHARS + 1;
  const count = MIN_BURST_CHARS + Math.floor(Math.random() * span);
  const picked = new Set();
  while (picked.size < Math.min(count, letters.length)) {
    picked.add(letters[Math.floor(Math.random() * letters.length)]);
  }
  for (const el of picked) {
    el.classList.remove("is-glitching");
    void el.offsetWidth;
    el.classList.add("is-glitching");
  }
}

function schedule(letters) {
  const delay =
    MIN_BURST_DELAY_MS +
    Math.random() * (MAX_BURST_DELAY_MS - MIN_BURST_DELAY_MS);
  setTimeout(() => {
    if (!document.hidden && !reduced.matches) burst(letters);
    schedule(letters);
  }, delay);
}

const letters = [...document.querySelectorAll("[data-glitch]")].flatMap(split);
for (const el of letters) {
  el.addEventListener("animationend", () =>
    el.classList.remove("is-glitching"),
  );
}
if (letters.length) schedule(letters);
