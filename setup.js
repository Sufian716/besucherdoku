#!/usr/bin/env node
/**
 * setup.js – Vollautomatische Einrichtung des Anwesenheits-MVP
 *
 * Was dieses Script tut:
 *   1. Google-Konto verknüpfen (einmalige Browser-Interaktion)
 *   2. Apps Script Projekt erstellen und deployen
 *   3. Google Sheet mit korrekter Struktur anlegen
 *   4. Script-Properties setzen (AUTH_HASH, CHECKIN_KEY, ADMIN_EMAIL)
 *   5. Täglichen Mail-Trigger einrichten (18:00 Uhr)
 *   6. public/config.js mit der Web-App-URL aktualisieren
 *   7. Änderungen committen und pushen
 *
 * Einzige notwendige Nutzer-Interaktion:
 *   → Eine URL im Browser öffnen, Code einfügen, 4 Konfigurationsfragen beantworten
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT    = path.resolve(__dirname);
const AS_DIR  = path.join(ROOT, 'apps-script');
const PUB_DIR = path.join(ROOT, 'public');

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: ROOT, ...opts }).trim();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function frage(prompt) {
  // Synchrone Eingabe via /dev/tty
  try {
    const result = execSync(
      `bash -c 'read -p "${prompt.replace(/'/g, "'\\''")}" val && echo "$val"'`,
      { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }
    ).trim();
    return result;
  } catch {
    // Fallback: direkt von stdin (für Non-TTY-Umgebungen)
    const buf = Buffer.alloc(1024);
    process.stdout.write(prompt);
    const n = require('fs').readSync(0, buf, 0, 1024, null);
    return buf.slice(0, n).toString('utf8').trim();
  }
}

async function httpPost(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
  return resp.json().catch(() => ({}));
}

// ── Setup-Version von Code.gs ─────────────────────────────────────────────────
// Enthält zusätzlich den _setup-Handler. Nach der Einrichtung wird er gelöscht.

function setupCodeGs(setupToken) {
  // Liest Original und fügt Setup-Handler ein
  const orig = fs.readFileSync(path.join(AS_DIR, 'Code.gs'), 'utf8');

  const handler = `
// ═══ EINRICHTUNGS-CODE – wird nach dem Setup automatisch entfernt ═══════════

var _SETUP_TOKEN = '${setupToken}';

function _einrichtung_(body) {
  if (!body || body._token !== _SETUP_TOKEN) {
    return { ok: false, fehler: 'Ungültiger Setup-Token.' };
  }

  // Google Sheet erstellen
  var ss = SpreadsheetApp.create('Anwesenheit MVP');

  var kSheet = ss.getSheets()[0];
  kSheet.setName('Kurse');
  kSheet.getRange(1, 1, 1, 5).setValues([['Kurs-ID', 'Name', 'Aktiv', 'Erstellt-am', 'Notiz']]);
  kSheet.setFrozenRows(1);

  var aSheet = ss.insertSheet('Anwesenheit');
  aSheet.getRange(1, 1, 1, 6).setValues([['Name', 'Kurs-ID', 'Kurs-Name', 'Datum', 'Zeit', 'Timestamp']]);
  aSheet.setFrozenRows(1);

  // Script-Properties setzen
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(),
    AUTH_HASH:      body._authHash,
    CHECKIN_KEY:    body._checkinKey,
    ADMIN_EMAIL:    body._adminEmail
  });

  // Täglichen Mail-Trigger anlegen (falls noch nicht vorhanden)
  var triggers = ScriptApp.getProjectTriggers();
  var hatTrigger = triggers.some(function(t) {
    return t.getHandlerFunction() === 'taeglicheCSVMail';
  });
  if (!hatTrigger) {
    ScriptApp.newTrigger('taeglicheCSVMail')
      .timeBased().atHour(18).everyDays(1)
      .inTimezone('Europe/Berlin').create();
  }

  return {
    ok:              true,
    spreadsheetId:   ss.getId(),
    spreadsheetUrl:  ss.getUrl()
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
`;

  // doPost erweitern: _einrichtung-Action einfügen
  const erweiterterDoPost = orig.replace(
    "    if (body.endpoint === 'checkin') {",
    `    // Einmalige Einrichtung (wird nach Setup entfernt)
    if (body.action === '_einrichtung') {
      return json(_einrichtung_(body));
    }

    if (body.endpoint === 'checkin') {`
  );

  return handler + erweiterterDoPost;
}

// ── Haupt-Logik ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Anwesenheits-MVP – Vollautomatisches Setup  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── 1. Google-Login ─────────────────────────────────────────────────────────
  console.log('SCHRITT 1/7 – Google-Konto verknüpfen');
  console.log('Eine URL wird angezeigt. Bitte im Browser öffnen, einloggen,');
  console.log('den angezeigten Code kopieren und hier einfügen.\n');

  const loginResult = spawnSync('clasp', ['login', '--no-localhost'], {
    stdio: 'inherit',
    cwd: AS_DIR
  });
  if (loginResult.status !== 0) {
    throw new Error('clasp login fehlgeschlagen. Bitte erneut versuchen.');
  }

  // ── 2. Konfiguration abfragen ────────────────────────────────────────────────
  console.log('\nSCHRITT 2/7 – Konfiguration\n');

  const brandName     = frage('Name des Trägers [Bildungsträger]: ') || 'Bildungsträger';
  const adminPassword = frage('Admin-Passwort (wird als Hash gespeichert): ');
  const checkinKey    = frage('Checkin-Key [mvp-checkin-2025]: ')    || 'mvp-checkin-2025';
  const adminEmail    = frage('E-Mail-Adresse für tägliche CSV-Mail: ');

  if (!adminPassword) throw new Error('Admin-Passwort ist Pflichtfeld.');
  if (!adminEmail || !adminEmail.includes('@')) throw new Error('Gültige E-Mail-Adresse erforderlich.');

  const authHash   = sha256(adminPassword);
  const setupToken = crypto.randomBytes(32).toString('hex');

  console.log('\n✓ Passwort-Hash berechnet');
  console.log(`  SHA-256: ${authHash.substring(0, 16)}...`);

  // ── 3. Apps Script Projekt erstellen ────────────────────────────────────────
  console.log('\nSCHRITT 3/7 – Apps Script Projekt erstellen\n');

  // Setup-Version von Code.gs schreiben
  const originalCode = fs.readFileSync(path.join(AS_DIR, 'Code.gs'), 'utf8');
  fs.writeFileSync(path.join(AS_DIR, 'Code.gs'), setupCodeGs(setupToken));

  let scriptId, deploymentId;

  try {
    // Prüfen ob bereits ein .clasp.json existiert
    const claspJsonPath = path.join(AS_DIR, '.clasp.json');
    if (!fs.existsSync(claspJsonPath)) {
      const createOut = execSync(
        'clasp create --type standalone --title "Anwesenheit MVP"',
        { encoding: 'utf8', cwd: AS_DIR }
      );
      console.log(createOut.trim());
    } else {
      console.log('✓ Bestehendes Apps Script Projekt gefunden');
    }

    const claspJson = JSON.parse(fs.readFileSync(path.join(AS_DIR, '.clasp.json'), 'utf8'));
    scriptId = claspJson.scriptId;
    console.log(`  Script-ID: ${scriptId}`);

    // ── 4. Code pushen ─────────────────────────────────────────────────────────
    console.log('\nSCHRITT 4/7 – Code hochladen\n');
    execSync('clasp push -f', { stdio: 'inherit', cwd: AS_DIR });

    // ── 5. Als Web-App deployen ────────────────────────────────────────────────
    console.log('\nSCHRITT 5/7 – Als Web-App deployen\n');
    const deployOut = execSync('clasp deploy --description "v1"', {
      encoding: 'utf8',
      cwd: AS_DIR
    }).trim();
    console.log(deployOut);

    // Deployment-ID extrahieren
    // Erwartetes Format: "- AKfycb... @1."
    const deployMatch = deployOut.match(/[-–]\s+([A-Za-z0-9_-]{10,})\s+@/);
    if (!deployMatch) {
      throw new Error('Deployment-ID nicht gefunden in Ausgabe:\n' + deployOut);
    }
    deploymentId = deployMatch[1];
    const webAppUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
    console.log(`\n✓ Web-App-URL: ${webAppUrl}`);

    // Kurz warten damit Google die Deployment aktiviert
    console.log('\n  (warte 5 Sekunden auf Aktivierung...)');
    await new Promise(r => setTimeout(r, 5000));

    // ── 6. Einrichtung aufrufen ────────────────────────────────────────────────
    console.log('\nSCHRITT 6/7 – Google Sheet anlegen & Properties setzen\n');

    let setupErgebnis;
    let versuche = 0;
    while (versuche < 5) {
      setupErgebnis = await httpPost(webAppUrl, {
        action:      '_einrichtung',
        _token:      setupToken,
        _authHash:   authHash,
        _checkinKey: checkinKey,
        _adminEmail: adminEmail
      });

      if (setupErgebnis.ok) break;

      versuche++;
      console.log(`  Versuch ${versuche}: ${setupErgebnis.fehler || 'Keine Antwort'} – erneuter Versuch...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!setupErgebnis?.ok) {
      throw new Error(
        'Einrichtungs-Endpoint nicht erreichbar. Fehlermeldung: ' +
        (setupErgebnis?.fehler || 'unbekannt')
      );
    }

    console.log(`✓ Google Sheet erstellt: ${setupErgebnis.spreadsheetUrl}`);
    console.log(`  Spreadsheet-ID: ${setupErgebnis.spreadsheetId}`);
    console.log('✓ Script-Properties gesetzt');
    console.log('✓ Tages-Mail-Trigger angelegt (täglich 18:00 Uhr Berlin)');

    // ── 7. Saubere Version deployen ───────────────────────────────────────────
    console.log('\nSCHRITT 7/7 – Finale Version deployen & config.js aktualisieren\n');

    // Original Code.gs wiederherstellen
    fs.writeFileSync(path.join(AS_DIR, 'Code.gs'), originalCode);
    execSync('clasp push -f', { stdio: 'inherit', cwd: AS_DIR });

    // Deployment aktualisieren
    try {
      execSync(
        `clasp deploy --deploymentId "${deploymentId}" --description "v1"`,
        { encoding: 'utf8', cwd: AS_DIR }
      );
      console.log('✓ Deployment auf finale Version aktualisiert');
    } catch {
      // Manche clasp-Versionen brauchen --versionNumber
      execSync(
        `clasp deploy --deploymentId "${deploymentId}" --description "v1" --versionNumber 2`,
        { encoding: 'utf8', cwd: AS_DIR }
      );
    }

    // config.js aktualisieren
    const configPath = path.join(PUB_DIR, 'config.js');
    let configInhalt = fs.readFileSync(configPath, 'utf8');
    configInhalt = configInhalt
      .replace(
        /window\.WEBHOOK_URL\s*=\s*'[^']*'/,
        `window.WEBHOOK_URL = '${webAppUrl}'`
      )
      .replace(
        /window\.CHECKIN_KEY\s*=\s*'[^']*'/,
        `window.CHECKIN_KEY = '${checkinKey}'`
      )
      .replace(
        /window\.BRAND_NAME\s*=\s*'[^']*'/,
        `window.BRAND_NAME = '${brandName.replace(/'/g, "\\'")}'`
      );
    fs.writeFileSync(configPath, configInhalt);
    console.log('✓ public/config.js aktualisiert');

    // .gitignore: .clasp.json ausschließen (enthält Script-ID, nicht nötig im Repo)
    const gitignorePath = path.join(ROOT, '.gitignore');
    let gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes('.clasp.json')) {
      gitignore += '\n# clasp (projektspezifisch, nicht ins Repo)\napps-script/.clasp.json\n';
      fs.writeFileSync(gitignorePath, gitignore);
    }

    // Git commit & push
    try {
      process.chdir(ROOT);
      execSync('git add -A');
      execSync(`git commit -m "Setup: Apps Script deployt, config.js mit Web-App-URL aktualisiert"`, {
        encoding: 'utf8'
      });
      execSync('git push', { encoding: 'utf8' });
      console.log('✓ GitHub: Änderungen gepusht');
    } catch (gitErr) {
      console.log('⚠ Git Push fehlgeschlagen – bitte manuell pushen:\n  git push');
    }

    // ── Abschluss ──────────────────────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ✓  Einrichtung erfolgreich abgeschlossen!                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Web-App-URL:                                                    ║
║  ${webAppUrl.padEnd(64)} ║
║                                                                  ║
║  Google Sheet:                                                   ║
║  ${(setupErgebnis.spreadsheetUrl || '').substring(0, 64).padEnd(64)} ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  NÄCHSTER SCHRITT:                                               ║
║  Render.com verbinden:                                           ║
║  → render.com → New → Static Site → GitHub-Repo auswählen       ║
║  → Render erkennt render.yaml automatisch → Deploy              ║
╚══════════════════════════════════════════════════════════════════╝
`);

  } catch (err) {
    // Aufräumen: Original Code.gs wiederherstellen falls ein Fehler aufgetreten ist
    if (originalCode) {
      fs.writeFileSync(path.join(AS_DIR, 'Code.gs'), originalCode);
    }
    throw err;
  }
}

main().catch(err => {
  console.error('\n✗ Fehler:', err.message);
  process.exit(1);
});
