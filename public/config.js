// Zentrale Konfiguration – VOR dem Deployment anpassen.
// Diese Datei ist öffentlich zugänglich; keine Passwörter oder Secrets hier speichern.

// Webhook-URL für Anwesenheits-Checkin (aus n8n, Production-URL)
window.WEBHOOK_CHECKIN_URL = 'https://IHRE-N8N-DOMAIN/webhook/anwesenheit-checkin';

// Webhook-URL für Kurs-CRUD und Tages-Dashboard (aus n8n, Production-URL)
window.WEBHOOK_COURSES_URL = 'https://IHRE-N8N-DOMAIN/webhook/kurse';

// Shared-Key für den Checkin-Endpunkt – muss mit der n8n-Variable CHECKIN_KEY übereinstimmen.
// Hinweis: Diese Datei ist öffentlich. Der Key ist kein Sicherheitsmerkmal,
// sondern eine einfache Hürde gegen versehentliche oder automatisierte Anfragen.
window.CHECKIN_KEY = 'mvp-checkin-2025';

// Angezeigter Name in der Oberfläche
window.BRAND_NAME = 'Bildungsträger';
