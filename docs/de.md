# August / Yale — Benutzerhandbuch

Diese Integration bringt Ihre **smarten Schlösser** und **Video-Türklingeln**
von **August** und **Yale** in Gladys Assistant — über die August-/Yale-Cloud,
die auch die offiziellen Apps verwenden.

## Was Sie erhalten

| Gerät            | In Gladys                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Smartes Schloss  | Verriegeln / Entriegeln, Batterie, Tür offen / geschlossen (DoorSense), Batterie der Tastatur |
| Video-Türklingel | Letztes Bild (Kamera), Klingeln, Bewegung, Batterie                                           |

Zusätzlich zu den Geräten:

- **Szenen-Auslöser**: _Schloss betätigt_ (Filter nach Schloss, Aktion —
  verriegelt, entriegelt, geöffnet — und Art: App, aus der Ferne, Tastatur,
  von Hand, automatische Verriegelung, Fingerabdruck, Schlüsselanhänger; der
  Benutzername steht als Variable zur Verfügung), _Schloss blockiert_,
  _Türklingel gedrückt_, _Bewegung an der Türklingel_.
- **Szenen-Aktionen**: _Eine Tür verriegeln_, _Eine Tür entriegeln_, _Eine Tür
  öffnen (Falle ziehen)_, _Bild der Türklingel aufnehmen_. Jede meldet, ob sie
  erfolgreich war, damit die folgenden Aktionen davon abhängen können.
- **Dashboard-Widgets**: _Smart Lock_ (ein Schloss mit seinen Tasten oder eine
  Übersicht aller Schlösser mit der Taste „Alles verriegeln“),
  _Video-Türklingel_ (letztes Bild, letztes Klingeln und letzte Bewegung),
  _Türaktivität_ (wer was wie und wann getan hat).

Unterstützte Modelle: alle Schlösser und Türklingeln der Apps August, Yale
Access und Yale Home — August Smart Lock (alle Generationen), August Wi-Fi
Smart Lock, Yale Linus, Yale Linus L2, Yale Assure Lock / Assure Lock 2, Yale
Conexis L2, Yale Unity, August View, Yale Smart Video Doorbell…

## Voraussetzungen

- Gladys Assistant **5.3 oder neuer**.
- Ein Konto in der App **August**, **Yale Access** oder **Yale Home**, in dem
  Ihre Geräte bereits eingerichtet sind.
- Um den Zustand live zu sehen und ein Schloss über Gladys zu steuern, muss das
  Schloss für die Cloud erreichbar sein: über eine **WLAN-Bridge** (August
  Connect, Yale Connect Wi-Fi Bridge) oder ein Schloss mit integriertem WLAN.
  Ohne Bridge wird das Schloss mit einem orangefarbenen Punkt angezeigt: Sein
  Zustand wird nur aktualisiert, wenn ein Telefon mit der App es per Bluetooth
  erreicht.

Die Integration arbeitet **nur über die Cloud**: Der Gladys-Container hat
keinen Bluetooth-Zugriff, eine lokale Steuerung ist daher nicht möglich.

## Einrichtung

1. Öffnen Sie **Integrationen → August / Yale → Konfiguration**.
2. Wählen Sie die **App**, in der Ihre Schlösser registriert sind:
   - _August_ — die August-App;
   - _Yale Access_ — die Yale-Access-App (Nordamerika);
   - _Yale Home_ — die Yale-Home-App (Europa und übrige Welt).
3. Wählen Sie die **Anmeldemethode** (E-Mail oder Telefonnummer), geben Sie
   **Benutzername** und **Passwort** Ihres Kontos ein und speichern Sie.
4. Beim ersten Mal sendet die Cloud einen **Bestätigungscode** per E-Mail oder
   SMS. Geben Sie ihn in der Aktion **Code bestätigen** der
   Konfigurationsseite ein. Nicht erhalten? Verwenden Sie **Neuen Code
   senden**.
5. Öffnen Sie den Tab **Erkennung**: Ihre Schlösser und Türklingeln werden
   aufgelistet. Legen Sie sie an.

Der Code wird nur einmal abgefragt: Die Sitzung wird im Speicher der
Integration aufbewahrt. Ein Wechsel des Kontos oder der App erfordert einen
neuen Code.

## Optionen

- **Echtzeit-Ereignisse** (standardmäßig an): Die Ereignisse (Schloss betätigt,
  Türklingel gedrückt…) kommen über den Kanal der Apps in wenigen Sekunden an.
  Ausgeschaltet wird die Aktivität jede Minute gelesen.
- **Entriegeln über Gladys erlauben** (standardmäßig an): Schalten Sie es aus,
  damit Gladys verriegeln, aber niemals entriegeln oder eine Tür öffnen kann —
  die Widgets zeigen dann nur die Taste „Verriegeln“, und die
  Entriegelungs-Aktionen werden abgelehnt.
- **Aktualisierungsintervall**: wie oft alle Geräte neu gelesen werden
  (standardmäßig 5 Minuten, mindestens 1 Minute).

## Werte

- Schloss: `1` = verriegelt, `0` = entriegelt (eine geöffnete Falle ergibt `0`).
- Tür: `1` = geschlossen, `0` = offen.
- Klingeln und Bewegung: `1` für einige Sekunden, dann zurück auf `0`.

## Fehlerbehebung

- **„Anmeldung abgelehnt“**: Prüfen Sie die App (August / Yale Access / Yale
  Home), die Anmeldemethode und das Passwort. Melden Sie sich zur Kontrolle mit
  denselben Daten in der App an.
- **Kein Code erhalten**: Prüfen Sie den Spam-Ordner und verwenden Sie dann
  **Neuen Code senden**. Eine Telefonnummer muss im internationalen Format
  angegeben werden (z. B. `+4915112345678`).
- **Ein Schloss ist nicht erreichbar**: Seine WLAN-Bridge ist offline. Prüfen
  Sie Stromversorgung und WLAN.
- **Yale-Home-Konten**: Yale stellt die Yale-Home-Konten schrittweise auf ein
  neues Anmeldesystem um. Wird die Anmeldung abgelehnt, obwohl die Daten in der
  App funktionieren, eröffnen Sie bitte ein Issue im Repository.
- Mit **Verbindung testen** wird das Konto neu gelesen und angezeigt, wie viele
  Schlösser und Türklingeln gefunden wurden. Die Protokolle der Integration
  (Gladys → Einstellungen → System → Integrationen) verraten mehr; sie
  enthalten niemals Ihr Passwort oder Ihr Token.

## Datenschutz und Sicherheit

Das Passwort bleibt in der Gladys-Konfiguration; das Sitzungstoken wird im
privaten Volume der Integration gespeichert. Kontaktiert werden nur die
August-/Yale-Cloud, ihr Echtzeitdienst (PubNub) und der Bild-Host der
Türklingeln (Cloudinary). Melden Sie Sicherheitsprobleme vertraulich, siehe
`SECURITY.md` im Repository.
