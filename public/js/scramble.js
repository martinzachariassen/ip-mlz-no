export const DIGITS = "0123456789";
export const HEX = "0123456789abcdef";
export const BITS = "01";
const SEPARATOR = /[.:]/;

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

const frames = new WeakMap();

export function groupCells(cells) {
  const groups = [];
  let group = null;
  for (const cell of cells) {
    if (!group) {
      group = document.createElement("span");
      group.className = "group";
      groups.push(group);
    }
    group.appendChild(cell);
    if (cell.classList.contains("sep")) group = null;
  }
  return groups;
}

export function buildCells(target) {
  return [...target].map((ch, i) => {
    const span = document.createElement("span");
    span.className = SEPARATOR.test(ch) ? "cell sep" : "cell";
    span.style.setProperty("--i", i);
    span.textContent = ch;
    return span;
  });
}

export function scramble(el, target, opts = {}) {
  const {
    duration = 900,
    charDuration = 380,
    churn = 50,
    hold = 80,
    perpetual = false,
    pool = /[a-f]/i.test(target) ? HEX : DIGITS,
  } = opts;

  cancelAnimationFrame(frames.get(el));

  const chars = [...target];
  const n = chars.length;

  const cells = buildCells(target);
  el.replaceChildren(...groupCells(cells));

  delete el.dataset.scrambling;

  if (reduced.matches) {
    if (perpetual) {
      cells.forEach((c) => {
        c.classList.add("is-scrambling");
      });
    }
    return Promise.resolve();
  }

  const live = [];
  for (let i = 0; i < n; i++) if (!SEPARATOR.test(chars[i])) live.push(i);
  const m = live.length;

  const span = Math.max(0, duration - hold - charDuration);
  const stagger = m > 1 ? span / (m - 1) : 0;

  const slot = new Array(n).fill(null);
  live.forEach((idx, k) => {
    const start = hold + k * stagger;
    slot[idx] = { start, end: start + charDuration };
  });

  const total = hold + (m - 1) * stagger + charDuration;
  const glyph = new Array(n).fill("");
  let lastChurn = -Infinity;
  let t0 = 0;

  el.dataset.scrambling = "";

  return new Promise((resolve) => {
    const step = (now) => {
      if (!t0) t0 = now;
      const t = now - t0;
      const reroll = t - lastChurn >= churn;
      if (reroll) lastChurn = t;

      for (let i = 0; i < n; i++) {
        const s = slot[i];
        if (!s) continue;

        const locked = !perpetual && t >= s.end;
        if (locked) {
          if (cells[i].textContent !== chars[i])
            cells[i].textContent = chars[i];
          cells[i].classList.remove("is-scrambling");
          continue;
        }

        if (perpetual || t >= s.start) {
          if (reroll || !glyph[i]) {
            let c;
            do {
              c = pool[(Math.random() * pool.length) | 0];
            } while (c === chars[i] && pool.length > 1);
            glyph[i] = c;
          }
          if (cells[i].textContent !== glyph[i])
            cells[i].textContent = glyph[i];
          cells[i].classList.add("is-scrambling");
        }
      }

      if (perpetual || t < total) {
        frames.set(el, requestAnimationFrame(step));
      } else {
        cells.forEach((c, i) => {
          c.textContent = chars[i];
          c.classList.remove("is-scrambling");
        });
        // A frame later, so the last cells to lock still start without delay.
        frames.set(
          el,
          requestAnimationFrame(() => {
            delete el.dataset.scrambling;
          }),
        );
        resolve();
      }
    };
    frames.set(el, requestAnimationFrame(step));
  });
}
