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

// "dd.MM.yyyy" -> "YYYY-MM" (leer bei ungültigem Datum)
function monatVonDatum(datumDe) {
  const d = String(datumDe == null ? '' : datumDe).trim().split('.');
  if (d.length !== 3) return '';
  return d[2] + '-' + d[1];
}

// Liegt "dd.MM.yyyy" im Monatsbereich [vonMonat, bisMonat] (jeweils "YYYY-MM")?
// Vertauschte Grenzen (von > bis) werden toleriert.
function istImZeitraum(datumDe, vonMonat, bisMonat) {
  const m = monatVonDatum(datumDe);
  if (!m) return false;
  if (!/^\d{4}-\d{2}$/.test(String(vonMonat || '')) || !/^\d{4}-\d{2}$/.test(String(bisMonat || ''))) return false;
  let von = String(vonMonat), bis = String(bisMonat);
  if (von > bis) { const t = von; von = bis; bis = t; }
  return m >= von && m <= bis;                 // Stringvergleich ist bei YYYY-MM korrekt
}

// Spalten des Quartals-Exports (pro Person + Kurs zusammengefasst).
var QUARTAL_SPALTEN = ['Nachname', 'Vorname', 'Kurs-Name', 'Kurs-ID', 'Anzahl Besuche', 'Erster Besuch', 'Letzter Besuch'];

// Einträge pro Person UND Kurs zusammenfassen (dedupliziert): eine Zeile je
// (Nachname, Vorname, Kurs-ID) mit Besuchszahl + erstem/letztem Besuch.
// Erster/letzter Besuch über den ISO-Timestamp bestimmt (sortiert korrekt).
function fasseProPersonZusammen(eintraege) {
  function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  const map = {};
  (eintraege || []).forEach(e => {
    if (!e) return;
    const vor  = String(e['Vorname']  == null ? '' : e['Vorname']).trim();
    const nach = String(e['Nachname'] == null ? '' : e['Nachname']).trim();
    const kid  = String(e['Kurs-ID']  == null ? '' : e['Kurs-ID']).trim();
    const datum = String(e['Datum'] == null ? '' : e['Datum']);
    const ts    = String(e['Timestamp'] == null ? '' : e['Timestamp']);
    const key = (nach + '|' + vor + '|' + kid).toLowerCase();
    if (!map[key]) {
      map[key] = {
        'Nachname': nach, 'Vorname': vor,
        'Kurs-Name': String(e['Kurs-Name'] == null ? kid : e['Kurs-Name']), 'Kurs-ID': kid,
        'Anzahl Besuche': 0, 'Erster Besuch': datum, 'Letzter Besuch': datum,
        _minTs: ts, _maxTs: ts
      };
    }
    const g = map[key];
    g['Anzahl Besuche']++;
    if (ts && (g._minTs === '' || ts < g._minTs)) { g._minTs = ts; g['Erster Besuch']  = datum; }
    if (ts && (g._maxTs === '' || ts > g._maxTs)) { g._maxTs = ts; g['Letzter Besuch'] = datum; }
  });
  const arr = Object.keys(map).map(k => map[k]);
  arr.sort((a, b) =>
    cmp(a['Kurs-Name'].toLowerCase(), b['Kurs-Name'].toLowerCase()) ||
    cmp(a['Nachname'].toLowerCase(),  b['Nachname'].toLowerCase())  ||
    cmp(a['Vorname'].toLowerCase(),   b['Vorname'].toLowerCase()));
  return arr;
}

// Einträge nach Kurs zählen -> [{kursId, kursName, anzahl}], absteigend sortiert.
function zaehleProKurs(eintraege) {
  const map = {};
  (eintraege || []).forEach(e => {
    const id = (e && e['Kurs-ID']) ? String(e['Kurs-ID']) : 'unbekannt';
    if (!map[id]) {
      map[id] = { kursId: id, kursName: (e && e['Kurs-Name']) ? String(e['Kurs-Name']) : id, anzahl: 0 };
    }
    map[id].anzahl++;
  });
  return Object.keys(map).map(k => map[k]).sort((a, b) => b.anzahl - a.anzahl);
}

// Dateiname für den Monats-Export, z. B. anwesenheit_2026-07_naeh-kurs.csv
function monatDateiname(monatIso, kursId) {
  const basis = 'anwesenheit_' + String(monatIso || 'monat');
  const suffix = kursId ? '_' + String(kursId).replace(/[^A-Za-z0-9\-_]/g, '') : '';
  return basis + suffix + '.csv';
}

// Node-Export (in Apps Script ist `module` undefined -> übersprungen)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXPORT_SPALTEN, QUARTAL_SPALTEN, csvFeld, baueCsv, istImMonat,
    monatVonDatum, istImZeitraum, monatDateiname, zaehleProKurs, fasseProPersonZusammen };
}
