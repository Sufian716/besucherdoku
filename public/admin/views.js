// views.js – Alle View-Renderfunktionen. Kein DOM-State, keine API-Calls.
// app.js ruft diese Funktionen auf und übergibt Daten und Callbacks.

'use strict';

// ── HTML-Escaping ─────────────────────────────────────────────────────────────
// Wird bei ALLEN Nutzereingaben/Serverdaten verwendet, die in innerHTML landen.
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Login-View ────────────────────────────────────────────────────────────────

function renderLogin(container, onLogin) {
  container.innerHTML = `
    <div class="seite-login">
      <div class="login-karte">
        <h1>Admin-Bereich</h1>
        <p class="login-untertitel">${esc(window.BRAND_NAME || 'Bildungsträger')}</p>
        <form id="login-form" novalidate>
          <div class="feld-gruppe">
            <label for="passwort">Passwort <span class="pflicht" aria-label="Pflichtfeld">*</span></label>
            <input
              type="password"
              id="passwort"
              name="passwort"
              autocomplete="current-password"
              required
              aria-required="true"
            >
          </div>
          <div class="meldung" id="login-fehler" role="alert" aria-live="assertive"></div>
          <button type="submit" id="login-btn">Anmelden</button>
        </form>
      </div>
    </div>
  `;

  const form   = container.querySelector('#login-form');
  const fehler = container.querySelector('#login-fehler');
  const btn    = container.querySelector('#login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    fehler.className = 'meldung';
    fehler.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Anmelden …';

    const passwort = container.querySelector('#passwort').value;
    if (!passwort) {
      fehler.className = 'meldung fehler';
      fehler.textContent = 'Bitte Passwort eingeben.';
      btn.disabled = false;
      btn.textContent = 'Anmelden';
      return;
    }

    await onLogin(passwort, (fehlermeldung) => {
      fehler.className = 'meldung fehler';
      fehler.textContent = fehlermeldung;
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    });
  });
}

// ── Kursliste-View ────────────────────────────────────────────────────────────

function renderKursliste(container, kurse, callbacks) {
  const { onNeu, onQr, onBearbeiten, onDeaktivieren, onHeute, onAbmelden } = callbacks;

  container.innerHTML = `
    <div class="seite-kursliste">
      <div class="seite-kopf">
        <div class="seite-kopf-links">
          <h1>Kursverwaltung</h1>
          <span class="marke-klein">${esc(window.BRAND_NAME || 'Bildungsträger')}</span>
        </div>
        <div class="seite-kopf-aktionen">
          <button class="btn btn-sekundaer" id="btn-heute" type="button">Heute anwesend</button>
          <button class="btn btn-primär" id="btn-neu" type="button">+ Neuen Kurs anlegen</button>
          <button class="btn btn-ghost" id="btn-abmelden" type="button">Abmelden</button>
        </div>
      </div>

      <div class="meldung" id="liste-meldung" role="status" aria-live="polite"></div>

      ${kurse.length === 0
        ? `<div class="leer-zustand">
             <p>Noch keine Kurse angelegt.</p>
             <button class="btn btn-primär" id="btn-neu-leer" type="button">Ersten Kurs anlegen</button>
           </div>`
        : `<div class="tabellen-wrapper">
             <table class="kurs-tabelle">
               <thead>
                 <tr>
                   <th scope="col">Name</th>
                   <th scope="col">Kurs-ID</th>
                   <th scope="col">Status</th>
                   <th scope="col">Erstellt am</th>
                   <th scope="col" class="aktionen-spalte">Aktionen</th>
                 </tr>
               </thead>
               <tbody id="kurs-tbody">
                 ${kurse.map(kurs => kursZeile(kurs)).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>
  `;

  container.querySelector('#btn-neu')?.addEventListener('click', onNeu);
  container.querySelector('#btn-neu-leer')?.addEventListener('click', onNeu);
  container.querySelector('#btn-heute').addEventListener('click', onHeute);
  container.querySelector('#btn-abmelden').addEventListener('click', onAbmelden);

  // Event-Delegation für Tabellenzeilen-Buttons
  const tbody = container.querySelector('#kurs-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-aktion]');
      if (!btn) return;
      const id   = btn.dataset.id;
      const name = btn.dataset.name;
      switch (btn.dataset.aktion) {
        case 'qr':          onQr(id, name);          break;
        case 'bearbeiten':  onBearbeiten(id, name, btn.dataset.notiz); break;
        case 'deaktivieren': onDeaktivieren(id, name); break;
      }
    });
  }
}

function kursZeile(kurs) {
  const id     = esc(kurs['Kurs-ID'] || '');
  const name   = esc(kurs['Name'] || '');
  const notiz  = esc(kurs['Notiz'] || '');
  const aktiv  = String(kurs['Aktiv'] || '').toLowerCase() === 'ja';
  const datum  = esc(kurs['Erstellt-am'] || '—');

  return `
    <tr class="${aktiv ? '' : 'zeile-inaktiv'}">
      <td>${name}</td>
      <td><code class="kurs-id-code">${id}</code></td>
      <td>
        <span class="status-pill ${aktiv ? 'status-aktiv' : 'status-inaktiv'}">
          ${aktiv ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>
      <td>${datum}</td>
      <td class="aktionen-zelle">
        <button class="btn btn-mini" data-aktion="qr" data-id="${id}" data-name="${name}" type="button">
          QR-Code
        </button>
        <button class="btn btn-mini btn-sekundaer" data-aktion="bearbeiten" data-id="${id}" data-name="${name}" data-notiz="${notiz}" type="button">
          Bearbeiten
        </button>
        ${aktiv ? `
        <button class="btn btn-mini btn-ghost" data-aktion="deaktivieren" data-id="${id}" data-name="${name}" type="button">
          Deaktivieren
        </button>` : ''}
      </td>
    </tr>
  `;
}

// ── Kurs-Formular-View ────────────────────────────────────────────────────────

function renderKursFormular(container, vorhandenerKurs, onSpeichern, onAbbrechen) {
  const istNeu = !vorhandenerKurs;
  const kurs   = vorhandenerKurs || {};

  container.innerHTML = `
    <div class="seite-formular">
      <div class="seite-kopf">
        <div class="seite-kopf-links">
          <h1>${istNeu ? 'Neuen Kurs anlegen' : 'Kurs bearbeiten'}</h1>
        </div>
        <div class="seite-kopf-aktionen">
          <button class="btn btn-ghost" id="btn-abbrechen" type="button">← Zurück</button>
        </div>
      </div>

      <div class="formular-karte">
        <form id="kurs-form" novalidate>
          <div class="feld-gruppe">
            <label for="kurs-name">Kursname <span class="pflicht" aria-label="Pflichtfeld">*</span></label>
            <input
              type="text"
              id="kurs-name"
              name="name"
              value="${esc(kurs.Name || '')}"
              maxlength="100"
              required
              aria-required="true"
              placeholder="z. B. Deutsch A1 – Montags"
            >
          </div>

          <div class="feld-gruppe">
            <label for="kurs-id">Kurs-ID <span class="pflicht" aria-label="Pflichtfeld">*</span></label>
            <input
              type="text"
              id="kurs-id"
              name="kursId"
              value="${esc(kurs['Kurs-ID'] || '')}"
              maxlength="50"
              pattern="[A-Za-z0-9\\-_]+"
              required
              aria-required="true"
              aria-describedby="kurs-id-hinweis"
              placeholder="wird automatisch vorgeschlagen"
              ${!istNeu ? 'readonly aria-readonly="true"' : ''}
            >
            <p class="hinweis" id="kurs-id-hinweis">
              ${istNeu
                ? 'Wird aus dem Kursnamen abgeleitet. Erlaubt: Buchstaben, Zahlen, Bindestrich, Unterstrich. Nach dem Speichern nicht mehr änderbar.'
                : 'Die Kurs-ID kann nach dem Anlegen nicht mehr geändert werden.'}
            </p>
          </div>

          <div class="feld-gruppe">
            <label for="kurs-notiz">Notiz <span class="feld-optional">(optional)</span></label>
            <input
              type="text"
              id="kurs-notiz"
              name="notiz"
              value="${esc(kurs.Notiz || '')}"
              maxlength="200"
              placeholder="Interne Bemerkung, z. B. Raum 201"
            >
          </div>

          <div class="meldung" id="formular-meldung" role="alert" aria-live="assertive"></div>

          <div class="formular-aktionen">
            <button type="submit" id="speichern-btn" class="btn btn-primär">
              ${istNeu ? 'Kurs anlegen' : 'Änderungen speichern'}
            </button>
            <button type="button" id="formular-abbrechen" class="btn btn-ghost">Abbrechen</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const nameInput  = container.querySelector('#kurs-name');
  const idInput    = container.querySelector('#kurs-id');
  const meldung    = container.querySelector('#formular-meldung');
  const btn        = container.querySelector('#speichern-btn');

  // Kurs-ID automatisch aus Name ableiten (nur bei neuem Kurs und leerer ID)
  if (istNeu) {
    nameInput.addEventListener('input', () => {
      if (!idInput.dataset.manuell) {
        idInput.value = kursIdAusName(nameInput.value);
      }
    });
    idInput.addEventListener('input', () => {
      idInput.dataset.manuell = idInput.value ? '1' : '';
    });
  }

  container.querySelector('#btn-abbrechen').addEventListener('click', onAbbrechen);
  container.querySelector('#formular-abbrechen').addEventListener('click', onAbbrechen);

  container.querySelector('#kurs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    meldung.className = 'meldung';
    meldung.textContent = '';

    const name   = nameInput.value.trim();
    const kursId = idInput.value.trim();
    const notiz  = container.querySelector('#kurs-notiz').value.trim();

    if (!name) {
      meldung.className = 'meldung fehler';
      meldung.textContent = 'Kursname ist ein Pflichtfeld.';
      nameInput.focus();
      return;
    }

    if (!kursId || !/^[A-Za-z0-9\-_]{1,50}$/.test(kursId)) {
      meldung.className = 'meldung fehler';
      meldung.textContent = 'Kurs-ID ist ungültig (erlaubt: Buchstaben, Zahlen, Bindestrich, Unterstrich).';
      idInput.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Wird gespeichert …';

    await onSpeichern({ name, kursId, notiz, istNeu }, (fehlermeldung) => {
      meldung.className = 'meldung fehler';
      meldung.textContent = fehlermeldung;
      btn.disabled = false;
      btn.textContent = istNeu ? 'Kurs anlegen' : 'Änderungen speichern';
    });
  });

  // Fokus auf erstes Eingabefeld
  nameInput.focus();
}

function kursIdAusName(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 30);
}

// ── QR-Code-View ──────────────────────────────────────────────────────────────

function renderQrCode(container, kursId, kursName, onZurueck) {
  const basisUrl = window.location.origin;
  const qrUrl    = `${basisUrl}/anwesenheit?kurs=${encodeURIComponent(kursId)}&name=${encodeURIComponent(kursName)}`;

  container.innerHTML = `
    <div class="seite-qr">
      <div class="seite-kopf">
        <div class="seite-kopf-links">
          <h1>QR-Code</h1>
          <span class="kurs-id-code">${esc(kursId)}</span>
        </div>
        <div class="seite-kopf-aktionen">
          <button class="btn btn-ghost" id="btn-zurueck" type="button">← Zurück</button>
        </div>
      </div>

      <div class="qr-karte">
        <p class="qr-kursname">${esc(kursName)}</p>
        <div id="qr-container" class="qr-container" role="img" aria-label="QR-Code für ${esc(kursName)}"></div>
        <p class="qr-url-anzeige">${esc(qrUrl)}</p>
        <div class="qr-aktionen">
          <button class="btn btn-primär" id="btn-png" type="button">Als PNG herunterladen</button>
          <button class="btn btn-sekundaer" id="btn-drucken" type="button">Drucken (A4)</button>
        </div>
      </div>
    </div>

    <!-- Druckansicht: nur im Druckmodus sichtbar, QR-Code zentriert auf A4 -->
    <div class="druck-seite" id="druck-seite" aria-hidden="true">
      <div class="druck-inhalt">
        <p class="druck-marke">${esc(window.BRAND_NAME || 'Bildungsträger')}</p>
        <h2 class="druck-kursname">${esc(kursName)}</h2>
        <div id="qr-druck" class="qr-druck-container"></div>
        <p class="druck-kurs-id">ID: ${esc(kursId)}</p>
        <p class="druck-anweisung">QR-Code scannen und Namen eingeben</p>
      </div>
    </div>
  `;

  container.querySelector('#btn-zurueck').addEventListener('click', onZurueck);

  // QR-Code generieren (qrcode.js von CDN wird in index.html geladen)
  if (typeof QRCode !== 'undefined') {
    new QRCode(document.getElementById('qr-container'), {
      text: qrUrl,
      width: 256,
      height: 256,
      colorDark: '#1C1917',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    // Größerer QR für Druckansicht
    new QRCode(document.getElementById('qr-druck'), {
      text: qrUrl,
      width: 400,
      height: 400,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    document.getElementById('qr-container').innerHTML =
      '<p class="fehler-text">QR-Bibliothek nicht geladen. Seite neu laden.</p>';
  }

  // PNG herunterladen
  container.querySelector('#btn-png').addEventListener('click', () => {
    const canvas = container.querySelector('#qr-container canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-${kursId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Drucken
  container.querySelector('#btn-drucken').addEventListener('click', () => {
    window.print();
  });
}

// ── Datum-Hilfsfunktionen ─────────────────────────────────────────────────────

function isoZuDe(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function deZuIso(de) {
  if (!de) return '';
  const [d, m, y] = de.split('.');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function tagHeute() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0') + '.' +
         String(d.getMonth()+1).padStart(2,'0') + '.' +
         d.getFullYear();
}

// Aktueller Monat als YYYY-MM (Default für den Monats-Export)
function monatHeute() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

// "2026-07" -> "Juli 2026"
function isoZuMonatDe(iso) {
  const namen = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const [y, m] = String(iso || '').split('-');
  const idx = parseInt(m, 10) - 1;
  return (namen[idx] || iso) + (y ? ' ' + y : '');
}

// ── Anwesenheits-Dashboard ────────────────────────────────────────────────────

function renderHeute(container, daten, kurse, onZurueck, onFilter, onMail, onExportMonat, onMonatStatistik) {
  const eintraege = daten?.eintraege || [];
  const datum     = daten?.datum     || tagHeute();
  const kursId    = daten?.kursId    || '';
  const gesamt    = eintraege.length;
  const aktMonat  = monatHeute();  // YYYY-MM als Default für den Monats-Export

  const aktiveKurse = (kurse || []).filter(k => String(k['Aktiv']).toLowerCase() === 'ja');

  // Einträge nach Kurs gruppieren
  const nachKurs = {};
  for (const e of eintraege) {
    const kId = e['Kurs-ID'] || 'Unbekannt';
    if (!nachKurs[kId]) nachKurs[kId] = { name: e['Kurs-Name'] || kId, eintraege: [] };
    nachKurs[kId].eintraege.push(e);
  }
  const kursIds = Object.keys(nachKurs);

  container.innerHTML = `
    <div class="seite-heute">
      <div class="seite-kopf">
        <div class="seite-kopf-links">
          <h1>Anwesenheit</h1>
        </div>
        <div class="seite-kopf-aktionen">
          <button class="btn btn-ghost" id="btn-zurueck" type="button">← Zurück</button>
        </div>
      </div>

      <!-- Filter-Leiste -->
      <div class="filter-leiste">
        <form id="filter-form" class="filter-form">
          <div class="filter-feld">
            <label for="filter-datum">Datum</label>
            <input type="date" id="filter-datum" value="${esc(deZuIso(datum))}">
          </div>
          <div class="filter-feld">
            <label for="filter-kurs">Kurs</label>
            <select id="filter-kurs">
              <option value="">Alle Kurse</option>
              ${aktiveKurse.map(k => `
                <option value="${esc(k['Kurs-ID'])}" ${k['Kurs-ID'] === kursId ? 'selected' : ''}>
                  ${esc(k['Name'])}
                </option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-sekundaer filter-btn">Anwenden</button>
          <button type="button" class="btn btn-mini btn-ghost" id="btn-aktualisieren" title="Aktualisieren">↻</button>
        </form>
      </div>

      <!-- Mail-Export -->
      <div class="mail-export-leiste">
        <button class="btn btn-primär" id="btn-mail-toggle" type="button">CSV per E-Mail senden</button>
        <div id="mail-dialog" class="mail-dialog" hidden>
          <form id="mail-form">
            <div class="mail-felder">
              <div class="filter-feld">
                <label for="mail-empf">E-Mail-Adresse <span class="pflicht">*</span></label>
                <input type="email" id="mail-empf" required placeholder="empfaenger@beispiel.de">
              </div>
              <div class="filter-feld">
                <label for="mail-kurs">Kurs exportieren</label>
                <select id="mail-kurs">
                  <option value="">Alle Kurse (aktueller Filter)</option>
                  ${aktiveKurse.map(k => `
                    <option value="${esc(k['Kurs-ID'])}" ${k['Kurs-ID'] === kursId ? 'selected' : ''}>
                      ${esc(k['Name'])}
                    </option>`).join('')}
                </select>
              </div>
              <label class="checkbox-label">
                <input type="checkbox" id="mail-loeschen">
                <span>Einträge nach dem Senden löschen</span>
              </label>
            </div>
            <div class="mail-aktionen">
              <button type="submit" class="btn btn-primär" id="mail-senden-btn">Senden</button>
              <button type="button" class="btn btn-ghost" id="mail-abbrechen">Abbrechen</button>
            </div>
            <div class="meldung" id="mail-meldung" role="alert" aria-live="assertive"></div>
          </form>
        </div>
      </div>

      <!-- Monats-Export -->
      <div class="mail-export-leiste">
        <button class="btn btn-sekundaer" id="btn-monat-toggle" type="button">📅 Monats-Export</button>
        <div id="monat-dialog" class="mail-dialog" hidden>
          <form id="monat-form">
            <div class="mail-felder">
              <div class="filter-feld">
                <label for="export-monat">Monat <span class="pflicht">*</span></label>
                <input type="month" id="export-monat" value="${esc(aktMonat)}" required>
              </div>
              <div class="filter-feld">
                <label for="export-kurs">Kurs</label>
                <select id="export-kurs">
                  <option value="">Alle Kurse</option>
                  ${aktiveKurse.map(k => `
                    <option value="${esc(k['Kurs-ID'])}" ${k['Kurs-ID'] === kursId ? 'selected' : ''}>
                      ${esc(k['Name'])}
                    </option>`).join('')}
                </select>
              </div>
              <div class="filter-feld">
                <label for="export-empf">Zusätzlich per E-Mail (optional)</label>
                <input type="email" id="export-empf" placeholder="empfaenger@beispiel.de">
              </div>
            </div>
            <div class="monat-statistik" id="monat-statistik" aria-live="polite">Wird geladen …</div>
            <div class="mail-aktionen">
              <button type="submit" class="btn btn-primär" id="monat-download-btn">CSV herunterladen</button>
              <button type="button" class="btn btn-sekundaer" id="monat-mail-btn">Per E-Mail senden</button>
              <button type="button" class="btn btn-ghost" id="monat-abbrechen">Abbrechen</button>
            </div>
            <div class="meldung" id="monat-meldung" role="alert" aria-live="assertive"></div>
          </form>
        </div>
      </div>

      <!-- Zusammenfassung -->
      <div class="heute-zusammenfassung">
        <span class="heute-zahl">${gesamt}</span>
        <span class="heute-label">Einträge${datum ? ' am ' + esc(datum) : ''}</span>
      </div>

      <!-- Tabelle -->
      ${gesamt === 0
        ? '<p class="leer-meldung">Keine Einträge für diesen Filter gefunden.</p>'
        : kursIds.map(kId => {
            const gruppe = nachKurs[kId];
            return `
              <section class="kurs-gruppe">
                <h2 class="kurs-gruppe-titel">
                  ${esc(gruppe.name)}
                  <span class="kurs-gruppe-zahl">${gruppe.eintraege.length}</span>
                </h2>
                <table class="heute-tabelle">
                  <thead>
                    <tr>
                      <th scope="col">Vorname</th>
                      <th scope="col">Nachname</th>
                      <th scope="col">Datum</th>
                      <th scope="col">Uhrzeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${gruppe.eintraege.map(e => `
                      <tr>
                        <td>${esc(e['Vorname'] || e['Name'] || '—')}</td>
                        <td>${esc(e['Nachname'] || '—')}</td>
                        <td>${esc(e['Datum'] || '—')}</td>
                        <td>${esc(e['Zeit'] || '—')}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </section>`;
          }).join('')}
    </div>
  `;

  container.querySelector('#btn-zurueck').addEventListener('click', onZurueck);

  function filterAnwenden() {
    const d = container.querySelector('#filter-datum').value;
    const k = container.querySelector('#filter-kurs').value;
    onFilter(d ? isoZuDe(d) : '', k);
  }
  container.querySelector('#filter-form').addEventListener('submit', e => { e.preventDefault(); filterAnwenden(); });
  container.querySelector('#btn-aktualisieren').addEventListener('click', filterAnwenden);

  // Mail-Dialog
  const mailDialog = container.querySelector('#mail-dialog');
  container.querySelector('#btn-mail-toggle').addEventListener('click', () => {
    mailDialog.hidden = !mailDialog.hidden;
    if (!mailDialog.hidden) {
      const last = localStorage.getItem('admin_mail_empf') || '';
      container.querySelector('#mail-empf').value = last;
      container.querySelector('#mail-empf').focus();
    }
  });
  container.querySelector('#mail-abbrechen').addEventListener('click', () => { mailDialog.hidden = true; });

  container.querySelector('#mail-form').addEventListener('submit', async e => {
    e.preventDefault();
    const empf     = container.querySelector('#mail-empf').value.trim();
    const mailKurs = container.querySelector('#mail-kurs').value;
    const loeschen = container.querySelector('#mail-loeschen').checked;
    const btn      = container.querySelector('#mail-senden-btn');
    const meldung  = container.querySelector('#mail-meldung');

    meldung.className = 'meldung';
    meldung.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Wird gesendet …';

    localStorage.setItem('admin_mail_empf', empf);

    const res = await onMail(empf, mailKurs || kursId, datum, loeschen);

    if (!btn.isConnected) return;
    btn.disabled = false;
    btn.textContent = 'Senden';

    if (res.ok) {
      meldung.className = 'meldung erfolg';
      meldung.textContent = `Mail an ${empf} gesendet (${res.daten?.anzahl ?? '?'} Einträge).`;
      if (loeschen) setTimeout(() => onFilter(datum, kursId), 1800);
    } else {
      meldung.className = 'meldung fehler';
      meldung.textContent = res.fehler || 'Fehler beim Senden.';
    }
  });

  // Monats-Export-Dialog
  const monatDialog = container.querySelector('#monat-dialog');
  const statistikEl = container.querySelector('#monat-statistik');

  async function statistikLaden() {
    const monat = container.querySelector('#export-monat').value;
    const eKurs = container.querySelector('#export-kurs').value;
    if (!monat) { statistikEl.textContent = ''; return; }
    statistikEl.textContent = 'Wird geladen …';
    const res = await onMonatStatistik(monat, eKurs);
    if (!statistikEl.isConnected) return;
    if (!res.ok) { statistikEl.textContent = res.fehler || 'Statistik nicht verfügbar.'; return; }
    const gesamt = res.daten?.gesamt ?? 0;
    const proKurs = res.daten?.proKurs || [];
    const monatText = isoZuMonatDe(monat);
    let html = `<strong>${gesamt}</strong> Einträge im ${esc(monatText)}`;
    if (!eKurs && proKurs.length > 0) {
      html += '<ul class="statistik-liste">' +
        proKurs.map(k => `<li>${esc(k.kursName)}: <strong>${k.anzahl}</strong></li>`).join('') +
        '</ul>';
    }
    statistikEl.innerHTML = html;
  }

  container.querySelector('#btn-monat-toggle').addEventListener('click', () => {
    monatDialog.hidden = !monatDialog.hidden;
    if (!monatDialog.hidden) { container.querySelector('#export-monat').focus(); statistikLaden(); }
  });
  container.querySelector('#monat-abbrechen').addEventListener('click', () => { monatDialog.hidden = true; });
  container.querySelector('#export-monat').addEventListener('change', statistikLaden);
  container.querySelector('#export-kurs').addEventListener('change', statistikLaden);

  async function monatExport(perMail) {
    const monat   = container.querySelector('#export-monat').value;
    const eKurs   = container.querySelector('#export-kurs').value;
    const empf    = container.querySelector('#export-empf').value.trim();
    const dlBtn   = container.querySelector('#monat-download-btn');
    const maiBtn  = container.querySelector('#monat-mail-btn');
    const meldung = container.querySelector('#monat-meldung');

    meldung.className = 'meldung';
    meldung.textContent = '';
    if (!monat) {
      meldung.className = 'meldung fehler';
      meldung.textContent = 'Bitte einen Monat auswählen.';
      return;
    }
    if (perMail && !empf) {
      meldung.className = 'meldung fehler';
      meldung.textContent = 'Für den Mail-Versand bitte eine E-Mail-Adresse eingeben.';
      return;
    }

    dlBtn.disabled = true; maiBtn.disabled = true;
    const aktiverBtn = perMail ? maiBtn : dlBtn;
    const altText = aktiverBtn.textContent;
    aktiverBtn.textContent = perMail ? 'Wird gesendet …' : 'Wird erstellt …';

    const res = await onExportMonat(monat, eKurs, perMail ? empf : '');

    if (aktiverBtn.isConnected) {
      dlBtn.disabled = false; maiBtn.disabled = false;
      aktiverBtn.textContent = altText;
    }

    if (!res.ok) {
      meldung.className = 'meldung fehler';
      meldung.textContent = res.fehler || 'Export fehlgeschlagen.';
      return;
    }

    const anzahl = res.daten?.anzahl ?? 0;
    if (!perMail) {
      // CSV-Download im Browser auslösen
      const blob = new Blob([res.daten.csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = res.daten.dateiname || ('anwesenheit_' + monat + '.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    meldung.className = 'meldung erfolg';
    meldung.textContent = perMail
      ? `Monats-Export an ${empf} gesendet (${anzahl} Einträge).`
      : `Download gestartet: ${anzahl} Einträge für ${monat}.`;
  }

  container.querySelector('#monat-form').addEventListener('submit', e => { e.preventDefault(); monatExport(false); });
  container.querySelector('#monat-mail-btn').addEventListener('click', () => monatExport(true));
}

// ── Lade-Indikator ────────────────────────────────────────────────────────────

function renderLaden(container, text = 'Wird geladen …') {
  container.innerHTML = `
    <div class="laden-zustand" role="status" aria-live="polite">
      <div class="laden-spinner" aria-hidden="true"></div>
      <p>${esc(text)}</p>
    </div>
  `;
}

// ── Globale Fehlermeldung ─────────────────────────────────────────────────────

function renderFehler(container, meldung, onZurueck) {
  container.innerHTML = `
    <div class="seite-fehler">
      <h1>Fehler</h1>
      <p class="fehler-text">${esc(meldung)}</p>
      ${onZurueck ? '<button class="btn btn-primär" id="btn-zurueck" type="button">← Zurück</button>' : ''}
    </div>
  `;
  container.querySelector('#btn-zurueck')?.addEventListener('click', onZurueck);
}
