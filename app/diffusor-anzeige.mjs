// app/diffusor-anzeige.mjs
// Diffusor-Modus im Browser (Regeln in diffusor.mjs): Schalter, Beobachter und
// Walzen-Animation. Betraege verdeckt schon der Formatierer (runtime.mjs fmt);
// ein MutationObserver ersetzt danach im ganzen Dokument Namen aus dem Bestand,
// Betraege aus anderen Quellen und Freitext in Elementen mit data-diffus
// ("text" oder "gegenpartei"). So greift der Modus auch in Hover-Texten,
// Diagrammen und nachgeladenen Ansichten, ohne dass jede Ansicht ihn kennt.
import { data, state, storageKeys, t, tf, datenVersion, diffusorSalz, kategorienById } from "./runtime.mjs";
import { erstelleErsetzer, gegenparteiNummern, pseudonymTabelle, verdeckeFreitext, verdeckeText, zerlege, zufallsZeichen } from "./diffusor.mjs";

const ATTRIBUTE = ["title", "aria-label", "alt", "placeholder"];
// Hier werden Textknoten direkt ersetzt statt in <span class="diffus"> gehuellt
// (kein HTML moeglich); sie rollen dann nicht.
const OHNE_HUELLE = "svg, option, title";
const AUSLASSEN = ".diffus, script, style, textarea";

const gegenpartei = gegenparteiNummern();
let ersetzerStand = null;

function ersetzer() {
  if (ersetzerStand?.version !== datenVersion() || ersetzerStand.lang !== state.lang) {
    const tabelle = pseudonymTabelle(data, {
      person: (n) => tf("diffusor.person", { n }),
      konto: (art, kennung) => tf("diffusor.konto", { art, kennung }),
      vorsorge: (art, n) => tf("diffusor.vorsorge", { art, n }),
      immobilie: (n) => tf("diffusor.immobilie", { n }),
      darlehen: (n) => tf("diffusor.darlehen", { n }),
      vermoegenswert: (n) => tf("diffusor.vermoegenswert", { n }),
      regelzahlung: (kategorie, n) => tf("diffusor.regelzahlung", { kategorie, n }),
      gegenpartei: (n) => tf("diffusor.gegenpartei", { n }),
      kontoArt: (typ) => (t(`accountTypes.${typ}`) === `accountTypes.${typ}` ? t("diffusor.kontoOhneArt") : t(`accountTypes.${typ}`)),
      vorsorgeArt: (art) => (t(`vorsorge.art.${art}`) === `vorsorge.art.${art}` ? t("diffusor.vertrag") : t(`vorsorge.art.${art}`)),
      kategorie: (id) => kategorienById.get(id)?.name ?? t("diffusor.regelzahlungOhneKategorie"),
    }, gegenpartei);
    ersetzerStand = { version: datenVersion(), lang: state.lang, ersetzer: erstelleErsetzer(tabelle) };
  }
  return ersetzerStand.ersetzer;
}

// Ersatz fuer einen Textknoten in einem data-diffus-Element.
function freitextErsatz(art, text) {
  if (!text.trim()) return null;
  // Bekannte Namen (eigene Konten bei Umbuchungen) behalten ihren Platzhalter.
  if (art === "gegenpartei") return ersetzer().ersatz.get(text.normalize("NFC").trim().toLowerCase()) ?? tf("diffusor.gegenpartei", { n: gegenpartei(text) });
  return verdeckeFreitext(text, diffusorSalz);
}

function teileFuerText(knoten, ersetzen) {
  const frei = knoten.parentElement.closest("[data-diffus]");
  if (frei) {
    if (!knoten.data.trim()) return null;
    return [{ text: ersetzen ? freitextErsatz(frei.dataset.diffus, knoten.data) : knoten.data, verdeckt: true }];
  }
  const teile = zerlege(knoten.data, ersetzer(), diffusorSalz, { ersetzen });
  return teile.some((teil) => teil.verdeckt) ? teile : null;
}

// Eingabefelder (Suche, Betrag ab/bis): Wer zuschaut, soll nicht lesen, wonach
// gefiltert wird. Der Text im Feld wird durchsichtig, eine Decke darueber zeigt
// ihn als Zeichen; Suchen und Filtern bleiben, wie sie sind. Datumsfelder bleiben offen.
const EINGABE = 'input[type="search"], input[type="text"]:not([data-datum-feld])';

function eingabeDecken(feld) {
  if (!feld?.matches?.(EINGABE) || !feld.parentElement) return;
  feld.classList.add("diffus-eingabe");
  feld.parentElement.classList.add("diffus-eingabe-rahmen");
  let decke = feld.nextElementSibling;
  if (!decke?.classList.contains("diffus-eingabe-decke")) {
    decke = document.createElement("span");
    decke.className = "diffus diffus-eingabe-decke";
    decke.setAttribute("aria-hidden", "true");
    feld.after(decke);
  }
  const stil = getComputedStyle(feld);
  const links = Number.parseFloat(stil.paddingLeft) || 0;
  const rechts = Number.parseFloat(stil.paddingRight) || 0;
  decke.style.left = `${feld.offsetLeft + feld.clientLeft + links}px`;
  decke.style.top = `${feld.offsetTop}px`;
  decke.style.height = `${feld.offsetHeight}px`;
  decke.style.width = `${Math.max(0, feld.clientWidth - links - rechts)}px`;
  decke.style.font = stil.font;
  decke.textContent = feld.value ? verdeckeFreitext(feld.value, diffusorSalz) : "";
}

function eingabenIn(wurzel) {
  if (wurzel.matches?.(EINGABE)) eingabeDecken(wurzel);
  for (const feld of wurzel.querySelectorAll?.(EINGABE) ?? []) eingabeDecken(feld);
}

globalThis.document?.addEventListener?.("input", (event) => {
  if (state.diffusor) eingabeDecken(event.target);
}, true);

const erledigt = new WeakSet();

function textKnoten(knoten, ersetzen = true) {
  const eltern = knoten.parentElement;
  if (!eltern || erledigt.has(knoten) || eltern.closest(AUSLASSEN)) return;
  const teile = teileFuerText(knoten, ersetzen);
  if (!teile) return;
  if (eltern.closest(OHNE_HUELLE)) {
    const neu = teile.map((teil) => teil.text).join("");
    if (neu !== knoten.data) knoten.data = neu;
    erledigt.add(knoten);
    return;
  }
  const stueck = document.createDocumentFragment();
  for (const teil of teile) {
    if (!teil.verdeckt) {
      stueck.append(teil.text);
      continue;
    }
    const huelle = document.createElement("span");
    huelle.className = "diffus";
    huelle.textContent = teil.text;
    stueck.append(huelle);
  }
  knoten.replaceWith(stueck);
}

// Zuletzt gesetzter Wert je Element und Attribut: so wird ein Platzhalter, der
// selbst einen Namen enthaelt ("Tagesgeld A"), nicht immer wieder ersetzt.
const gesetzt = new WeakMap();

function attribut(element, name) {
  const wert = element.getAttribute(name);
  if (wert === null || gesetzt.get(element)?.[name] === wert) return;
  const frei = element.closest("[data-diffus]");
  const neu = frei && frei.dataset.diffus !== "gegenpartei"
    ? verdeckeFreitext(wert, diffusorSalz)
    : verdeckeText(wert, ersetzer(), diffusorSalz);
  gesetzt.set(element, { ...gesetzt.get(element), [name]: neu });
  if (neu !== wert) element.setAttribute(name, neu);
}

function verarbeite(wurzel, ersetzen = true) {
  if (wurzel.nodeType === Node.TEXT_NODE) {
    textKnoten(wurzel, ersetzen);
    return;
  }
  if (wurzel.nodeType !== Node.ELEMENT_NODE) return;
  if (ersetzen) {
    const elemente = [wurzel, ...wurzel.querySelectorAll(ATTRIBUTE.map((a) => `[${a}]`).join(","))];
    for (const element of elemente) for (const name of ATTRIBUTE) if (element.hasAttribute?.(name)) attribut(element, name);
  }
  if (ersetzen) eingabenIn(wurzel);
  const gaenger = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  const knoten = [];
  while (gaenger.nextNode()) knoten.push(gaenger.currentNode);
  for (const k of knoten) textKnoten(k, ersetzen);
}

let beobachter = null;

function beiAenderung(aenderungen) {
  for (const a of aenderungen) {
    if (a.type === "attributes") attribut(a.target, a.attributeName);
    else if (a.type === "characterData") textKnoten(a.target);
    else for (const neu of a.addedNodes) if (neu.isConnected) verarbeite(neu);
  }
}

// Nach jedem Zeichnen und beim Start: Klasse am Dokument und Beobachter passend
// zum Schalter. Der Beobachter laeuft vor dem naechsten Bild, es blitzt nichts auf.
export function diffusorAnwenden() {
  const wurzel = globalThis.document?.documentElement;
  wurzel?.classList?.toggle("diffusor", state.diffusor);
  if (state.diffusor && !beobachter && wurzel && typeof MutationObserver === "function") {
    beobachter = new MutationObserver(beiAenderung);
    beobachter.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTE });
    verarbeite(document.documentElement);
  } else if (!state.diffusor && beobachter) {
    beobachter.disconnect();
    beobachter = null;
  }
}

// Walze: jede Stelle rollt durch zufaellige Zeichen und bleibt von links nach
// rechts versetzt stehen. Nur was im Bild ist, und ohne Animation bei
// "Bewegung reduzieren".
const ROLLEN_MS = 260;
const VERSATZ_MS = 40;
const BLEIBT = /[\s€.,:\-+−%]/u;

function rolle(wurzel) {
  if (typeof requestAnimationFrame !== "function" || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const hoehe = globalThis.innerHeight;
  const huellen = [...wurzel.querySelectorAll(".diffus")].filter((h) => {
    const r = h.getBoundingClientRect();
    return r.bottom > 0 && r.top < hoehe && r.width > 0;
  }).slice(0, 600);
  const ziele = huellen.map((h) => [...h.textContent]);
  const start = performance.now();
  const dauer = ROLLEN_MS + Math.max(0, ...ziele.map((z) => Math.min(z.length, 24))) * VERSATZ_MS;
  const schritt = (jetzt) => {
    const vergangen = jetzt - start;
    huellen.forEach((h, j) => {
      h.textContent = ziele[j].map((z, i) => (vergangen >= ROLLEN_MS + Math.min(i, 24) * VERSATZ_MS || BLEIBT.test(z) ? z : zufallsZeichen())).join("");
    });
    if (vergangen < dauer) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

// Knopf in der Kopfleiste und Alt+Umschalt+D. Beim Ausschalten werden die
// Fundstellen im neu gezeichneten Klartext kurz markiert, damit sie zurueckrollen.
export function schalteDiffusor(render) {
  state.diffusor = !state.diffusor;
  try {
    localStorage.setItem(storageKeys.diffusor, String(state.diffusor));
  } catch {
    // Ohne Speicher gilt der Schalter nur bis zum Neuladen.
  }
  render();
  const app = globalThis.document?.querySelector?.("#app");
  if (!app?.querySelectorAll) return;
  if (!state.diffusor) verarbeite(app, false);
  // Erst nach dem Beobachter (Mikroaufgabe) rollen.
  queueMicrotask(() => rolle(app));
}
