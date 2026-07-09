/**
 * Tests für die geteilte Namenslogik (apps-script/name-util.js).
 * Läuft ohne Framework: `node test/name.test.js` (oder `npm test`).
 */
const assert = require('assert');
const { nameSanitize, nameSplit, checkinName } = require('../apps-script/name-util.js');

let bestanden = 0;
let fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ✓ ' + name); }
  catch (e) { fehlgeschlagen++; console.error('  ✗ ' + name + '\n      ' + e.message); }
}

console.log('nameSanitize');
test('trimmt und entfernt gefährliche Zeichen', () => {
  assert.strictEqual(nameSanitize('  <b>Fatima</b> & Co  '), 'bFatima/b  Co');
});
test('kürzt auf 60 Zeichen', () => {
  assert.strictEqual(nameSanitize('a'.repeat(80)).length, 60);
});
test('null/undefined -> leerer String', () => {
  assert.strictEqual(nameSanitize(null), '');
  assert.strictEqual(nameSanitize(undefined), '');
});

console.log('nameSplit');
test('teilt Vor- und Nachname', () => {
  assert.deepStrictEqual(nameSplit('Fatima Yılmaz'), { vorname: 'Fatima', nachname: 'Yılmaz' });
});
test('Rest wird zum Nachnamen zusammengefasst', () => {
  assert.deepStrictEqual(nameSplit('Ali Al Kaabi'), { vorname: 'Ali', nachname: 'Al Kaabi' });
});
test('einzelnes Wort -> Nachname leer', () => {
  assert.deepStrictEqual(nameSplit('Fatima'), { vorname: 'Fatima', nachname: '' });
});
test('mehrfache Leerzeichen werden ignoriert', () => {
  assert.deepStrictEqual(nameSplit('  Anna   Schmidt '), { vorname: 'Anna', nachname: 'Schmidt' });
});

console.log('checkinName – akzeptiert');
test('getrennte Felder Vorname/Nachname', () => {
  assert.deepStrictEqual(
    checkinName({ vorname: 'Fatima', nachname: 'Yılmaz' }),
    { ok: true, vorname: 'Fatima', nachname: 'Yılmaz' }
  );
});
test('Umlaute und ß', () => {
  const r = checkinName({ vorname: 'Jörg', nachname: 'Weiß' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.vorname, 'Jörg');
  assert.strictEqual(r.nachname, 'Weiß');
});
test('Doppelname mit Bindestrich', () => {
  assert.strictEqual(checkinName({ vorname: 'Anna-Lena', nachname: 'Schmidt' }).ok, true);
});
test('Legacy: nur tnName wird gesplittet', () => {
  assert.deepStrictEqual(
    checkinName({ tnName: 'Max Mustermann' }),
    { ok: true, vorname: 'Max', nachname: 'Mustermann' }
  );
});
test('trimmt Whitespace in getrennten Feldern', () => {
  assert.deepStrictEqual(
    checkinName({ vorname: '  Ute  ', nachname: '  Beck ' }),
    { ok: true, vorname: 'Ute', nachname: 'Beck' }
  );
});

console.log('checkinName – abgelehnt');
test('nur Vorname (kein Nachname)', () => {
  assert.strictEqual(checkinName({ vorname: 'Fatima', nachname: '' }).ok, false);
});
test('nur tnName mit einem Wort', () => {
  assert.strictEqual(checkinName({ tnName: 'Fatima' }).ok, false);
});
test('zu kurzer Nachname (1 Zeichen)', () => {
  assert.strictEqual(checkinName({ vorname: 'Ali', nachname: 'X' }).ok, false);
});
test('zu kurzer Vorname (1 Zeichen)', () => {
  assert.strictEqual(checkinName({ vorname: 'F', nachname: 'Müller' }).ok, false);
});
test('leerer Body', () => {
  assert.strictEqual(checkinName({}).ok, false);
  assert.strictEqual(checkinName(null).ok, false);
});
test('Fehlermeldung ist gesetzt', () => {
  assert.strictEqual(checkinName({ vorname: 'A' }).fehler, 'Bitte Vor- und Nachnamen angeben.');
});

console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen === 0 ? 0 : 1);
