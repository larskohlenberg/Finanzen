// app/tabellenkopf.mjs
// Mitlaufender Tabellenkopf fuer Tabellen mit [data-kopf-klebt] am .table-wrap.
// position: sticky greift dort nicht, weil der Rahmen waagrecht scrollt und
// damit selbst der Scroll-Container ist. Stattdessen verschiebt eine
// CSS-Variable (per CSSOM, die CSP verbietet style-Attribute) die Kopfzellen
// um so viel nach unten, wie der Rahmen oben aus dem Fenster ragt.

// Oberkante, unter der der Kopf haengen bleibt: auf schmalen Fenstern liegt
// die Seitenleiste als klebende Leiste oben ueber dem Inhalt.
function oberkante() {
  const leiste = document.querySelector(".sidebar");
  if (!leiste || getComputedStyle(leiste).position !== "sticky") return 0;
  const r = leiste.getBoundingClientRect();
  return r.width >= innerWidth - 1 ? Math.max(0, r.bottom) : 0;
}

export function kopfVersatz(rahmenOben, rahmenHoehe, kopfHoehe, oben) {
  return Math.round(Math.max(0, Math.min(oben - rahmenOben, rahmenHoehe - kopfHoehe)));
}

export function tabellenkoepfeSetzen(root) {
  const oben = oberkante();
  for (const wrap of root.querySelectorAll("[data-kopf-klebt]")) {
    const kopf = wrap.querySelector("thead");
    if (!kopf) continue;
    const r = wrap.getBoundingClientRect();
    const versatz = kopfVersatz(r.top, r.height, kopf.offsetHeight, oben);
    wrap.style.setProperty("--kopf-versatz", `${versatz}px`);
    wrap.classList.toggle("kopf-schwebt", versatz > 0);
  }
}

export function bindTabellenkopf(root) {
  let geplant = false;
  const planen = () => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      tabellenkoepfeSetzen(root);
    });
  };
  window.addEventListener("scroll", planen, { passive: true });
  window.addEventListener("resize", planen);
}
