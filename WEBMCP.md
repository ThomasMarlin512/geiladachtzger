# WebMCP

Die Website registriert optionale Browserwerkzeuge über `document.modelContext.registerTool` (mit `navigator.modelContext` als kompatiblem Fallback). Ohne unterstützten Browser bleibt die normale Website unverändert bedienbar. Die Werkzeuge laufen nur auf der geöffneten Seite; es gibt keinen Hintergrunddienst.

## Gruppenwebsite

| Werkzeug | Wirkung |
| --- | --- |
| `geiladachtzger_list_events` | Veranstaltungen und Links lesen |
| `geiladachtzger_get_event` | Teilnahme und Terminstimmen lesen |
| `geiladachtzger_set_my_attendance` | Eigene Teilnahme speichern |
| `geiladachtzger_vote_date` | Eigene Stimme für einen offenen Termin speichern |
| `geiladachtzger_prepare_event` | Auf der Hauptseite ein Formular vorbereiten, noch nichts speichern |

Beispiele: „Welche Veranstaltungen stehen an?“, „Zeige die Terminabstimmung für diese Reise“, „Setze meine Teilnahme auf vielleicht“, „Bereite einen Ausflug mit diesen zwei Terminen vor“.

Die Person muss sich zunächst über die normale Gruppenanmeldung anmelden. Jeder Aufruf prüft die aktuelle Sitzung und fragt die Mitgliedschaft mit dem vorhandenen Supabase-Client ab. Datenbankrechte und RLS bleiben unverändert. Identitäten für Schreibzugriffe stammen aus der Sitzung, niemals aus Tool-Eingaben. Keine Codes, Tokens, E-Mail-Adressen oder internen Mitgliedsschlüssel werden zurückgegeben. Namen und Beschreibungen gelten als nicht vertrauenswürdige Inhalte.

`source: default` bedeutet voreingestellte Teilnahme, `source: recorded` gespeicherter Stand. Ein gespeicherter Stand ist kein Nachweis einer ausdrücklichen persönlichen Zusage.

Schreibwerkzeuge liefern `status: saved` erst nach bestätigter Datenbankantwort. Wenn die anschließende Anzeigeaktualisierung scheitert, wird `ui_updated: false` gemeldet. Die Formularvorbereitung liefert ausdrücklich `status: prepared` und `saved: false`. Fehler geben `ok: false` zurück. Erneutes Abstimmen überschreibt nur die eigene bisherige Stimme.

## Prüfung

```sh
node --experimental-vm-modules tests/webmcp.test.mjs
```

Die Tests verwenden eine simulierte Datenbank und Browserregistrierung. Sie ändern keine echten Teilnehmer oder Stimmen. Geprüft werden unter anderem fehlende Browserunterstützung, Registrierung und Seitenlebenszyklus, fehlende/gewechselte Anmeldung, ungültige Eingaben, Identitätsgrenzen, fehlgeschlagene Speicherung und Anzeigeaktualisierung. Ein Ende-zu-Ende-Test in einem WebMCP-fähigen Browser mit echter Gruppenanmeldung bleibt separat erforderlich.
