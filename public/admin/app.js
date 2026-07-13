// app.js – Routing-Logik und Orchestrierung.
// Verbindet api.js (Daten) mit views.js (Darstellung).

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let zustand = {
  ansicht: 'login',    // 'login' | 'liste' | 'formular' | 'qr' | 'heute'
  kurse: [],
  bearbeiteteKurs: null,
  qrKursId: null,
  qrKursName: null
};

// ── Einstiegspunkt ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app');
  if (!container) return;

  // Bereits angemeldete Sitzung? (Token in sessionStorage vorhanden)
  if (tokenLesen()) {
    zeigeListe(container);
  } else {
    zeigeLogin(container);
  }
});

// ── View-Transitionen ─────────────────────────────────────────────────────────

function zeigeLogin(container) {
  zustand.ansicht = 'login';
  renderLogin(container, async (passwort, onFehler) => {
    renderLaden(container, 'Anmeldung wird geprüft …');
    const ergebnis = await login(passwort);
    if (!ergebnis.ok) {
      zeigeLogin(container);
      // Kurze Verzögerung damit der DOM stabil ist, bevor onFehler aufgerufen wird
      requestAnimationFrame(() => {
        const fehlerEl = container.querySelector('#login-fehler');
        if (fehlerEl) {
          fehlerEl.className = 'meldung fehler';
          fehlerEl.textContent = ergebnis.fehler;
        }
        const btn = container.querySelector('#login-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Anmelden'; }
      });
      return;
    }
    zustand.kurse = ergebnis.daten?.kurse || [];
    zeigeListe(container);
  });
}

async function zeigeListe(container, erfolgsMeldung) {
  zustand.ansicht = 'liste';
  renderLaden(container, 'Kurse werden geladen …');

  const ergebnis = await kurseLaden();
  if (!ergebnis.ok) {
    if (ergebnis.nichtAutorisiert) { zeigeLogin(container); return; }
    renderFehler(container, ergebnis.fehler, () => zeigeListe(container));
    return;
  }

  zustand.kurse = ergebnis.daten?.kurse || [];

  renderKursliste(container, zustand.kurse, {
    onNeu:          () => zeigeFormular(container, null),
    onQr:           (id, name) => zeigeQr(container, id, name),
    onBearbeiten:   (id, name, notiz) => zeigeFormular(container, { 'Kurs-ID': id, Name: name, Notiz: notiz }),
    onDeaktivieren: (id, name) => deaktivierenBestaetigen(container, id, name),
    onHeute:        () => zeigeHeute(container),
    onAbmelden:     () => { tokenLoeschen(); zeigeLogin(container); }
  });

  // Erfolgsmeldung nach Aktion anzeigen
  if (erfolgsMeldung) {
    requestAnimationFrame(() => {
      const el = container.querySelector('#liste-meldung');
      if (el) {
        el.className = 'meldung erfolg';
        el.textContent = erfolgsMeldung;
        setTimeout(() => { el.className = 'meldung'; el.textContent = ''; }, 4000);
      }
    });
  }
}

function zeigeFormular(container, kurs) {
  zustand.ansicht = 'formular';
  zustand.bearbeiteteKurs = kurs;

  renderKursFormular(
    container,
    kurs,
    async ({ name, kursId, notiz, istNeu }, onFehler) => {
      let ergebnis;
      if (istNeu) {
        ergebnis = await kursAnlegen(name, kursId, notiz);
      } else {
        ergebnis = await kursAktualisieren(kursId, name, notiz);
      }

      if (!ergebnis.ok) {
        if (ergebnis.nichtAutorisiert) { zeigeLogin(container); return; }
        onFehler(ergebnis.fehler);
        return;
      }

      const nachricht = istNeu
        ? `Kurs „${name}" wurde angelegt.`
        : `Kurs „${name}" wurde aktualisiert.`;
      zeigeListe(container, nachricht);
    },
    () => zeigeListe(container)
  );
}

function zeigeQr(container, kursId, kursName) {
  zustand.ansicht = 'qr';
  renderQrCode(container, kursId, kursName, () => zeigeListe(container));
}

async function zeigeHeute(container, filterDatum, filterKurs) {
  zustand.ansicht = 'heute';
  renderLaden(container, 'Einträge werden geladen …');

  // Kursliste für Dropdown laden falls noch nicht vorhanden
  if (!zustand.kurse || zustand.kurse.length === 0) {
    const kErg = await kurseLaden();
    if (kErg.ok) zustand.kurse = kErg.daten?.kurse || [];
  }

  const datum  = filterDatum !== undefined ? filterDatum : tagHeute();
  const kursId = filterKurs  !== undefined ? filterKurs  : '';

  const ergebnis = await anwesenheitFiltern(datum, kursId);
  if (!ergebnis.ok) {
    if (ergebnis.nichtAutorisiert) { zeigeLogin(container); return; }
    renderFehler(container, ergebnis.fehler, () => zeigeListe(container));
    return;
  }

  const daten = { ...ergebnis.daten, datum, kursId };

  renderHeute(
    container,
    daten,
    zustand.kurse,
    () => zeigeListe(container),
    (d, k) => zeigeHeute(container, d, k),
    async (empfaenger, kId, dat, loeschen) => {
      const res = await mailSenden(empfaenger, kId, dat, loeschen);
      if (res.nichtAutorisiert) { zeigeLogin(container); }
      return res;
    },
    async (monat, kId, empfaenger) => {
      const res = await monatExportieren(monat, kId, empfaenger);
      if (res.nichtAutorisiert) { zeigeLogin(container); }
      return res;
    }
  );
}

// ── Deaktivieren mit Bestätigung ───────────────────────────────────────────────

async function deaktivierenBestaetigen(container, kursId, kursName) {
  // Nativer Confirm-Dialog – reicht für MVP, vermeidet Modal-Komplexität
  const bestaetigt = confirm(
    `Kurs „${kursName}" deaktivieren?\n\nVorhandene Anwesenheitsdaten bleiben erhalten. Der Kurs wird in der Liste als inaktiv angezeigt.`
  );
  if (!bestaetigt) return;

  renderLaden(container, 'Kurs wird deaktiviert …');
  const ergebnis = await kursDeaktivieren(kursId);

  if (!ergebnis.ok) {
    if (ergebnis.nichtAutorisiert) { zeigeLogin(container); return; }
    // Zurück zur Liste mit Fehlermeldung
    await zeigeListe(container);
    requestAnimationFrame(() => {
      const el = container.querySelector('#liste-meldung');
      if (el) {
        el.className = 'meldung fehler';
        el.textContent = ergebnis.fehler;
      }
    });
    return;
  }

  zeigeListe(container, `Kurs „${kursName}" wurde deaktiviert.`);
}
