export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without the async Clipboard API. Selecting the
    // textarea moves focus, so hand it back afterwards — otherwise a
    // keyboard user is dropped back to the top of the page.
    const previous = document.activeElement;
    const ta = document.createElement("textarea");
    try {
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:absolute;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      ta.remove();
      if (previous instanceof HTMLElement) {
        previous.focus({ preventScroll: true });
      }
    }
  }
}
