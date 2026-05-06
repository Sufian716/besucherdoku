# Anwesenheits-MVP

Digitale Anwesenheitserfassung per QR-Code für Bildungsträger.  
Technologie: statisches HTML/JS-Frontend · n8n-Workflows · Google Sheets · Render.com

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Google Sheet anlegen](#2-google-sheet-anlegen)
3. [n8n aufsetzen](#3-n8n-aufsetzen)
4. [Workflows importieren und konfigurieren](#4-workflows-importieren-und-konfigurieren)
5. [Auth-Hash setzen](#5-auth-hash-setzen)
6. [config.js anpassen](#6-configjs-anpassen)
7. [Auf Render deployen](#7-auf-render-deployen)
8. [Ersten Kurs anlegen und QR-Code drucken](#8-ersten-kurs-anlegen-und-qr-code-drucken)
9. [End-to-End-Test](#9-end-to-end-test)
10. [Stepnova-Import](#10-stepnova-import)
11. [Datenschutz-Checkliste](#11-datenschutz-checkliste)
12. [Troubleshooting](#12-troubleshooting)
13. [Was dieser MVP bewusst NICHT macht](#13-was-dieser-mvp-bewusst-nicht-macht)

---

## 1. Voraussetzungen

| Dienst | Kosten | Hinweis |
|---|---|---|
| Google-Konto mit Google Sheets | kostenlos | Ggf. ein dediziertes Dienst-Konto für die Organisation |
| n8n (Cloud oder Self-hosted) | ab 0 €/Monat (Cloud-Free mit Limits) | Self-hosted auf einem VPS empfohlen für Produktionsbetrieb |
| Render.com | kostenloser Static-Site-Plan | Ausreichend für dieses Frontend |
| GitHub-Konto | kostenlos | Für Render-Deployment |
| SMTP-Zugang | kostenlos via Gmail, oder Mailgun etc. | Für die tägliche CSV-Mail |

---

## 2. Google Sheet anlegen

1. Neues Google Sheets Dokument erstellen: **„Anwesenheit MVP"**
2. **Tabellenblatt 1** umbenennen in: `Kurse`  
   Spaltenköpfe in Zeile 1 exakt so eingeben:
   ```
   Kurs-ID | Name | Aktiv | Erstellt-am | Notiz
   ```
3. **Tabellenblatt 2** anlegen, umbenennen in: `Anwesenheit`  
   Spaltenköpfe in Zeile 1 exakt so eingeben:
   ```
   TN-ID | Name | Kurs-ID | Kurs-Name | Datum | Zeit | Timestamp
   ```
4. Die **Spreadsheet-ID** aus der URL kopieren:  
   `https://docs.google.com/spreadsheets/d/`**`DIESE_ID_HIER`**`/edit`

> **Wichtig:** Die Spaltennamen müssen exakt übereinstimmen – einschließlich Groß-/Kleinschreibung und Bindestrichen. Die n8n-Workflows referenzieren diese Namen direkt.

---

## 3. n8n aufsetzen

### Option A: n8n Cloud (einfacher Einstieg)

1. Account anlegen unter [n8n.io](https://n8n.io)
2. Kostenloser Plan: 5 aktive Workflows, 2.500 Executions/Monat  
   Für einen kleinen Träger meist ausreichend.

### Option B: Self-hosted (empfohlen für Produktion)

```bash
# Mit Docker Compose (einfachste Methode)
mkdir n8n-data && cd n8n-data

cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=sicheres-passwort-hier
      - N8N_HOST=n8n.ihre-domain.de
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.ihre-domain.de/
      - GENERIC_TIMEZONE=Europe/Berlin
    volumes:
      - ./data:/home/node/.n8n
EOF

docker-compose up -d
```

Danach per Nginx/Caddy mit HTTPS absichern. Webhooks funktionieren nur über HTTPS zuverlässig.

### Google Sheets Credential in n8n anlegen

1. In n8n: **Credentials** → **Add Credential** → **Google Sheets OAuth2 API**
2. OAuth-App in der Google Cloud Console anlegen:
   - APIs & Services → Credentials → OAuth 2.0 Client ID
   - Application Type: Web Application
   - Redirect URI: `https://ihre-n8n-domain/rest/oauth2-credential/callback`
3. Client-ID und Client-Secret in n8n eintragen, OAuth-Flow abschließen
4. Den Credential-Namen merken: z.B. **„Google Sheets"**

---

## 4. Workflows importieren und konfigurieren

1. In n8n: **Workflows** → **Import from File**
2. Nacheinander importieren:
   - `n8n/workflow-checkin.json`
   - `n8n/workflow-courses.json`
   - `n8n/workflow-daily-csv.json`

### Nach dem Import: Credentials zuweisen

In jedem Workflow alle Nodes mit Google Sheets öffnen und die Google-Sheets-Credential auswählen (die in Schritt 3 angelegte).

### n8n-Umgebungsvariablen setzen

In n8n: **Settings** → **Variables** (oder per `docker-compose.yml` als ENV):

| Variable | Beispielwert | Beschreibung |
|---|---|---|
| `SPREADSHEET_ID` | `1BxiMVs0...` | ID aus der Google-Sheets-URL |
| `AUTH_HASH` | `a3f5b2c1...` | SHA-256-Hash des Admin-Passworts (→ Schritt 5) |
| `CHECKIN_KEY` | `mvp-checkin-2025` | Shared-Secret für Checkin-Endpunkt (beliebige Zeichenkette) |
| `ADMIN_EMAIL` | `verwaltung@traeger.de` | Empfänger der täglichen CSV-Mail |
| `FROM_EMAIL` | `noreply@traeger.de` | Absender der Mail |

### SMTP-Credential anlegen

In n8n: **Credentials** → **Add Credential** → **SMTP**  
Dann im Workflow `workflow-daily-csv` den Mail-Node öffnen und diese Credential auswählen.

### Webhook-URLs notieren

Nach dem Import der Workflows diese unter **Workflow** → **Webhook-Node** → „Test URL" / „Production URL" kopieren:

- Checkin-Workflow: `https://n8n.ihre-domain.de/webhook/anwesenheit-checkin`
- Kurs-CRUD-Workflow: `https://n8n.ihre-domain.de/webhook/kurse`

Diese kommen in die `config.js` (→ Schritt 6).

### Workflows aktivieren

Alle drei Workflows auf **Active** schalten.

---

## 5. Auth-Hash setzen

Das Admin-Passwort wird **niemals im Klartext** gespeichert. n8n speichert nur den SHA-256-Hash.

**Hash erzeugen** (in der Browser-Konsole oder Terminal):

```bash
# Terminal (Linux/Mac)
echo -n "IhrSicheresPasswort" | sha256sum

# Node.js
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('IhrSicheresPasswort').digest('hex'))"
```

Den ausgegebenen Hex-String (64 Zeichen) als `AUTH_HASH` in n8n hinterlegen.

---

## 6. config.js anpassen

Datei `public/config.js` bearbeiten:

```js
// Webhook-URLs aus n8n (Production-URLs nach Workflow-Aktivierung)
window.WEBHOOK_CHECKIN_URL = 'https://n8n.ihre-domain.de/webhook/anwesenheit-checkin';
window.WEBHOOK_COURSES_URL = 'https://n8n.ihre-domain.de/webhook/kurse';

// Muss mit der n8n-Variable CHECKIN_KEY übereinstimmen
window.CHECKIN_KEY = 'mvp-checkin-2025';

// Angezeigter Name des Trägers in der Oberfläche
window.BRAND_NAME = 'Bildungsträger gGmbH';
```

---

## 7. Auf Render deployen

1. Dieses Repository auf GitHub pushen (oder forken)
2. [render.com](https://render.com) → **New** → **Static Site**
3. GitHub-Repo verbinden
4. Render erkennt `render.yaml` automatisch → **Deploy**

Die Website ist nach ~1 Minute unter der Render-URL erreichbar.

**Eigene Domain** (optional): In Render unter **Custom Domains** eintragen und DNS-Record beim Registrar setzen.

---

## 8. Ersten Kurs anlegen und QR-Code drucken

1. `/admin` aufrufen, Admin-Passwort eingeben
2. **„Neuen Kurs anlegen"** klicken
3. Name eingeben, z.B. „Deutsch A1 Montags" – die Kurs-ID wird automatisch vorgeschlagen
4. Speichern
5. In der Kursliste auf **„QR-Code"** klicken
6. **„Drucken (A4)"** → Browser-Druckdialog → als PDF speichern oder direkt drucken
7. Ausdruck im Kursraum aufhängen

---

## 9. End-to-End-Test

1. QR-Code mit dem Smartphone scannen
2. Testdaten eingeben: TN-ID `TEST001`, Name `Test Teilnehmer`
3. Absenden → Erfolgsmeldung prüfen
4. Im Admin-Bereich → **„Heute anwesend"**: Eintrag sollte erscheinen
5. Im Google Sheet Tabellenblatt „Anwesenheit": Zeile prüfen
6. Tägliche Mail: Im Workflow `workflow-daily-csv` → **Execute** manuell auslösen → Mail prüfen

---

## 10. Stepnova-Import

### CSV-Format

Die tägliche Mail enthält eine CSV-Datei mit folgendem Format (Semikolon-getrennt, UTF-8 mit BOM, CRLF-Zeilenenden):

```
TN-ID;Name;Kurs-ID;Kurs-Name;Datum;Zeit;Timestamp
12345;Max Mustermann;DEUTSCH-A1;Deutsch A1;06.05.2025;09:15;2025-05-06T09:15:00
```

### Import in Stepnova

1. CSV-Datei aus der Mail herunterladen
2. Stepnova → Modul Anwesenheiten → CSV-Import
3. Spaltenzuordnung beim ersten Import einmalig konfigurieren und als Profil speichern
4. Datei importieren, Vorschau prüfen, bestätigen

> **Hinweis:** Stepnova-CSV-Importprofile sind einmalig anzulegen. Danach ist der Import täglich in ~2 Minuten erledigt.

### SFTP-Automatisierung (spätere Ausbaustufe)

Falls Stepnova mit SFTP-Modul lizenziert ist:
- n8n SFTP-Node statt Mail-Anhang nutzen
- CSV täglich in das Stepnova-Import-Verzeichnis legen
- Stepnova-SFTP-Job konfigurieren (Dokumentation beim Anbieter erfragen)

---

## 11. Datenschutz-Checkliste

- [ ] **Auftragsverarbeitungsvertrag (AVV)** mit Google (Google Workspace / Google Cloud) abgeschlossen
- [ ] **AVV** mit dem n8n-Hoster abgeschlossen (bei n8n Cloud: im Account-Bereich verfügbar)
- [ ] **AVV** mit Render.com abgeschlossen (DPA unter render.com/privacy)
- [ ] **Datenschutzinformation** für Teilnehmende liegt vor (was wird erfasst, wie lange gespeichert, Rechtsgrundlage)
- [ ] **Speicherort** der Google-Sheet-Daten auf EU-Server geprüft (Google Workspace Business: EU-Datenlokalisierung buchbar)
- [ ] **Löschkonzept**: Anwesenheitsdaten nach gesetzlicher Aufbewahrungsfrist aus dem Sheet löschen (in DE: i.d.R. nach Abschluss der Maßnahme + 10 Jahre für steuerrelevante Belege – mit Rechtsberatung klären)
- [ ] **HTTPS** auf allen Endpunkten aktiv (Render und n8n)
- [ ] Admin-Passwort sicher und nur an berechtigte Personen weitergegeben
- [ ] Google-Sheet-Dokument **nicht öffentlich** freigegeben (nur das Dienst-Konto hat Zugriff)

---

## 12. Troubleshooting

### QR-Code öffnet falsche Seite / 404

→ Prüfen, ob Render-Rewrites korrekt greifen: `/anwesenheit` → `/anwesenheit.html`  
→ `render.yaml` muss committet und neu deployed sein.

### n8n-Webhook antwortet mit 404

→ Workflow ist noch nicht aktiviert (der Toggle muss auf **Active** stehen)  
→ Production-URL (nicht Test-URL) in `config.js` eingetragen?

### Google Sheets: „The caller does not have permission"

→ OAuth-Credential in n8n ist abgelaufen → neu autorisieren  
→ Spreadsheet-ID falsch in `SPREADSHEET_ID`-Variable

### Tägliche Mail kommt nicht an

→ SMTP-Credential prüfen: Port 587 (STARTTLS) oder 465 (SSL) je nach Anbieter  
→ Bei Gmail: „App-Passwort" verwenden (kein normales Passwort)  
→ Im n8n-Execution-Log des Cron-Workflows nach Fehlern schauen

### Admin-Login funktioniert nicht

→ AUTH_HASH in n8n mit dem Hash des eingegebenen Passworts vergleichen  
→ Hash im Terminal nachrechnen (Schritt 5) und mit `SPREADSHEET_ID`-Variable abgleichen

### Doppelter Eintrag trotz Duplikat-Schutz

→ Der Duplikat-Schutz läuft über `localStorage` im Browser des TN  
→ Bei gelöschtem Browser-Verlauf / Privatmodus / anderen Geräten greift er nicht  
→ Bekannte MVP-Einschränkung (→ Abschnitt 13)

---

## 13. Was dieser MVP bewusst NICHT macht

Diese Einschränkungen sind bewusste Design-Entscheidungen für einen schnellen, wartungsarmen Einstieg. Sie sind keine Fehler.

| Einschränkung | Begründung / Empfehlung für später |
|---|---|
| **Kein Manipulationsschutz beim Scan** | Der QR-Code ist statisch und abfotografierbar. Jede Person mit dem Bild kann sich eintragen. Für spätere Ausbaustufe: zeitlich begrenzte Token (n8n generiert täglich neuen QR). |
| **Ein Admin-Passwort, kein User-Management** | Reicht für kleine Teams. Kein Audit-Log, keine Rollen. Für mehrstufige Rechte: echte Auth-Lösung (Clerk, Supabase Auth o.ä.) erforderlich. |
| **Keine Live-Stepnova-Anbindung** | Stepnova bietet keine offene Live-API. Import bleibt manuell (CSV) oder halb-automatisiert (SFTP). |
| **Kein Mehrmandanten-Setup** | Ein Sheet, ein n8n-Workspace, ein Träger. Für mehrere Standorte/Träger: pro Mandant eigene Instanz oder komplexere Datenmodellierung. |
| **Keine Versionierung gelöschter Kurse** | Anwesenheiten zu deaktivierten Kursen bleiben im Sheet, sind im Admin aber nicht mehr gefiltert sichtbar. Empfehlung: Kurse **deaktivieren** statt löschen. |
| **Duplikat-Schutz nur per localStorage** | Funktioniert nicht bei Privatmodus, Gerätewechsel oder gelöschtem Cache. |
| **Kein Offline-Fallback** | Ohne Internetverbindung funktioniert die Erfassung nicht. Backup-Plan: Papier bereithalten. |
| **TN-ID wird nicht verifiziert** | Es gibt keine Prüfung, ob die eingegebene TN-ID existiert. Jede Zeichenkette wird akzeptiert. |
