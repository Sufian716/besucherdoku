// Zentrale Konfiguration – VOR dem Deployment anpassen.
// Diese Datei ist öffentlich zugänglich; keine Passwörter oder Secrets hier speichern.

// Apps Script Web-App-URL (nach Deployment unter "Als Web-App bereitstellen" kopieren)
// Format: https://script.google.com/macros/s/DEINE_DEPLOYMENT_ID/exec
window.WEBHOOK_URL = 'https://script.google.com/macros/s/DEPLOYMENT_ID_HIER_ERSETZEN/exec';

// Shared-Key für den Checkin-Endpunkt – muss mit der Script-Property CHECKIN_KEY übereinstimmen.
// Diese Datei ist öffentlich. Der Key ist kein Sicherheitsmerkmal,
// sondern eine einfache Hürde gegen versehentliche Anfragen.
window.CHECKIN_KEY = 'mvp-checkin-2025';

// Angezeigter Name in der Oberfläche
window.BRAND_NAME = 'Bildungsträger';
