<!-- Quelle für «Ampel Unterhalt.pdf». Beide Dateien haben denselben Inhalt; wer hier etwas ändert, erzeugt das PDF neu. -->

# Ampel Unterhalt

Panta Rey · BTC-Ampel · Konfiguration 1.0 · Stand 17. November 2026  
Seite: https://panta-rey.github.io/BTC/ · Repo: https://github.com/Panta-rey/BTC  

> **In einem Satz.** Die Ampel rechnet bei GitHub und meldet sich per E-Mail, wenn etwas ist. Du trägst zwei Zahlen im Monat ein und schaust zweimal im Jahr nach, ob sie noch läuft. Kaufen und verkaufen tust immer du selbst.

## 1. Was von selbst läuft

| Wann | Was | Du merkst es an |
|---|---|---|
| Montag früh | **Wochenlauf:** Daten holen, Phase rechnen, Signale prüfen | Die Seite zeigt den neuen Wochenstand |
| Täglich am Morgen | **Tageslauf:** Tageswerte und Meldungen | E-Mail, falls etwas fällig ist |
| 1. bis 5. des Monats | Erinnerung an die zwei Zahlen | Issue «Monatliche Handeingabe fällig» |
| Anfang Januar | Jahres-Review und Indikator-Prüfung | Issue «Jahres-Review» |

Jede Meldung ist ein GitHub-Issue und kommt als E-Mail. Die Seite ist nur Anzeige: Ob du sie täglich oder nie öffnest, ändert nichts am Ergebnis.

## 2. Deine Aufgaben

| Wie oft | Was | Dauer |
|---|---|---|
| Monatlich | Zwei Zahlen ablesen und eintragen (Abschnitt 3) | 5 Minuten |
| Bei starkem Kursrutsch | Die zwei Zahlen ausser der Reihe neu ablesen. Als stark gilt: Der Kurs liegt mehr als 10 % neben dem Kurs der letzten Lesung | 5 Minuten |
| Nach jedem Journaleintrag | Backup exportieren (Abschnitt 5) | 10 Sekunden |
| Zweimal im Jahr | Nachsehen, ob der Wochenlauf noch läuft (Abschnitt 6) | 30 Sekunden |
| Wenn eine Meldung kommt | Lesen und selbst entscheiden (Abschnitt 4) | – |

## 3. Monatlich: zwei Zahlen eintragen

1. Die Seite öffnen und oben rechts aufs Zahnrad tippen.
2. **Angebot im Gewinn:** «Chart öffnen», den Prozentwert der Hauptlinie ganz rechts ablesen, zum Beispiel 62.2.
3. **STH-Realized-Price:** «Chart öffnen», die Linie **STH Cost Basis** ablesen. Nicht «Realised Price», die liegt viel tiefer.
4. Beide Werte eintragen und auf «Speichern» tippen. GitHub öffnet sich mit einem fertigen Eintrag.
5. Dort auf «Create» klicken. Nach etwa einer Minute steht darunter «Übernommen», und das Issue schliesst sich von selbst.

**Kontrolle:** Das Angebot im Gewinn liegt zwischen 35 und 95. Der STH-Wert liegt in der Nähe des aktuellen Kurses. Bei einem Tippfehler warnt die Seite und sperrt das Speichern.

**Gesperrte Felder:** Reserve Risk, RHODL-Ratio und LTH-Positionsänderung sind ausgegraut. Das ist Absicht.

**Falsch eingetragen?** In derselben Woche nochmals richtig speichern. Der neue Wert ersetzt den alten.

## 4. Meldungen und was sie bedeuten

| Meldung | Bedeutung | Was tun |
|---|---|---|
| Kauftranche oder Verkaufstranche fällig | Die Bedingungen der Ampel sind erfüllt | Seite öffnen, Handlungssatz lesen, selbst entscheiden |
| Phasenwechsel, Trendbruch bestätigt | Eine neue Phase hat begonnen | Seite öffnen und lesen |
| Reserve einsetzbar | Im Aufwärtstrend gibt es eine Nachkaufgelegenheit | Ein Hinweis, kein Auftrag. Du entscheidest |
| Vorstufe erreicht, Hinweis des inaktiven Motors | Eine Bedingung ist einmal erfüllt, die Bestätigung steht aus | Nichts, nur zur Kenntnis |
| Monatliche Handeingabe fällig | Die zwei Zahlen fehlen für diesen Monat | Abschnitt 3 |
| Daten unvollständig, Pipeline liefert nicht | Eine Quelle oder ein Lauf ist ausgefallen | Abschnitt 7 |
| Jahres-Review | Jährliche Erinnerung | Backup exportieren, dann Abschnitt 6 |
| Indikator-Prüfung: auffällige Indikatoren | Bericht über nachlassende Kennzahlen | Nichts ändern, Notiz für später |

Die Ampel kauft und verkauft nichts. Sie ist eine Entscheidungshilfe und kennt nur vier Zyklen. Schliess ein Issue, wenn du es erledigt hast.

## 5. Deine Position und das Journal

In der Karte «Deine Position» wählst du, wie du die Ampel nutzt:

- **Tranchen:** Du folgst den Signalen. Nach dem Handeln die Tranche als erledigt oder übersprungen markieren.
- **Sparplan:** Du trägst ein, was du diesen Monat zur Seite gelegt hast. Die Seite schlägt vor, wie viel davon du investierst.
- **Frei:** Du trägst deine Käufe selbst ein. Das Journal merkt sich, wie die Ampel in dem Moment stand.

**Alles liegt nur in deinem Browser.** Löschst du die Browserdaten, ist es weg. Deshalb nach jedem Eintrag im Journal «Backup exportieren» und die Datei an einem eigenen Ort aufbewahren. Auf ein anderes Gerät kommt sie mit «Backup importieren». Die Datei ist nicht verschlüsselt: Wer sie öffnet, sieht deine Bestände.

## 6. Zweimal im Jahr: läuft sie noch?

Einen Fehler kann die Ampel nicht melden: wenn sie selbst nicht mehr läuft. Setz dir zwei Kalendereinträge im Jahr. Dann im Repo auf «Actions» schauen: Der jüngste Wochenlauf muss grün und höchstens sieben Tage alt sein.

## 7. Wenn etwas klemmt

| Woran du es merkst | Was tun |
|---|---|
| Die Seite zeigt einen alten Stand | Strg + F5. Hilft das nicht, den Aktualisieren-Knopf oben rechts drücken |
| Gelber Balken auf der Seite | Eine Quelle oder Kennzahl fehlt. Betrifft es den STH-Einstand: Abschnitt 3. Sonst den nächsten Wochenlauf abwarten |
| Wochenlauf rot beim Schritt «Daten holen» | Der Anbieter war kurz weg. Im Lauf oben rechts «Re-run all jobs» drücken |
| Wochenlauf rot beim Schritt «Tests» | Meist stimmt etwas mit `data/manual.json` nicht. Nichts löschen. Die rote Fehlermeldung kopieren und damit Hilfe holen. Der Abbruch ist Absicht: Er verhindert, dass die Ampel still in eine andere Phase springt |
| Seit über sieben Tagen kein Lauf | Actions, Wochenlauf, «Enable workflow», danach «Run workflow» |
| Nach einer Code-Änderung zeigt die Seite Altes | Actions, Wochenlauf, «Run workflow», dann Strg + F5 |
| `git push` wird abgelehnt | Zuerst `git pull --rebase`, dann nochmals `git push` |
| Die Seite ist nicht erreichbar | Die Adresse oben prüfen. Auf githubstatus.com nachsehen, ob GitHub gestört ist |

## 8. Drei Dinge, die du nie tun solltest

- **Bestände oder Beträge ins Repo schreiben.** Das Repo ist öffentlich.
- **Alte Lesungen in `data/manual.json` löschen oder ändern**, vor allem die von Dezember 2025 bis September 2026. An ihnen hängt, in welcher Phase die Ampel steht.
- **An `config/engine.json` drehen.** Die Einstellungen sind eingefroren.

Mehr Einzelheiten stehen in `HANDOFF.md`, zuerst Abschnitt 13. Keine Anlageberatung.
