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
        <p class="druck-anweisung">QR-Code scannen und Teilnehmer-ID eingeben</p>
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

// ── Heute-Dashboard-View ──────────────────────────────────────────────────────

function renderHeute(container, daten, onZurueck, onMail) {
  const eintraege = daten?.eintraege || [];
  const datum     = daten?.datum || '—';

  // Einträge nach Kurs gruppieren
  const nachKurs = {};
  for (const e of eintraege) {
    const kId = e['Kurs-ID'] || 'Unbekannt';
    if (!nachKurs[kId]) nachKurs[kId] = { name: e['Kurs-Name'] || kId, eintraege: [] };
    nachKurs[kId].eintraege.push(e);
  }

  const kursIds   = Object.keys(nachKurs);
  const gesamt    = eintraege.length;

  container.innerHTML = `
    <div class="seite-heute">
      <div class="seite-kopf">
        <div class="seite-kopf-links">
          <h1>Heute anwesend</h1>
          <span class="datum-badge">${esc(datum)}</span>
        </div>
        <div class="seite-kopf-aktionen">
          <button class="btn btn-ghost" id="btn-zurueck" type="button">← Zurück</button>
          <button class="btn btn-sekundaer" id="btn-aktualisieren" type="button">↻ Aktualisieren</button>
          <button class="btn btn-primär" id="btn-mail" type="button">CSV per E-Mail senden</button>
        </div>
      </div>

      <div class="heute-zusammenfassung">
        <span class="heute-zahl">${gesamt}</span>
        <span class="heute-label">Einträge gesamt heute</span>
      </div>

      ${gesamt === 0
        ? '<p class="leer-meldung">Noch keine Einträge für heute erfasst.</p>'
        : kursIds.map(kId => {
            const gruppe = nachKurs[kId];
            return `
              <section class="kurs-gruppe" aria-labelledby="kurs-titel-${esc(kId)}">
                <h2 id="kurs-titel-${esc(kId)}" class="kurs-gruppe-titel">
                  ${esc(gruppe.name)}
                  <span class="kurs-gruppe-zahl">${gruppe.eintraege.length}</span>
                </h2>
                <table class="heute-tabelle">
                  <thead>
                    <tr>
                      <th scope="col">TN-ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Uhrzeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${gruppe.eintraege.map(e => `
                      <tr>
                        <td><code>${esc(e['TN-ID'] || '—')}</code></td>
                        <td>${esc(e['Name'] || '—')}</td>
                        <td>${esc(e['Zeit'] || '—')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </section>
            `;
          }).join('')
      }
    </div>
  `;

  container.querySelector('#btn-zurueck').addEventListener('click', onZurueck);
  container.querySelector('#btn-aktualisieren').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('heute-aktualisieren', { bubbles: true }));
  });

  const btnMail = container.querySelector('#btn-mail');
  btnMail.addEventListener('click', async () => {
    btnMail.disabled = true;
    btnMail.textContent = 'Wird gesendet …';
    await onMail(
      () => {
        btnMail.textContent = '✓ Mail gesendet';
        setTimeout(() => { btnMail.disabled = false; btnMail.textContent = 'CSV per E-Mail senden'; }, 3000);
      },
      (fehler) => {
        btnMail.disabled = false;
        btnMail.textContent = 'CSV per E-Mail senden';
        alert('Fehler: ' + fehler);
      }
    );
  });
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
