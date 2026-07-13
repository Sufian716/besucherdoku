// api.js – Alle Kommunikation mit dem Google Apps Script Backend.
// Jede Funktion gibt { ok, daten?, fehler? } zurück.

'use strict';

// ── Auth-Token ──────────────────────────────────────────────────────────────

async function hashPasswort(passwort) {
  const encoder = new TextEncoder();
  const daten = encoder.encode(passwort);
  const puffer = await crypto.subtle.digest('SHA-256', daten);
  return Array.from(new Uint8Array(puffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function tokenLesen() {
  return sessionStorage.getItem('admin_token') || null;
}

function tokenSpeichern(hash) {
  sessionStorage.setItem('admin_token', hash);
}

function tokenLoeschen() {
  sessionStorage.removeItem('admin_token');
}

// ── Basis-Request ───────────────────────────────────────────────────────────
// Content-Type: text/plain vermeidet den CORS-Preflight (OPTIONS-Request),
// den Google Apps Script nicht beantwortet. Der Body ist trotzdem JSON.

async function apiAufruf(action, payload = {}) {
  const url = window.WEBHOOK_URL;
  if (!url || url.includes('DEPLOYMENT_ID_HIER_ERSETZEN')) {
    return { ok: false, fehler: 'Webhook-URL nicht konfiguriert (config.js anpassen).' };
  }

  const token = tokenLesen();
  if (!token) {
    return { ok: false, fehler: 'Nicht angemeldet.', nichtAutorisiert: true };
  }

  let antwort;
  try {
    antwort = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ authToken: token, action, ...payload })
    });
  } catch {
    return { ok: false, fehler: 'Keine Verbindung zum Server. Internetverbindung prüfen.' };
  }

  let data;
  try {
    data = await antwort.json();
  } catch {
    return { ok: false, fehler: 'Antwort konnte nicht gelesen werden (HTTP ' + antwort.status + ').' };
  }

  if (data.nichtAutorisiert) {
    tokenLoeschen();
    return { ok: false, fehler: 'Sitzung abgelaufen. Bitte erneut anmelden.', nichtAutorisiert: true };
  }

  if (data.ok === false) {
    return { ok: false, fehler: data.fehler || 'Unbekannter Serverfehler.' };
  }

  return { ok: true, daten: data };
}

// ── Login ───────────────────────────────────────────────────────────────────

async function login(passwort) {
  const hash = await hashPasswort(passwort);
  tokenSpeichern(hash);
  // Testaufruf: Kursliste laden – wenn 401, ist das Passwort falsch
  const ergebnis = await apiAufruf('list');
  if (!ergebnis.ok) {
    tokenLoeschen();
    if (ergebnis.nichtAutorisiert) {
      return { ok: false, fehler: 'Falsches Passwort.' };
    }
    return ergebnis;
  }
  return { ok: true, daten: ergebnis.daten };
}

// ── Kurse ───────────────────────────────────────────────────────────────────

async function kurseLaden() {
  return apiAufruf('list');
}

async function kursAnlegen(name, kursId, notiz) {
  return apiAufruf('create', { name, kursId, notiz });
}

async function kursAktualisieren(kursId, name, notiz) {
  return apiAufruf('update', { kursId, name, notiz });
}

async function kursDeaktivieren(kursId) {
  return apiAufruf('deactivate', { kursId });
}

// ── Heute-Dashboard ─────────────────────────────────────────────────────────

async function anwesenheitFiltern(datum, kursId) {
  return apiAufruf('filter', { datum: datum || '', kursId: kursId || '' });
}

async function mailSenden(empfaenger, kursId, datum, loeschen) {
  return apiAufruf('mailNow', { empfaenger, kursId: kursId || '', datum: datum || '', loeschen: !!loeschen });
}

// Monats-Export: liefert die CSV als String zurück (für Download); mit empfaenger zusätzlich per Mail.
async function monatExportieren(monat, kursId, empfaenger) {
  return apiAufruf('exportMonat', { monat: monat || '', kursId: kursId || '', empfaenger: empfaenger || '' });
}

// Monats-Statistik: Gesamtzahl + Aufschlüsselung pro Kurs (ohne CSV).
async function monatStatistikLaden(monat, kursId) {
  return apiAufruf('monatStatistik', { monat: monat || '', kursId: kursId || '' });
}
