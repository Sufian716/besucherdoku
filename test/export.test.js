/**
 * Tests für die Export-/CSV-Logik (apps-script/export-util.js).
 * Läuft ohne Framework: `node test/export.test.js`.
 */
const assert = require('assert');
const { csvFeld, baueCsv, istImMonat, monatDateiname } = require('../apps-script/export-util.js');

let bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ✓ ' + name); }
  catch (e) { fehlgeschlagen++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}

const SPALTEN = ['Vorname', 'Nachname', 'Kurs-ID', 'Kurs-Name', 'Datum', 'Zeit', 'Timestamp'];

console.log('istImMonat');
test('Treffer im Monat', () => assert.strictEqual(istImMonat('13.07.2026', '2026-07'), true));
test('erster/letzter Tag', () => {
  assert.strictEqual(istImMonat('01.07.2026', '2026-07'), true);
  assert.strictEqual(istImMonat('31.07.2026', '2026-07'), true);
});
test('falscher Monat', () => assert.strictEqual(istImMonat('01.08.2026', '2026-07'), false));
test('falsches Jahr', () => assert.strictEqual(istImMonat('13.07.2025', '2026-07'), false));
test('leer/ungültig -> false', () => {
  assert.strictEqual(istImMonat('', '2026-07'), false);
  assert.strictEqual(istImMonat('13.07.2026', ''), false);
  assert.strictEqual(istImMonat('2026-07-13', '2026-07'), false);
  assert.strictEqual(istImMonat(null, null), false);
});

console.log('csvFeld');
test('einfacher Wert unverändert', () => assert.strictEqual(csvFeld('Fatima'), 'Fatima'));
test('Semikolon wird gequotet', () => assert.strictEqual(csvFeld('a;b'), '"a;b"'));
test('Anführungszeichen verdoppelt', () => assert.strictEqual(csvFeld('a"b'), '"a""b"'));
test('Zeilenumbruch wird gequotet', () => assert.strictEqual(csvFeld('a\nb'), '"a\nb"'));
test('null -> leer', () => assert.strictEqual(csvFeld(null), ''));

console.log('baueCsv');
test('Header + Zeile, BOM + CRLF', () => {
  const csv = baueCsv([{ Vorname: 'Fatima', Nachname: 'Yılmaz', 'Kurs-ID': 'naeh-kurs',
    'Kurs-Name': 'Näh Kurs', Datum: '13.07.2026', Zeit: '09:15', Timestamp: '2026-07-13T09:15:00' }], SPALTEN);
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'BOM am Anfang');
  const zeilen = csv.slice(1).split('\r\n');
  assert.strictEqual(zeilen[0], 'Vorname;Nachname;Kurs-ID;Kurs-Name;Datum;Zeit;Timestamp');
  assert.strictEqual(zeilen[1], 'Fatima;Yılmaz;naeh-kurs;Näh Kurs;13.07.2026;09:15;2026-07-13T09:15:00');
});
test('leere Liste -> nur Header', () => {
  const csv = baueCsv([], SPALTEN);
  assert.strictEqual(csv.slice(1), SPALTEN.join(';'));
});
test('escaping in Zeile (Semikolon im Namen)', () => {
  const csv = baueCsv([{ Vorname: 'A;B', Nachname: 'C' }], ['Vorname', 'Nachname']);
  assert.strictEqual(csv.slice(1).split('\r\n')[1], '"A;B";C');
});

console.log('monatDateiname');
test('mit Kurs', () => assert.strictEqual(monatDateiname('2026-07', 'naeh-kurs'), 'anwesenheit_2026-07_naeh-kurs.csv'));
test('ohne Kurs', () => assert.strictEqual(monatDateiname('2026-07', ''), 'anwesenheit_2026-07.csv'));

console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen === 0 ? 0 : 1);
