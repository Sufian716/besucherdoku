// api.js – Alle Kommunikation mit dem n8n-Backend.
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

async function apiAufruf(action, payload = {}) {
  const url = window.WEBHOOK_COURSES_URL;
  if (!url || url.includes('IHRE-N8N-DOMAIN')) {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken: token, action, ...payload })
    });
  } catch {
    return { ok: false, fehler: 'Keine Verbindung zum Server. Internetverbindung prüfen.' };
  }

  let json;
  try {
    json = await antwort.json();
  } catch {
    return { ok: false, fehler: `Server-Antwort konnte nicht gelesen werden (HTTP ${antwort.status}).` };
  }

  if (antwort.status === 401) {
    tokenLoeschen();
    return { ok: false, fehler: 'Sitzung abgelaufen. Bitte erneut anmelden.', nichtAutorisiert: true };
  }

  if (!antwort.ok || json.ok === false) {
    return { ok: false, fehler: json.fehler || `Serverfehler (HTTP ${antwort.status}).` };
  }

  return { ok: true, daten: json };
}

// ── Login ───────────────────────────────────────────────────────────────────

async function login(passwort) {
  const hash = await hashPasswort(passwort);
  // Testaufruf: Kursliste laden – wenn 401, falsches Passwort
  tokenSpeichern(hash);
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

async function heuteLaden() {
  return apiAufruf('today');
}
