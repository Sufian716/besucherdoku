/**
 * Tests für die Export-/CSV-Logik (apps-script/export-util.js).
 * Läuft ohne Framework: `node test/export.test.js`.
 */
const assert = require('assert');
const { csvFeld, baueCsv, istImMonat, monatDateiname, zaehleProKurs,
        monatVonDatum, istImZeitraum, fasseProPersonZusammen, QUARTAL_SPALTEN } = require('../apps-script/export-util.js');

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

console.log('zaehleProKurs');
test('leere Liste -> []', () => assert.deepStrictEqual(zaehleProKurs([]), []));
test('gruppiert und zählt pro Kurs', () => {
  const e = [
    { 'Kurs-ID': 'naeh', 'Kurs-Name': 'Näh Kurs' },
    { 'Kurs-ID': 'naeh', 'Kurs-Name': 'Näh Kurs' },
    { 'Kurs-ID': 'deutsch', 'Kurs-Name': 'Deutsch A1' }
  ];
  assert.deepStrictEqual(zaehleProKurs(e), [
    { kursId: 'naeh', kursName: 'Näh Kurs', anzahl: 2 },
    { kursId: 'deutsch', kursName: 'Deutsch A1', anzahl: 1 }
  ]);
});
test('absteigend sortiert', () => {
  const e = [
    { 'Kurs-ID': 'a', 'Kurs-Name': 'A' },
    { 'Kurs-ID': 'b', 'Kurs-Name': 'B' }, { 'Kurs-ID': 'b', 'Kurs-Name': 'B' }
  ];
  assert.strictEqual(zaehleProKurs(e)[0].kursId, 'b');
});
test('fehlende Kurs-ID -> unbekannt', () => {
  assert.strictEqual(zaehleProKurs([{}])[0].kursId, 'unbekannt');
});

console.log('monatVonDatum / istImZeitraum');
test('monatVonDatum', () => {
  assert.strictEqual(monatVonDatum('13.07.2026'), '2026-07');
  assert.strictEqual(monatVonDatum('2026-07-13'), '');
});
test('istImZeitraum im Bereich + Grenzen', () => {
  assert.strictEqual(istImZeitraum('13.07.2026', '2026-05', '2026-07'), true);
  assert.strictEqual(istImZeitraum('01.05.2026', '2026-05', '2026-07'), true);
  assert.strictEqual(istImZeitraum('30.09.2026', '2026-07', '2026-09'), true);
});
test('istImZeitraum außerhalb', () => {
  assert.strictEqual(istImZeitraum('13.04.2026', '2026-05', '2026-07'), false);
  assert.strictEqual(istImZeitraum('13.08.2026', '2026-05', '2026-07'), false);
});
test('istImZeitraum vertauschte Grenzen toleriert', () => {
  assert.strictEqual(istImZeitraum('13.06.2026', '2026-07', '2026-05'), true);
});
test('istImZeitraum ungültig -> false', () => {
  assert.strictEqual(istImZeitraum('', '2026-05', '2026-07'), false);
  assert.strictEqual(istImZeitraum('13.06.2026', 'quatsch', '2026-07'), false);
});

console.log('fasseProPersonZusammen');
const Q_EINTR = [
  { Vorname:'Ute', Nachname:'Beck', 'Kurs-ID':'naeh', 'Kurs-Name':'Näh Kurs', Datum:'02.07.2026', Timestamp:'2026-07-02T09:15:00Z' },
  { Vorname:'Ute', Nachname:'Beck', 'Kurs-ID':'naeh', 'Kurs-Name':'Näh Kurs', Datum:'16.07.2026', Timestamp:'2026-07-16T09:20:00Z' },
  { Vorname:'Ute', Nachname:'Beck', 'Kurs-ID':'naeh', 'Kurs-Name':'Näh Kurs', Datum:'09.07.2026', Timestamp:'2026-07-09T09:12:00Z' },
  { Vorname:'Jessica', Nachname:'Widdig', 'Kurs-ID':'naeh', 'Kurs-Name':'Näh Kurs', Datum:'15.07.2026', Timestamp:'2026-07-15T10:00:00Z' },
  { Vorname:'Ute', Nachname:'Beck', 'Kurs-ID':'deutsch', 'Kurs-Name':'Deutsch A2', Datum:'20.07.2026', Timestamp:'2026-07-20T14:00:00Z' }
];
test('dedupliziert pro Person + Kurs', () => {
  assert.strictEqual(fasseProPersonZusammen(Q_EINTR).length, 3); // Beck/naeh, Widdig/naeh, Beck/deutsch
});
test('Anzahl Besuche stimmt', () => {
  const beckNaeh = fasseProPersonZusammen(Q_EINTR).find(r => r.Nachname==='Beck' && r['Kurs-ID']==='naeh');
  assert.strictEqual(beckNaeh['Anzahl Besuche'], 3);
});
test('erster/letzter Besuch via Timestamp (Reihenfolge egal)', () => {
  const beckNaeh = fasseProPersonZusammen(Q_EINTR).find(r => r.Nachname==='Beck' && r['Kurs-ID']==='naeh');
  assert.strictEqual(beckNaeh['Erster Besuch'], '02.07.2026');
  assert.strictEqual(beckNaeh['Letzter Besuch'], '16.07.2026');
});
test('sortiert nach Kurs-Name, dann Nachname', () => {
  const r = fasseProPersonZusammen(Q_EINTR);
  assert.strictEqual(r[0]['Kurs-Name'], 'Deutsch A2');       // Deutsch vor Näh
  assert.strictEqual(r[1].Nachname, 'Beck');                 // in Näh: Beck vor Widdig
  assert.strictEqual(r[2].Nachname, 'Widdig');
});
test('leere Liste -> []', () => assert.deepStrictEqual(fasseProPersonZusammen([]), []));
test('als CSV mit QUARTAL_SPALTEN', () => {
  const csv = baueCsv(fasseProPersonZusammen(Q_EINTR), QUARTAL_SPALTEN);
  assert.strictEqual(csv.slice(1).split('\r\n')[0], 'Nachname;Vorname;Kurs-Name;Kurs-ID;Anzahl Besuche;Erster Besuch;Letzter Besuch');
});

console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen === 0 ? 0 : 1);
