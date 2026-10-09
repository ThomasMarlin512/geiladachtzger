# Geiladachtzger

Gruppenhauptseite mit Veranstaltungsübersicht, Terminabstimmungen und Rückblick.

## Veröffentlichung

Statische Webseite: Repository über GitHub Pages mit Branch `main`, Verzeichnis `/`, veröffentlichen. `index.html`, `event.html`, `app.js` und `styles.css` gehören ins Repository-Wurzelverzeichnis.

## Gemeinsame Datenbank

Alle Gruppen- und Veranstaltungswebseiten verwenden das bestehende Supabase-Projekt `rzzipqdozabuxrmoxhlw`. Der veröffentlichte Schlüssel ist ein Publishable Key. Zugriff auf Gruppendaten erfordert eine bestätigte Gruppenmitgliedschaft.

- `group_people`: gemeinsame Namen, verbunden mit dauerhaftem Mitgliederschlüssel.
- `group_events`: Veranstaltungen, eigene Webseiten, bestätigte Termine.
- `group_event_dates`: Terminoptionen je Veranstaltung.
- `group_date_votes`: Stimmen je Terminoption und Mitglied.
- `group_event_attendance`: Teilnahme je Veranstaltung und Mitglied.
- Bestehende Kufstein-Tabellen bleiben erhalten. Teilnahme wird in beide Richtungen mit `group_event_attendance` synchronisiert.

Die Gruppenanmeldung verwendet weiterhin die bestehenden Nicknamen und den Gruppencode. Auf GitHub Pages unter `thomasmarlin512.github.io` teilen alle Repository-Seiten dieselbe Supabase-Browsersitzung. Bei anderen Domains ist eine weitere Anmeldung erforderlich.

Mitglieder können Veranstaltungen vorschlagen. Nur der jeweilige Ersteller kann Informationen bearbeiten und den Termin festlegen. Teilnehmer ändern nur eigene Stimmen und Teilnahme.

Die Seite `event.html?id=<veranstaltungs-id>` ist eine eigene Detailseite für neue Veranstaltungen. Für ein separat gehostetes Veranstaltungsrepository kann der Ersteller die URL in der Detailseite hinterlegen.

Keine Foto-Uploads oder automatischen iCloud-Imports sind eingerichtet.
