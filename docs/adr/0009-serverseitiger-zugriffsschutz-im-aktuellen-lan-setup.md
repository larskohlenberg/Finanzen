# Serverseitiger Zugriffsschutz im aktuellen LAN-Setup

Die App wird im aktuellen Setup ueber Synology Web Station im lokalen Netzwerk bereitgestellt. Das Portal zeigt auf das App-Verzeichnis mit `index.html` und den statischen Dateien. Die Synology ist nur lokal erreichbar; Router/Fritzbox blockieren Internetzugriff und es gibt kein Port Forwarding.

Entscheidung: Fuer dieses konkrete Setup wird der Zugriffsschutz serverseitig vor der statischen App geloest. Der Webserver schuetzt das gesamte App-Verzeichnis, inklusive direkter Dateiaufrufe wie `review-data.js`. Die App selbst bekommt kein internes Passwortfeld und erzwingt keine bestimmte Authentifizierungsloesung.

Im aktuellen Synology-Setup wird das ueber Web Station mit Apache und `.htaccess`/Digest-Auth geloest. Passwortdateien, Benutzer und konkrete Serverkonfigurationen gehoeren nicht ins Repository. Entscheidend ist die Sicherheitsanforderung: Wenn die App ueber ein Netzwerk ausgeliefert wird, muessen sensible statische Dateien serverseitig geschuetzt sein.

Begruendung: Ein Login-Dialog in der statischen App waere nur Scheinschutz. Die Finanzdaten liegen im ausgelieferten JavaScript-Review-Bundle und koennten ohne serverseitigen Schutz direkt ueber die URL abgerufen werden. Deshalb muss der Schutz vor der App greifen.

## Verworfene Alternativen

- **Passwortfeld in `index.html` oder `main.js`**: schuetzt die Anzeige, aber nicht direkte Zugriffe auf `review-data.js` oder andere statische Dateien.
- **Nginx-Konfigurationsdateien der Synology manuell patchen**: technisch moeglich, aber update-fragil und zu stark an ein individuelles NAS-Setup gebunden.
- **App-seitig vorgeschriebene Authentifizierung**: zu viel Architektur fuer den aktuellen Stand und nicht passend zu einer statischen, read-only App.

## Konsequenz

Das Repository dokumentiert die Anforderung und die Architekturgrenze, aber nicht die geheimen oder geraetespezifischen Details des Setups.

Fuer den aktuellen Betrieb gilt als Pruefung:

- Die normale App-URL verlangt Login.
- Ein direkter Aufruf von `review-data.js` verlangt ebenfalls Login.
- Passwortdateien und Server-Credentials liegen ausserhalb des Repositories.
- Die konkrete Webserver-Loesung ist individuelles Deployment, nicht Teil der App.

Andere Deployments duerfen andere serverseitige Schutzmechanismen verwenden, solange sie denselben Effekt haben: Niemand im Netzwerk kann die App oder sensible statische Daten ohne Zugriffsschutz lesen.
