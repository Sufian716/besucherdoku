/**
 * Code.gs – Anwesenheits-MVP Backend
 * Google Apps Script Web App – ersetzt alle drei n8n-Workflows.
 *
 * Deployment: "Als Web-App bereitstellen" → Ausführen als: Ich, Zugriff: Jeder
 *
 * Script-Properties einmalig setzen (Projekteinstellungen → Script-Properties):
 *   SPREADSHEET_ID  – ID des Google Sheets (aus der URL)
 *   AUTH_HASH       – SHA-256-Hash des Admin-Passworts (Hex-String, 64 Zeichen)
 *   CHECKIN_KEY     – Shared-Secret für den öffentlichen Checkin-Endpunkt
 *   ADMIN_EMAIL     – Empfänger der täglichen CSV-Mail
 */

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Datumswert normalisieren: Google Sheets liefert Datumszellen als Date-Objekte
function normDatum(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd.MM.yyyy');
  }
  return String(val);
}

// Sheet-Daten als Array von Objekten – Date-Objekte werden normalisiert
function sheetToObjects(sheet) {
  const tz   = Session.getScriptTimeZone();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const header = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    header.forEach((key, i) => {
      const val = row[i];
      if (val instanceof Date) {
        obj[String(key)] = String(key) === 'Zeit'
          ? Utilities.formatDate(val, tz, 'HH:mm')
          : Utilities.formatDate(val, tz, 'dd.MM.yyyy');
      } else {
        obj[String(key)] = val;
      }
    });
    return obj;
  });
}

// ── Einstiegspunkte ───────────────────────────────────────────────────────────

// doGet: Wird nur aufgerufen um zu prüfen ob die Web-App erreichbar ist
function doGet() {
  return ContentService
    .createTextOutput('Anwesenheits-MVP API – OK')
    .setMimeType(ContentService.MimeType.TEXT);
}


// doPost: Zentraler Router – alle Frontend-Requests landen hier
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, fehler: 'Kein Request-Body empfangen.' });
    }

    const body = JSON.parse(e.postData.contents);

    // Routing: Checkin ist öffentlich, alles andere braucht Auth
    if (body.endpoint === 'checkin') {
      return handleCheckin(body);
    }
    return handleCourseAction(body);

  } catch (err) {
    return json({ ok: false, fehler: 'Serverfehler: ' + err.message });
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkAuth(authToken) {
  const expected = prop('AUTH_HASH');
  if (!expected) return 'Server-Konfigurationsfehler: AUTH_HASH fehlt.';
  if (!authToken || authToken !== expected) return 'Nicht autorisiert.';
  return null; // null = OK
}

// ── Checkin-Handler ───────────────────────────────────────────────────────────

function handleCheckin(body) {
  const { checkinKey, tnId, tnName, kursId } = body;

  const expectedKey = prop('CHECKIN_KEY');
  if (!expectedKey) return json({ ok: false, fehler: 'CHECKIN_KEY nicht konfiguriert.' });
  if (!checkinKey || checkinKey !== expectedKey) {
    return json({ ok: false, fehler: 'Ungültiger Checkin-Schlüssel.' });
  }

  if (!tnId || !/^[A-Za-z0-9\-_]{1,50}$/.test(String(tnId).trim())) {
    return json({ ok: false, fehler: 'Ungültige oder fehlende TN-ID.' });
  }
  if (!kursId || !/^[A-Za-z0-9\-_]{1,50}$/.test(String(kursId).trim())) {
    return json({ ok: false, fehler: 'Ungültige oder fehlende Kurs-ID.' });
  }

  const ss      = SpreadsheetApp.openById(prop('SPREADSHEET_ID'));
  const kSheet  = ss.getSheetByName('Kurse');
  const kData   = kSheet.getDataRange().getValues();
  const hdr     = kData[0];
  const idIdx   = hdr.indexOf('Kurs-ID');
  const aktIdx  = hdr.indexOf('Aktiv');
  const nameIdx = hdr.indexOf('Name');

  let kursName = null;
  for (let i = 1; i < kData.length; i++) {
    if (String(kData[i][idIdx]) === kursId.trim() &&
        String(kData[i][aktIdx]).toLowerCase() === 'ja') {
      kursName = kData[i][nameIdx];
      break;
    }
  }

  if (!kursName) {
    return json({ ok: false, fehler: 'Kurs "' + kursId + '" nicht gefunden oder nicht aktiv.' });
  }

  const aSheet    = ss.getSheetByName('Anwesenheit');
  const tz        = Session.getScriptTimeZone();
  const now       = new Date();
  const datum     = Utilities.formatDate(now, tz, 'dd.MM.yyyy');
  const zeit      = Utilities.formatDate(now, tz, 'HH:mm');
  const timestamp = now.toISOString();
  const sauberName = tnName
    ? String(tnName).replace(/[<>"'&]/g, '').trim().substring(0, 100)
    : '';

  aSheet.appendRow([tnId.trim(), sauberName, kursId.trim(), kursName, datum, zeit, timestamp]);

  return json({ ok: true, nachricht: 'Anwesenheit erfasst.' });
}

// ── Kurs-CRUD + Dashboard ─────────────────────────────────────────────────────

function handleCourseAction(body) {
  const authFehler = checkAuth(body.authToken);
  if (authFehler) return json({ ok: false, fehler: authFehler, nichtAutorisiert: true });

  const ss = SpreadsheetApp.openById(prop('SPREADSHEET_ID'));

  switch (body.action) {
    case 'list':       return actionList(ss);
    case 'create':     return actionCreate(ss, body);
    case 'update':     return actionUpdate(ss, body);
    case 'deactivate': return actionDeactivate(ss, body);
    case 'today':      return actionToday(ss);
    case 'filter':     return actionFilter(ss, body);
    case 'mailNow':    return actionMailNow(ss, body);
    default:           return json({ ok: false, fehler: 'Unbekannte Aktion: ' + body.action });
  }
}

function actionList(ss) {
  return json({ ok: true, kurse: sheetToObjects(ss.getSheetByName('Kurse')) });
}

function actionCreate(ss, body) {
  let { name, kursId, notiz } = body;

  name = name ? String(name).replace(/[<>"']/g, '').trim().substring(0, 100) : '';
  if (!name) return json({ ok: false, fehler: 'Kursname ist Pflichtfeld.' });

  if (!kursId) {
    kursId = name.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 30);
  }
  kursId = String(kursId).trim();
  if (!/^[A-Za-z0-9\-_]{1,50}$/.test(kursId)) {
    return json({ ok: false, fehler: 'Kurs-ID ungültig (Buchstaben, Zahlen, Bindestrich, Unterstrich).' });
  }

  notiz = notiz ? String(notiz).replace(/[<>"']/g, '').trim().substring(0, 200) : '';

  const sheet = ss.getSheetByName('Kurse');
  const tz = Session.getScriptTimeZone();
  const erstelltAm = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');

  sheet.appendRow([kursId, name, 'ja', erstelltAm, notiz]);
  return json({ ok: true, kursId, name });
}

function actionUpdate(ss, body) {
  let { kursId, name, notiz } = body;
  kursId = kursId ? String(kursId).trim() : '';
  if (!kursId) return json({ ok: false, fehler: 'Kurs-ID für Update erforderlich.' });

  name  = name  ? String(name).replace(/[<>"']/g, '').trim().substring(0, 100)  : '';
  notiz = notiz !== undefined ? String(notiz).replace(/[<>"']/g, '').trim().substring(0, 200) : null;

  const sheet  = ss.getSheetByName('Kurse');
  const data   = sheet.getDataRange().getValues();
  const hdr    = data[0];
  const idIdx  = hdr.indexOf('Kurs-ID');
  const nIdx   = hdr.indexOf('Name');
  const notIdx = hdr.indexOf('Notiz');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === kursId) {
      if (name)         sheet.getRange(i + 1, nIdx   + 1).setValue(name);
      if (notiz !== null) sheet.getRange(i + 1, notIdx + 1).setValue(notiz);
      return json({ ok: true });
    }
  }
  return json({ ok: false, fehler: 'Kurs "' + kursId + '" nicht gefunden.' });
}

function actionDeactivate(ss, body) {
  const kursId = body.kursId ? String(body.kursId).trim() : '';
  if (!kursId) return json({ ok: false, fehler: 'Kurs-ID erforderlich.' });

  const sheet = ss.getSheetByName('Kurse');
  const data  = sheet.getDataRange().getValues();
  const hdr   = data[0];
  const idIdx = hdr.indexOf('Kurs-ID');
  const akIdx = hdr.indexOf('Aktiv');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === kursId) {
      sheet.getRange(i + 1, akIdx + 1).setValue('nein');
      return json({ ok: true });
    }
  }
  return json({ ok: false, fehler: 'Kurs "' + kursId + '" nicht gefunden.' });
}

function actionToday(ss) {
  const tz    = Session.getScriptTimeZone();
  const heute = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
  const alle  = sheetToObjects(ss.getSheetByName('Anwesenheit'));
  const heutige = alle.filter(e => normDatum(e['Datum']) === heute);
  return json({ ok: true, eintraege: heutige, datum: heute });
}

// ── Filter-Abfrage ────────────────────────────────────────────────────────────

function actionFilter(ss, body) {
  const datum  = body.datum  ? String(body.datum).trim()  : null;
  const kursId = body.kursId ? String(body.kursId).trim() : null;

  const alle      = sheetToObjects(ss.getSheetByName('Anwesenheit'));
  const gefiltert = alle.filter(e => {
    const datumMatch = !datum  || normDatum(e['Datum']) === datum;
    const kursMatch  = !kursId || String(e['Kurs-ID'])  === kursId;
    return datumMatch && kursMatch;
  });

  return json({ ok: true, eintraege: gefiltert });
}

// ── Manueller Mail-Versand ────────────────────────────────────────────────────

function actionMailNow(ss, body) {
  const empfaenger = body.empfaenger ? String(body.empfaenger).trim() : prop('ADMIN_EMAIL');
  if (!empfaenger || !empfaenger.includes('@')) {
    return json({ ok: false, fehler: 'Ungültige E-Mail-Adresse.' });
  }

  const tz           = Session.getScriptTimeZone();
  const datum        = body.datum  ? String(body.datum).trim()
                     : Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
  const kursIdFilter = body.kursId  ? String(body.kursId).trim()  : null;
  const loeschen     = body.loeschen === true;

  const alle      = sheetToObjects(ss.getSheetByName('Anwesenheit'));
  const gefiltert = alle.filter(e => {
    const datumMatch = normDatum(e['Datum']) === datum;
    const kursMatch  = !kursIdFilter || String(e['Kurs-ID']) === kursIdFilter;
    return datumMatch && kursMatch;
  });

  const spalten = ['TN-ID', 'Name', 'Kurs-ID', 'Kurs-Name', 'Datum', 'Zeit', 'Timestamp'];

  function csvFeld(wert) {
    const s = String(wert ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const zeilen    = [spalten.join(';')];
  gefiltert.forEach(e => zeilen.push(spalten.map(sp => csvFeld(e[sp])).join(';')));
  const csvInhalt = '﻿' + zeilen.join('\r\n');
  const kursInfo  = kursIdFilter ? ' – ' + kursIdFilter : '';
  const dateiName = 'anwesenheit_' + datum.replace(/\./g, '-')
                  + (kursIdFilter ? '_' + kursIdFilter : '') + '.csv';

  MailApp.sendEmail({
    to:          empfaenger,
    subject:     'Anwesenheitsliste ' + datum + kursInfo + ' – ' + gefiltert.length + ' Einträge',
    body:        'Anbei die Anwesenheitsliste vom ' + datum + kursInfo + '.\n\n'
               + 'Anzahl Einträge: ' + gefiltert.length + '\n\n'
               + 'Diese E-Mail wurde aus dem Admin-Bereich gesendet.',
    attachments: [Utilities.newBlob(csvInhalt, 'text/csv; charset=utf-8', dateiName)]
  });

  if (loeschen && gefiltert.length > 0) {
    const aSheet   = ss.getSheetByName('Anwesenheit');
    const raw      = aSheet.getDataRange().getValues();
    const hdr      = raw[0];
    const datumIdx = hdr.indexOf('Datum');
    const kursIdx  = hdr.indexOf('Kurs-ID');
    for (let i = raw.length - 1; i >= 1; i--) {
      const rowDatum = normDatum(raw[i][datumIdx]);
      const rowKurs  = String(raw[i][kursIdx]);
      if (rowDatum === datum && (!kursIdFilter || rowKurs === kursIdFilter)) {
        aSheet.deleteRow(i + 1);
      }
    }
  }

  return json({ ok: true, nachricht: 'Mail gesendet.', anzahl: gefiltert.length, geloescht: loeschen });
}

// ── Tägliche CSV-Mail (als Time-Trigger einrichten, nicht über Web-App) ───────

function taeglicheCSVMail() {
  const ss    = SpreadsheetApp.openById(prop('SPREADSHEET_ID'));
  const tz    = Session.getScriptTimeZone();
  const heute = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
  const alle  = sheetToObjects(ss.getSheetByName('Anwesenheit'));
  const heutige = alle.filter(e => normDatum(e['Datum']) === heute);

  const spalten = ['TN-ID', 'Name', 'Kurs-ID', 'Kurs-Name', 'Datum', 'Zeit', 'Timestamp'];

  function csvFeld(wert) {
    const s = String(wert ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const zeilen = [spalten.join(';')];
  heutige.forEach(e => zeilen.push(spalten.map(sp => csvFeld(e[sp])).join(';')));

  // UTF-8 BOM + CRLF – so öffnet Excel auf deutschen Systemen die Datei korrekt
  const csvInhalt = '﻿' + zeilen.join('\r\n');
  const dateiName = 'anwesenheit_' + heute.replace(/\./g, '-') + '.csv';
  const adminEmail = prop('ADMIN_EMAIL');
  if (!adminEmail) return;

  MailApp.sendEmail({
    to: adminEmail,
    subject: 'Anwesenheitsliste ' + heute + ' – ' + heutige.length + ' Einträge',
    body: 'Anbei die Anwesenheitsliste vom ' + heute + '.\n\n'
        + 'Anzahl Einträge: ' + heutige.length + '\n\n'
        + 'Diese E-Mail wurde automatisch generiert.',
    attachments: [Utilities.newBlob(csvInhalt, 'text/csv; charset=utf-8', dateiName)]
  });
}

// ── Einmalig: Time-Trigger anlegen ────────────────────────────────────────────
// Diese Funktion einmal manuell ausführen – danach nicht mehr nötig.
function triggerAnlegen() {
  // Prüfen ob Trigger schon existiert
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'taeglicheCSVMail') return;
  }
  ScriptApp.newTrigger('taeglicheCSVMail')
    .timeBased()
    .atHour(18)
    .everyDays(1)
    .inTimezone('Europe/Berlin')
    .create();
}
