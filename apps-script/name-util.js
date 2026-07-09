/**
 * name-util.js – Geteilte Namenslogik (Single Source of Truth)
 *
 * Läuft in Google Apps Script (via clasp als .gs gepusht – dort ist `module`
 * undefined, der Export unten wird übersprungen) UND in Node (für die Tests,
 * via require). Keine Abhängigkeiten.
 */

// Namensteil säubern: gefährliche Zeichen raus, trimmen, auf 60 Zeichen kürzen.
function nameSanitize(s) {
  return String(s == null ? '' : s).replace(/[<>"'&]/g, '').trim().substring(0, 60);
}

// Kombinierten Namen aufteilen: erstes Wort = Vorname, Rest = Nachname.
function nameSplit(voll) {
  const teile = String(voll == null ? '' : voll).trim().split(/\s+/).filter(Boolean);
  return { vorname: teile[0] || '', nachname: teile.slice(1).join(' ') };
}

// Vor-/Nachname aus dem Request-Body ermitteln und prüfen.
// Bevorzugt getrennte Felder (vorname/nachname), fällt sonst auf tnName (Legacy) zurück.
// Beide Teile müssen nach dem Säubern >= 2 Zeichen haben.
function checkinName(body) {
  body = body || {};
  let vorname  = body.vorname  != null ? String(body.vorname)  : '';
  let nachname = body.nachname != null ? String(body.nachname) : '';

  if (!vorname && !nachname && body.tnName) {
    const s = nameSplit(body.tnName);
    vorname  = s.vorname;
    nachname = s.nachname;
  }

  vorname  = nameSanitize(vorname);
  nachname = nameSanitize(nachname);

  if (vorname.length < 2 || nachname.length < 2) {
    return { ok: false, fehler: 'Bitte Vor- und Nachnamen angeben.' };
  }
  return { ok: true, vorname: vorname, nachname: nachname };
}

// Node-Export (in Apps Script ist `module` undefined -> übersprungen)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nameSanitize, nameSplit, checkinName };
}
