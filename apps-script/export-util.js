/**
 * export-util.js – Geteilte CSV-/Export-Logik (Single Source of Truth)
 *
 * Läuft in Google Apps Script (via clasp als .gs gepusht) UND in Node (Tests).
 * Keine Abhängigkeiten.
 */

// Spaltenreihenfolge aller Anwesenheits-Exporte (CSV).
var EXPORT_SPALTEN = ['Vorname', 'Nachname', 'Kurs-ID', 'Kurs-Name', 'Datum', 'Zeit', 'Timestamp'];

// Ein CSV-Feld escapen (Semikolon-getrennt). Felder mit Sonderzeichen werden gequotet.
function csvFeld(wert) {
  const s = String(wert == null ? '' : wert);
  if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// CSV bauen: UTF-8-BOM + CRLF-Zeilenenden (damit Excel auf DE-Systemen korrekt öffnet).
function baueCsv(eintraege, spalten) {
  const zeilen = [spalten.join(';')];
  (eintraege || []).forEach(e => {
    zeilen.push(spalten.map(sp => csvFeld(e ? e[sp] : '')).join(';'));
  });
  return '﻿' + zeilen.join('\r\n');
}

// Liegt ein Datum "dd.MM.yyyy" im Monat "YYYY-MM"?
function istImMonat(datumDe, monatIso) {
  if (!datumDe || !monatIso) return false;
  const d = String(datumDe).trim().split('.');           // [dd, MM, yyyy]
  if (d.length !== 3) return false;
  const m = String(monatIso).trim().split('-');          // [yyyy, MM]
  if (m.length !== 2) return false;
  return d[2] === m[0] && d[1] === m[1];
}

// Dateiname für den Monats-Export, z. B. anwesenheit_2026-07_naeh-kurs.csv
function monatDateiname(monatIso, kursId) {
  const basis = 'anwesenheit_' + String(monatIso || 'monat');
  const suffix = kursId ? '_' + String(kursId).replace(/[^A-Za-z0-9\-_]/g, '') : '';
  return basis + suffix + '.csv';
}

// Node-Export (in Apps Script ist `module` undefined -> übersprungen)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXPORT_SPALTEN, csvFeld, baueCsv, istImMonat, monatDateiname };
}
