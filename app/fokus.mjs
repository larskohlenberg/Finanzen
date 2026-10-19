// app/fokus.mjs
// render() ersetzt den kompletten DOM (app.innerHTML). Ohne Gegenmassnahme
// springt der Fokus auf <body> und Scrollpositionen gehen verloren. Vor jedem
// Neuzeichnen Fokus und Scroll sichern, danach wiederherstellen.
//
// Fokus-Schluessel, einheitlich fuer alle Elemente: data-fokus, wenn gesetzt
// (fuer Elemente, die sonst nicht eindeutig sind), sonst die id, sonst alle
// data-Attribute des Elements. Keine Liste einzelner Attribute mehr, die bei
// jedem neuen Bedienelement nachgezogen werden muss.

const SCROLL_SELECTORS = [".nav", ".table-wrap"];

// Wert fuer einen Attribut-Selektor in Anfuehrungszeichen maskieren.
const maskiere = (wert) => String(wert).replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");

export function fokusSchluessel(el) {
  if (!el?.tagName) return null;
  const tag = el.tagName.toLowerCase();
  const merkmal = (name) => `[${name}="${maskiere(el.getAttribute(name))}"]`;
  if (el.getAttribute("data-fokus") != null) return tag + merkmal("data-fokus");
  if (el.getAttribute("id")) return tag + merkmal("id");
  const daten = [...(el.attributes ?? [])].map((a) => a.name).filter((n) => n.startsWith("data-")).sort();
  return daten.length ? tag + daten.map(merkmal).join("") : null;
}

export function captureFocus(app) {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  const selector = fokusSchluessel(el);
  if (!selector) return null;
  const selectionStart = typeof el.selectionStart === "number" ? el.selectionStart : null;
  const selectionEnd = typeof el.selectionEnd === "number" ? el.selectionEnd : null;
  return { selector, selectionStart, selectionEnd };
}

export function restoreFocus(app, snap) {
  if (!snap) return;
  let target = null;
  try {
    target = app.querySelector(snap.selector);
  } catch {
    target = null;
  }
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snap.selectionStart != null && typeof target.setSelectionRange === "function") {
    try {
      target.setSelectionRange(snap.selectionStart, snap.selectionEnd);
    } catch {
      /* z. B. input[type=date] erlaubt keine Selektion – ignorieren */
    }
  }
}

export function captureScroll(app) {
  const map = {};
  for (const sel of SCROLL_SELECTORS) {
    map[sel] = [...app.querySelectorAll(sel)].map((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  }
  return { x: window.scrollX, y: window.scrollY, map };
}

export function restoreScroll(app, snap) {
  if (!snap) return;
  for (const sel of SCROLL_SELECTORS) {
    const els = app.querySelectorAll(sel);
    (snap.map[sel] || []).forEach((pos, i) => {
      const el = els[i];
      if (el) {
        el.scrollLeft = pos.left;
        el.scrollTop = pos.top;
      }
    });
  }
  window.scrollTo(snap.x, snap.y);
}
