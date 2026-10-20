// app/aktionen/rahmen.mjs
// Aktionen (data-action) – Rahmen: Einstellungen, Menues, Agenten-Prompt, Daten neu laden, Sidebar, Kacheln.
import { ablauf } from "../ablauf.mjs";
import { verwerfeApiCaches } from "../api-daten.mjs";
import { hashNachModuswechsel } from "../demo-modus.mjs";
import { toggleKlappKachel } from "../komponenten.mjs";
import { state, storageKeys } from "../runtime.mjs";
import { zeigeChecks, commitNavigation } from "../verlauf.mjs";
import { ladeBelege, belegDateienStand } from "../views/belege.mjs";
import { rahmen } from "../rahmen.mjs";
import { kopfleisteAntwort } from "../views/kopfleiste-daten.mjs";
import { ladeInbox } from "../views/upload.mjs";

async function copyNextAgentPrompt(type = "") {
  const nextActionActions = kopfleisteAntwort()?.aktionen ?? [];
  const nextAction = nextActionActions.find((candidate) => candidate.type === type) ?? nextActionActions[0];
  if (!nextAction?.prompt) return;
  try {
    await navigator.clipboard.writeText(nextAction.prompt);
    if (rahmen.nextActionCopiedTimer) clearTimeout(rahmen.nextActionCopiedTimer);
    state.nextActionCopied = true;
    state.nextActionMenuOpen = false;
    state.nextActionPromptFallback = "";
    ablauf.render();
    rahmen.nextActionCopiedTimer = window.setTimeout(() => {
      state.nextActionCopied = false;
      rahmen.nextActionCopiedTimer = null;
      ablauf.render();
    }, 1800);
  } catch {
    if (rahmen.nextActionCopiedTimer) {
      clearTimeout(rahmen.nextActionCopiedTimer);
      rahmen.nextActionCopiedTimer = null;
    }
    state.nextActionCopied = false;
    state.nextActionMenuOpen = false;
    state.nextActionPromptFallback = nextAction.prompt;
    ablauf.render();
  }
}

function applySetting(setting, value) {
  if (setting === "data-mode") {
    const mode = value === "demo" ? "demo" : "live";
    if (mode === state.dataMode) return;
    state.dataMode = mode;
    localStorage.setItem(storageKeys.dataMode, state.dataMode);
    // Voller Neuladen leert alle Caches (Dokumente, Inbox, Verweis-Index);
    // ausgewaehlte Datensaetze und Dokumente gehoeren zum anderen Bestand.
    const url = new URL(window.location.href);
    url.searchParams.set("_reload", String(Date.now()));
    url.hash = hashNachModuswechsel(url.hash);
    window.location.assign(url);
    return;
  }
  if (setting === "lang") {
    state.lang = value === "en" ? "en" : "de";
    localStorage.setItem(storageKeys.lang, state.lang);
  }
  if (setting === "theme") {
    state.theme = ["light", "dark"].includes(value) ? value : "system";
    localStorage.setItem(storageKeys.theme, state.theme);
  }
  ablauf.render();
}

export const aktionen = {
  "schnellsuche-oeffnen": () => ablauf.oeffneSchnellsuche(),
  "schnellsuche-schliessen": () => {
    state.schnellsuche.offen = false;
    ablauf.render();
  },
  "schnellsuche-ziel": (element) => ablauf.springeZu(element.dataset.route),
  "dokument-oeffnen": (element) => {
    window.open(element.dataset.url, "_blank", "noopener");
  },
  "toggle-settings-menu": () => {
    state.settingsMenuOpen = !state.settingsMenuOpen;
    ablauf.render();
  },
  "set-setting": (element) => {
    applySetting(element.dataset.setting, element.dataset.value);
  },
  "toggle-next-action-menu": () => {
    state.nextActionMenuOpen = !state.nextActionMenuOpen;
    ablauf.render();
  },
  "copy-next-agent-prompt": async (element) => {
    await copyNextAgentPrompt(element.dataset.nextActionType);
  },
  "close-prompt-fallback": () => {
    state.nextActionPromptFallback = "";
    ablauf.render();
  },
  "abmelden": () => {
    rahmen.sitzungswaechter?.abmelden();
  },
  "reload-data": () => {
    // Ohne Seiten-Reload: Bestand bedingt neu holen, Antworten der Lese-APIs
    // (auch gescheiterte) neu abrufen, Dokumente und Inbox frisch listen.
    verwerfeApiCaches();
    ablauf.pruefeStand({ erzwingen: true });
    ablauf.render();
    if (state.view === "upload") void ladeInbox(ablauf.render);
    if (belegDateienStand().zustand !== "unbekannt") void ladeBelege(ablauf.render);
  },
  "toggle-more-menu": () => {
    state.moreMenuOpen = !state.moreMenuOpen;
    ablauf.render();
  },
  "toggle-sidebar": () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(storageKeys.sidebarCollapsed, String(state.sidebarCollapsed));
    ablauf.render();
  },
  "go-overview": () => {
    state.view = "overview";
    commitNavigation();
  },
  "show-import-errors": () => {
    zeigeChecks();
    commitNavigation();
  },
  "show-checks": (element, action) => aktionen["show-import-errors"](element, action),
  "show-validation": () => {
    const banner = document.getElementById("validation-banner");
    if (banner) {
      banner.scrollIntoView({ behavior: "smooth", block: "start" });
      banner.focus();
    }
  },
  "klapp-kachel": (element) => {
    toggleKlappKachel(element.dataset.kachel, element.dataset.standard !== "false");
    ablauf.render();
  },
};
