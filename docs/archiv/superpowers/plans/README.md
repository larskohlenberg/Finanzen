# Superpowers-Pläne

Dieser Ordner enthaelt historische Implementierungsplaene. Sie dokumentieren, wie fruehere Arbeitsschritte gedacht oder ausgefuehrt wurden, sind aber keine aktuelle Betriebsanweisung.

Seit ADR 0012 und ADR 0015 gilt: Die App ist webserver-only, `app/` ist der fuehrende App-Raum, Masterdaten liegen physisch unter `app/data/master/`, Tools unter `app/tools/`, Schemas unter `app/schemas/`, und `app/review-data.js` ist entfallen.

Alte Planstellen mit `review-data.js`, `FINANCE_REVIEW_DATA`, `validate:m1`, `docs/handoff/Handoff_Runde2.md` oder Root-Pfaden wie `data/master/` und `tools/` sind als historischer Kontext zu lesen. Fuer neue Arbeit gelten `README.md`, `app/README.md`, `CONTEXT.md` und die aktuellen ADRs.
