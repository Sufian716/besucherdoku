# Anwesenheits-MVP

Digitale Anwesenheitserfassung per QR-Code für Bildungsträger.  
Technologie: statisches HTML/CSS/JS-Frontend · Google Apps Script · Google Sheets · Render.com

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Google Sheet anlegen](#2-google-sheet-anlegen)
3. [Apps Script einrichten](#3-apps-script-einrichten)
4. [Auth-Hash berechnen](#4-auth-hash-berechnen)
5. [Script-Properties setzen](#5-script-properties-setzen)
6. [Web-App deployen und URL kopieren](#6-web-app-deployen-und-url-kopieren)
7. [Tages-Mail-Trigger einrichten](#7-tages-mail-trigger-einrichten)
8. [config.js anpassen](#8-configjs-anpassen)
9. [Auf Render deployen](#9-auf-render-deployen)
10. [Ersten Kurs anlegen und QR-Code drucken](#10-ersten-kurs-anlegen-und-qr-code-drucken)
11. [End-to-End-Test](#11-end-to-end-test)
12. [Stepnova-Import](#12-stepnova-import)
13. [Datenschutz-Checkliste](#13-datenschutz-checkliste)
14. [Troubleshooting](#14-troubleshooting)
15. [Was dieser MVP bewusst NICHT macht](#15-was-dieser-mvp-bewusst-nicht-macht)

---

## 1. Voraussetzungen

| Dienst | Kosten | Hinweis |
|---|---|---|
| Google-Konto mit Google Sheets | kostenlos | Google-Konto reicht, kein Workspace nötig |
| Render.com | kostenloser Static-Site-Plan | Ausreichend für dieses Frontend |
| GitHub-Konto | kostenlos | Für Render-Deployment |

Kein separater Mail-Server nötig: Apps Script nutzt das verknüpfte Google-Konto zum Versenden (bis 100 Mails/Tag im kostenlosen Plan).

---

## 2. Google Sheet anlegen

1. Neues Google Sheets Dokument erstellen: **„Anwesenheit MVP"**
2. **Tabellenblatt 1** umbenennen in: `Kurse`  
   Spaltenköpfe in Zeile 1 exakt so eingeben (Groß-/Kleinschreibung beachten):
   ```
   Kurs-ID | Name | Aktiv | Erstellt-am | Notiz
   ```
3. **Tabellenblatt 2** anlegen, umbenennen in: `Anwesenheit`  
   Spaltenköpfe in Zeile 1:
   ```
   Vorname | Nachname | Kurs-ID | Kurs-Name | Datum | Zeit | Timestamp
   ```
4. Die **Spreadsheet-ID** aus der URL kopieren:  
   `https://docs.google.com/spreadsheets/d/`**`DIESE_ID_HIER`**`/edit`

> Die Spaltennamen müssen exakt übereinstimmen — das Apps Script liest sie per Kopfzeile.

---

## 3. Apps Script einrichten

### Option A: Direkt im Google Sheet (empfohlen)

1. Google Sheet öffnen → **Erweiterungen** → **Apps Script**
2. Die Datei `Code.gs` wird automatisch angelegt
3. Den gesamten Inhalt von `apps-script/Code.gs` aus diesem Repository hineinkopieren und speichern

### Option B: Standalone Script

1. [script.google.com](https://script.google.com) → **Neues Projekt**
2. Inhalt von `apps-script/Code.gs` einfügen
3. `appsscript.json` einblenden: **Projekteinstellungen** → „appsscript.json-Manifestdatei im Editor anzeigen" aktivieren  
   Dann Inhalt von `apps-script/appsscript.json` einfügen

> **Option A ist einfacher**: Das Script hat dann automatisch Zugriff auf das Sheet — `SPREADSHEET_ID` kann trotzdem gesetzt werden, ist aber beim direkten Zugriff via `SpreadsheetApp.getActiveSpreadsheet()` auch weglassbar.  
> *Wir empfehlen trotzdem, SPREADSHEET_ID zu setzen — dann funktioniert das Script auch wenn es nicht aus dem Sheet heraus geöffnet wird.*

---

## 4. Auth-Hash berechnen

Das Admin-Passwort wird **niemals im Klartext** gespeichert. Apps Script speichert nur den SHA-256-Hash.

**Hash erzeugen** (in der Browser-Konsole oder Terminal):

```bash
# Terminal (Linux/Mac)
echo -n "IhrSicheresPasswort" | sha256sum

# Node.js
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('IhrSicheresPasswort').digest('hex'))"
```

Den ausgegebenen Hex-String (64 Zeichen) notieren — er kommt in Schritt 5.

---

## 5. Script-Properties setzen

Im Apps Script Editor: **Projekteinstellungen** → **Script-Properties** → **Script-Property hinzufügen**

| Property | Beispielwert | Beschreibung |
|---|---|---|
| `SPREADSHEET_ID` | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` | ID aus der Google-Sheets-URL |
| `AUTH_HASH` | `a3f5b2c1...` (64 Zeichen) | SHA-256-Hash des Admin-Passworts (→ Schritt 4) |
| `CHECKIN_KEY` | `mvp-checkin-2025` | Shared-Secret für den öffentlichen Checkin-Endpunkt |
| `ADMIN_EMAIL` | `verwaltung@traeger.de` | Empfänger der täglichen CSV-Mail |

---

## 6. Web-App deployen und URL kopieren

1. Im Apps Script Editor: **Bereitstellen** → **Neue Bereitstellung**
2. Typ: **Web-App**
3. Einstellungen:
   - Beschreibung: `v1`
   - **Ausführen als:** Ich (your@email.com)
   - **Zugriff:** Jeder
4. **Bereitstellen** klicken → Google fragt nach Berechtigungen → erlauben
5. Die **Web-App-URL** kopieren:  
   `https://script.google.com/macros/s/`**`LANGE_DEPLOYMENT_ID`**`/exec`

Diese URL kommt in `config.js` (→ Schritt 8).

> **Wichtig bei Änderungen:** Nach jeder Code-Änderung muss eine **neue Bereitstellung** erstellt werden (`Bereitstellen` → `Bereitstellungen verwalten` → Stift-Symbol → `Neue Version`). Die URL bleibt gleich.

---

## 7. Tages-Mail-Trigger einrichten

Einmalig ausführen — danach läuft der Trigger automatisch täglich um 18:00 Uhr (Berlin):

1. Im Apps Script Editor die Funktion `triggerAnlegen` auswählen
2. ▶ **Ausführen** klicken
3. Unter **Trigger** (Uhr-Symbol links) prüfen, ob `taeglicheCSVMail` um 18:00 Uhr eingetragen ist

Alternativ manuell: **Trigger** → **+ Trigger hinzufügen** → Funktion: `taeglicheCSVMail`, Ereignistyp: Zeitgesteuert, Täglich, 18:00–19:00 Uhr.

---

## 8. config.js anpassen

Datei `public/config.js` bearbeiten:

```js
// Web-App-URL aus Schritt 6
window.WEBHOOK_URL = 'https://script.google.com/macros/s/IHRE_DEPLOYMENT_ID/exec';

// Muss mit der Script-Property CHECKIN_KEY übereinstimmen
window.CHECKIN_KEY = 'mvp-checkin-2025';

// Angezeigter Name in der Oberfläche
window.BRAND_NAME = 'Bildungsträger gGmbH';
```

Änderungen committen und pushen — Render deployed automatisch.

---

## 9. Auf Render deployen

1. Dieses Repository auf GitHub liegen (✓ bereits erledigt)
2. [render.com](https://render.com) → **New** → **Static Site**
3. GitHub-Repo verbinden
4. Render erkennt `render.yaml` automatisch → **Deploy**

Die Website ist nach ~1 Minute unter der Render-URL erreichbar.

---

## 10. Ersten Kurs anlegen und QR-Code drucken

1. `/admin` aufrufen, Admin-Passwort eingeben
2. **„Neuen Kurs anlegen"** klicken
3. Name eingeben — die Kurs-ID wird automatisch vorgeschlagen
4. Speichern
5. In der Kursliste auf **„QR-Code"** klicken
6. **„Drucken (A4)"** → Browser-Druckdialog → als PDF oder direkt drucken
7. Ausdruck im Kursraum aufhängen

---

## 11. End-to-End-Test

1. QR-Code mit dem Smartphone scannen
2. Testdaten eingeben: Name `Test Teilnehmer`
3. Absenden → Erfolgsmeldung prüfen
4. Im Admin-Bereich → **„Heute anwesend"**: Eintrag sollte erscheinen
5. Im Google Sheet Tabellenblatt „Anwesenheit": Zeile prüfen
6. Tages-Mail testen: Im Apps Script Editor Funktion `taeglicheCSVMail` manuell ausführen → Mail prüfen

---

## 12. Stepnova-Import

### CSV-Format

Die tägliche Mail enthält eine CSV-Datei (Semikolon-getrennt, UTF-8 mit BOM, CRLF-Zeilenenden):

```
Vorname;Nachname;Kurs-ID;Kurs-Name;Datum;Zeit;Timestamp
Max;Mustermann;DEUTSCH-A1;Deutsch A1;06.05.2025;09:15;2025-05-06T09:15:00
```

### Import in Stepnova

1. CSV-Datei aus der Mail herunterladen
2. Stepnova → Modul Anwesenheiten → CSV-Import
3. Spaltenzuordnung einmalig konfigurieren und als Profil speichern
4. Datei importieren, Vorschau prüfen, bestätigen

### SFTP-Automatisierung (spätere Ausbaustufe)

Falls Stepnova das SFTP-Modul lizenziert hat: Apps Script kann per `UrlFetchApp` oder einem Zwischenschritt Dateien per SFTP ablegen. Aufwand: ~1 Tag Entwicklung.

---

## 13. Datenschutz-Checkliste

- [ ] **Auftragsverarbeitungsvertrag (AVV)** mit Google abgeschlossen (Google Workspace oder Google Cloud Console → Einstellungen → Nutzungsbedingungen für die Datenverarbeitung)
- [ ] **AVV** mit Render.com (DPA unter render.com/privacy)
- [ ] **Datenschutzinformation** für Teilnehmende vorhanden (was wird erfasst, wie lange gespeichert, Rechtsgrundlage)
- [ ] Google-Sheet **nicht öffentlich** freigegeben (nur das verknüpfte Google-Konto hat Zugriff)
- [ ] Apps Script Web-App läuft unter dem Google-Konto des Trägers (nicht einem privaten Konto)
- [ ] **HTTPS** auf allen Endpunkten (Render und script.google.com — beides automatisch)
- [ ] Admin-Passwort sicher und nur an berechtigte Personen weitergegeben
- [ ] **Löschkonzept** für Anwesenheitsdaten nach Aufbewahrungsfrist (mit Rechtsberatung klären)

---

## 14. Troubleshooting

### „Konfigurationsfehler: Webhook-URL nicht gesetzt"

→ `config.js` wurde nicht angepasst oder nicht committet/deployed.  
→ `DEPLOYMENT_ID_HIER_ERSETZEN` durch die echte Apps Script URL ersetzen.

### Apps Script antwortet mit HTML statt JSON

→ Die Web-App wurde als **alte Bereitstellung** angesprochen.  
→ URL muss auf `.../exec` enden, nicht `.../dev` (dev erfordert Login).  
→ Zugriff muss auf **„Jeder"** (nicht „Jeder mit Google-Konto") gesetzt sein.

### Checkin schlägt fehl: „Kurs nicht gefunden"

→ Kurs-ID im QR-Code stimmt nicht mit dem Sheet überein.  
→ Groß-/Kleinschreibung beachten — Vergleich ist case-sensitive.  
→ Spalte „Aktiv" im Sheet muss genau `ja` enthalten (kein Leerzeichen).

### Admin-Login funktioniert nicht

→ AUTH_HASH in Script-Properties mit dem Hash des eingegebenen Passworts vergleichen.  
→ Hash im Terminal nachrechnen (Schritt 4) und mit dem gespeicherten Property abgleichen.

### Tägliche Mail kommt nicht an

→ Trigger prüfen: Apps Script Editor → Trigger (Uhr) → `taeglicheCSVMail` eingetragen?  
→ `ADMIN_EMAIL` in Script-Properties korrekt gesetzt?  
→ Apps Script Ausführungsprotokoll prüfen: **Ausführungen** (Uhr-Symbol links) → letzte Ausführung → Fehler?  
→ Google-Konto hat max. 100 Mails/Tag (kostenlos). Bei höherem Volumen Gmail SMTP oder Workspace nötig.

### QR-Code öffnet 404

→ `render.yaml` enthält URL-Rewrite `/anwesenheit` → `/anwesenheit.html`.  
→ Prüfen ob `render.yaml` committet und Render neu deployed hat.

### CORS-Fehler im Browser

→ Apps Script gibt immer HTTP 200 zurück — echter CORS-Fehler bedeutet, dass die Anfrage gar nicht ankam.  
→ `Content-Type: text/plain` muss im fetch()-Aufruf gesetzt sein (nicht `application/json`).  
→ Apps Script Web-App muss als „Jeder" (anonymous) deployt sein.

---

## 15. Was dieser MVP bewusst NICHT macht

| Einschränkung | Empfehlung für später |
|---|---|
| **Kein Manipulationsschutz beim Scan** | Statischer QR-Code ist abfotografierbar. Ausbaustufe: täglich wechselnde Token im QR. |
| **Ein Admin-Passwort, kein User-Management** | Kein Audit-Log, keine Rollen. Für mehrstufige Rechte: echte Auth-Lösung nötig. |
| **Keine Live-Stepnova-Anbindung** | Stepnova hat keine offene API. Import bleibt manuell (CSV) oder halb-automatisiert (SFTP). |
| **Kein Mehrmandanten-Setup** | Ein Sheet, ein Script, ein Träger. |
| **Keine Versionierung gelöschter Kurse** | Anwesenheiten bleiben im Sheet, sind im Admin aber nicht mehr gefiltert sichtbar. Empfehlung: **Deaktivieren** statt Löschen. |
| **Duplikat-Schutz nur per localStorage** | Greift nicht bei Privatmodus, Gerätewechsel oder gelöschtem Cache. |
| **Name wird nicht verifiziert** | Jeder eingegebene Name wird akzeptiert. Keine Prüfung gegen eine Teilnehmerliste. |
| **Apps Script Tageslimits** | Kostenloser Plan: 6 Min. Ausführungszeit/Tag, 100 Mails/Tag. Für kleine Träger ausreichend. |
