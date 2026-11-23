# **Antigravity Initialisierungs-Prompt: Endo-App**

Vollständiger, produktionsreifer Master-Prompt und Phasenplan zur automatisierten und deterministischen Systeminitialisierung der **Endo-App** (Persönlicher Selbsthilfe- & Tracking-Begleiter).

---

# **Meta-Spezifikation & Ausführungskontext**

| Parameter | Wert / Vorgabe |
| :---- | :---- |
| **Arbeitsverzeichnis** | Aktueller `Endo`\-Projektordner (Google Drive / lokal synchronisiert) |
| **Referenz-Grundlagen** | `00-app-standard` (`HANDBUCH.md`, `app_development_guidelines_richtlinien.txt`, `init-new-app.ps1`, `NEUE-APP-VORLAGE.md`), ZTA-OS V10.2 UI/UX-Standard (`frontend/`, `handbuch.html`), Klarschiff, `00_Endo_App_Projektkonzept_und_Roadmap` |
| **Deployment-Ziel** | Dual-Mode: Independent GitHub Pages Mobile-First PWA (`docs/` oder Root `./`) \+ Lokales FastAPI Backend (`00-app-standard` konform) |
| **Architektur-Typ** | PWA-First Dual-Storage (Offline IndexedDB \+ Server FastAPI Sync Engine) |
| **Zielpublikum / Scope** | 100 % persönliche Single-User-Anwendung |

---

# **1\. Projektziel, Scope & Leitplanken**

## **Strikter Single-User-Fokus**

Die Endo-App ist eine reine Single-User-Anwendung zur eigenverantwortlichen Alltagsunterstützung und Datenstrukturierung bei Endometriose und assoziierten chronischen Entzündungsprozessen.

* **Kein Multi-User-Overhead:** Keine Benutzerverwaltung, keine Remote-Datenbank-Zwangsanbindung, keine Social- oder Community-Features, keine externen Telemetrie-Tracker.  
* **Maximale Datenhoheit:** Alle eingegebenen Daten verbleiben primär lokal auf dem Endgerät des Nutzers (IndexedDB im Browser) bzw. in der lokalen Server-Instanz (`data/data.json`).  
* **Privatsphäre-Sperre:** Optionale clientseitige 4-stellige PIN-Sperre mit Hashing im `localStorage` zum Schutz vor unbefugtem lokalen Zugriff auf das Mobilgerät.

## **Rechtliche & Wording-Leitplanken (Strikte Compliance)**

Die Software dient ausschließlich der persönlichen Dokumentation und Selbstbeobachtung („Hilfe zur Selbsthilfe").

1. **Keine Zweckbestimmung als Medizinprodukt:** Die Anwendung stellt keine Diagnosen, berechnet keine Therapieeinstellungen, gibt keine Heilversprechen ab und empfiehlt keine rezeptpflichtigen Medikationseingriffe.  
2. **Neutrales Wording:** Sämtliche Benutzeroberflächen-Texte, Auswertungshinweise und automatisierten Tagesimpulse sind strikt beschreibend, hypothetisch und korrelativ zu formulieren.  
   * *Verboten:* „Gluten verursacht deine Schmerzen." / „Nimm 500mg Magnesium zur Heilung."  
   * *Erlaubt:* „Verzögerungs-Detektiv: An Tagen nach Gluten-Eingabe lag dein Schmerzscore im Schnitt 1,8 Punkte höher (n=5 Einträge). Beobachte dies weiter."

## **Dual-Mode-Architektur**

```
+-----------------------------------------------------------------------------------+
|                                 ENDO-APP CLIENT                                  |
|   (Mobile-First PWA / iOS Safari "Zum Home-Bildschirm" / Standalone HTML5/ES6)    |
+-----------------------------------------------------------------------------------+
                                          |
                +-------------------------+-------------------------+
                |                                                   |
                v                                                   v
    [ MODUS A: STANDALONE PWA ]                         [ MODUS B: HYBRID FASTAPI ]
    - Host: GitHub Pages (HTTPS)                        - Local / Server Backend
    - Primary Storage: IndexedDB                        - Endpoints: REST API (/api/*)
    - Fallback: LocalStorage                            - Primary Storage: data/data.json
    - Backup: 1-Tap JSON File I/O                       - Rotation: data.json.bak.1..5
    - Engine: Client-Side JS Core                       - Engine: Python logic.py
```

---

# **2\. UI/UX-Standard Spezifikation**

Die optische und haptische Gestaltung folgt exakt den Prinzipien des ZTA-OS V10.2 und den Apple Human Interface Guidelines (HIG) für mobile Webanwendungen.

## **CSS-Tokens & Visual System**

```
:root {
  /* Farbpalette */
  --bg-app: #F8FAFC;
  --bg-card: #FFFFFF;
  --border-card: #E2E8F0;
  
  --primary-accent: #2E5A44;         /* Tiefes Salbeigrün */
  --primary-accent-light: #EBF3EE;   /* Soft Sage Tint */
  --secondary-accent: #7C3A2D;       /* Warmes Aubergine/Terrakotta */
  --secondary-accent-light: #FDF2F0; /* Soft Warm Tint */
  
  --text-main: #0F172A;              /* Dark Slate */
  --text-muted: #64748B;             /* Cool Grey */
  --text-subtle: #94A3B8;            /* Light Grey */
  
  /* Semantische Tints (Ampelsystem) */
  --badge-green-bg: #DCFCE7;  --badge-green-fg: #15803D;
  --badge-yellow-bg: #FEF9C3; --badge-yellow-fg: #A16207;
  --badge-red-bg: #FEE2E2;    --badge-red-fg: #B91C1C;
  
  /* Layout & Elevation */
  --radius-card: 16px;
  --radius-pill: 999px;
  --shadow-subtle: 0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.02);
  --shadow-card: 0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -1px rgba(15, 23, 42, 0.02);
  
  /* Typografie */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

body {
  font-variant-numeric: tabular-nums;
  background-color: var(--bg-app);
  color: var(--text-main);
  font-family: var(--font-family);
  -webkit-tap-highlight-color: transparent;
}
```

## **Navigationsstruktur (5-Tab-Architecture)**

```
+-----------------------------------------------------------------------------------+
|  [ TAB 1: HEUTE ]   | Daily-Log | Zyklus-Kompass | Tagesimpuls | [1-Tap Schub]    |
|  [ TAB 2: MUSTER ]  | Verzögerungs-Detektiv | Jahres-Heatmap | Ampel | Experimente |
|  [ TAB 3: TRESOR ]  | Befunde | Labor-Charts | Foto-Timeline | Arzt-Dossier (PDF) |
|  [ TAB 4: RADAR ]   | PubMed Studien-Radar | Termin-Agent (Suchprofile)           |
|  [ TAB 5: MEHR ]    | Custom Fields | JSON Backup | PIN | Handbuch (handbuch.html)|
+-----------------------------------------------------------------------------------+
```

---

# **3\. Datenmodell Spezifikation (JSON Schema)**

Das System nutzt ein einheitliches JSON-Schema für die clientseitige `IndexedDB` und das serverseitige `data/data.json`.

```
{
  "version": "1.0.0",
  "last_updated": "2023-10-24T14:30:00Z",
  "settings": {
    "pin_hash": null,
    "pin_enabled": false,
    "cycle_average_length": 28,
    "theme_mode": "light",
    "custom_fields": [
      { "id": "cf_bloating_level", "label": "Blähbauch-Intensität", "type": "scale_10", "enabled": true },
      { "id": "cf_magnesium", "label": "Magnesium genommen", "type": "boolean", "enabled": true }
    ],
    "study_radar": {
      "topic_clusters": ["endometriosis", "inflammation", "peritoneal_abdominal", "diagnostic_gap"],
      "custom_queries": []
    }
  },
  "daily_logs": [
    {
      "id": "log_2023-10-24",
      "date": "2023-10-24",
      "cycle_day": 14,
      "cycle_phase": "ovulation",
      "pain_score": 3,
      "inflammation_score": 4,
      "energy_score": 7,
      "nutrition_tags": ["glutenfrei", "antientzündlich", "kurkuma"],
      "nutrition_note": "Warmes Hafer-Crumble morgens",
      "activity_type": "Yoga",
      "activity_intensity": "mild",
      "digestion_score": "normal",
      "digestion_tags": ["regelmäßig"],
      "wellbeing_note": "Entspannt nach dem Spaziergang",
      "general_note": "Guter Tag insgesamt, leichtes Ziehen rechts.",
      "custom_values": {
        "cf_bloating_level": 2,
        "cf_magnesium": true
      }
    }
  ],
  "flare_ups": [
    {
      "id": "flare_2023-10-12_0830",
      "start_timestamp": "2023-10-12T08:30:00Z",
      "end_timestamp": "2023-10-12T14:00:00Z",
      "initial_pain_score": 8,
      "peak_pain_score": 9,
      "body_locations": ["Unterleib zentriert", "Rücken lendenübergreifend"],
      "applied_measures": ["Wärmflasche", "Kamillentee", "Flachlegen"],
      "notes": "Starker Schubeskalation am Morgen."
    }
  ],
  "self_experiments": [
    {
      "id": "exp_omega3_01",
      "title": "Hochdosiertes Omega-3 (Algenöl)",
      "target_hypothesis": "Reduktion der monatlichen Entzündungswerte um 1.5 Punkte",
      "start_date": "2023-09-01",
      "end_date": "2023-09-30",
      "status": "completed",
      "baseline_metrics": { "avg_pain": 5.4, "avg_inflammation": 6.1, "avg_energy": 4.5 },
      "experiment_metrics": { "avg_pain": 3.8, "avg_inflammation": 4.2, "avg_energy": 6.2 }
    }
  ],
  "ampel_items": [
    { "id": "amp_1", "category": "nutrition", "name": "Glutenhaltiges Brot", "status": "red", "notes": "Führt verlässlich nach 24h zu Blähbauch und Schmerzanstieg" },
    { "id": "amp_2", "category": "nutrition", "name": "Gekochter Brokkoli", "status": "green", "notes": "Sehr gut verträglich" },
    { "id": "amp_3", "category": "activity", "name": "Intensives HIIT-Training", "status": "yellow", "notes": "Nur in Follikelphase verträglich" }
  ],
  "lab_entries": [
    { "id": "lab_1", "date": "2023-10-01", "parameter": "CRP", "value": 2.4, "unit": "mg/l", "reference_range": "< 5.0", "notes": "Unauffällig" },
    { "id": "lab_2", "date": "2023-10-01", "parameter": "Ferritin", "value": 18.0, "unit": "µg/l", "reference_range": "30 - 200", "notes": "Leicht erniedrigt" }
  ],
  "medical_notes": [
    { "id": "doc_1", "date": "2023-09-15", "doctor_type": "Gynäkologie", "summary": "Ultraschall unauffällig, Empfehlung für Physiotherapie erhalten.", "file_ref": null }
  ],
  "doctor_questions": [
    { "id": "q_1", "created_date": "2023-10-20", "question": "Ist ein Rezept für Beckenboden-Physiotherapie sinnvoll?", "is_resolved": false }
  ],
  "studies": [
    {
      "id": "pub_3459102",
      "pmid": "3459102",
      "pub_date": "2023-08-15",
      "title": "Anti-inflammatory dietary interventions in endometriosis management",
      "summary_de": "Untersuchung von Omega-3-Fettsäuren und Polyphenolen zeigt eine signifikante Reduktion von Schmerzmarkern bei 62% der Teilnehmerinnen.",
      "url": "https://pubmed.ncbi.nlm.nih.gov/3459102/",
      "is_bookmarked": true,
      "matched_keywords": ["endometriosis", "peritonitis"],
      "topic_cluster": "peritoneal_inflammation"
    }
  ],
  "appointment_profiles": [
    {
      "id": "app_prof_1",
      "service_name": "Osteopathie / Lymphdrainage",
      "zip_code": "10115",
      "radius_km": 15,
      "booking_url": "https://beispiel-praxis.de/termin",
      "active": true
    }
  ]
}
```

---

# **4\. Technische Architektur (`00-app-standard` Konformität)**

## **Ordner- & Dateistruktur**

```
Endo/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── README.md
├── start.ps1
├── start.sh
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── logic.py          # Deterministische Berechnungs-Engine (Python)
│   │   ├── main.py           # FastAPI REST Router & Static File Serving
│   │   └── storage.py        # Thread-sichere JSON-Persistenz & Rotation (.bak.1..5)
├── data/                     # Git-ignoriertes Datenverzeichnis
│   ├── data.json
│   ├── study_radar_config.json
│   ├── studies.json
│   ├── data.json.bak.1
│   └── data.json.bak.5
├── docs/                     # Export-Build / GitHub Pages Root Output
│   ├── index.html
│   ├── handbuch.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js            # Main PWA Controller & Router
│       ├── db.js             # IndexedDB & LocalStorage Engine
│       ├── logic_client.js   # Client-seitige Spiegelung aller Analyse-Algorithmen
│       └── components/       # UI-Komponenten (Heatmap, Charts, Dossier)
├── scripts/
│   ├── appointment_watcher.py # Modulare Termin-Such-Skripte
│   ├── build_initial_data.py  # 90-Tage Demo-Daten-Generator
│   └── study_radar.py         # PubMed E-Utilities API Fetcher
└── tests/
    ├── __init__.py
    ├── test_api.py
    ├── test_logic.py
    └── test_storage.py
```

---

# **5\. Verbindliche Schritt-für-Schritt-Abfolgeliste für Antigravity**

Die Ausführung erfolgt in 8 sequenziellen, isoliert überprüfbaren Phasen.

```
+-----------------------------------------------------------------------------------+
| PHASE 1: Konfiguration, Struktur & Dokumenten-Init                                |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 2: Datenmodell & Synthetischer Demo-Daten-Generator (90 Tage)               |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 3: Backend-Engine (Python logic.py, storage.py, FastAPI, Scripts)           |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 4: Backend Automated Testing (`pytest` Testsuite)                           |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 5: Standalone Mobile-First PWA (HTML5/CSS3/ES6, IndexedDB, ZTA-OS UI)        |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 6: Print & PDF Dossier Engine Engine (@media print, Arzt-Report)            |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 7: Deployment-Automation (Skripte, GitHub Pages Config, `.nojekyll`)        |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| PHASE 8: QA-Abnahme & 8-Rollen-Compliance-Check                                  |
+-----------------------------------------------------------------------------------+
```

---

## **Phase 1 – Kontext-Check & Initialisierung**

1. Erstelle die beschriebene Ordnerstruktur im aktuellen Arbeitsverzeichnis.  
2. Initialisiere die Basis-Konfigurationsdateien:  
   * Erstelle `.gitignore` mit Ausschlüssen für `data/*.json*`, `__pycache__/`, `.pytest_cache/`, `.env`, `node_modules/`.  
   * Erstelle `.env.example` mit Konfigurations-Variablen (`PORT=8000`, `ENV=development`).  
   * Erstelle `README.md` inklusive 3-Zeilen-Quickstart für lokales Python/FastAPI und Deployment auf GitHub Pages.

---

## **Phase 2 – Datenmodell & Synthetische Testdaten**

1. Implementiere das Skript `scripts/build_initial_data.py`.  
2. Das Skript erzeugt deterministisch genau **90 Tage lückenlose Beispieldaten** rückwirkend ab dem aktuellen Tagesdatum und speichert diese unter `data/data.json`:  
   * **Zyklusverlauf:** 3 vollständige Zyklen (durchschnittlich 28 Tage) mit typischen Phasenschwankungen.  
   * **Verzögerungs-Trigger:** Synthetische Injizierung valider Muster (z. B. Tag mit Tagging `glutenhaltig` korreliert mit erhöhtem Schmerzwert nach genau \+24 Stunden; Tag mit `Stress` korreliert mit Entzündungsanstieg nach \+48 Stunden).  
   * **Events:** Mindestens 3 protokollierte Flare-Up-Episoden.  
   * **Selbst-Experimente:** 1 abgeschlossenes Experiment (z. B. "3 Wochen Omega-3") mit nachweisbarer Score-Verbesserung sowie 1 aktives Experiment.  
   * **Befunde & Labor:** 4 Labor-Messpunkte für CRP, Ferritin, Vitamin D sowie 2 strukturierte Arztbrief-Einträge und 3 offene Fragen.  
   * **Studien:** 5 kuratierte Beispiel-Studien mit echten PubMed-IDs.

---

## **Phase 3 – Backend Core-Logik, Storage & API**

### **1\. Implementiere `backend/app/storage.py`**

* Thread-sicherer Lese- und Schreibzugriff auf `data/data.json`.  
* Automatische Backup-Rotationslogik vor jedem Schreibvorgang: Verschiebung vorhandener Backups von `.bak.4` \-\> `.bak.5`, `.bak.3` \-\> `.bak.4`, ..., `data.json` \-\> `data.json.bak.1`.

### **2\. Implementiere `backend/app/logic.py`**

* **Verzögerungs-Detektiv Engine (`analyze_lag_correlations`):**  
  Calculates mean differences for pain/inflammation scores for tags across offsets \$t+0h\$, \$t+24h\$, \$t+48h\$, \$t+72h\$. Filtering rule: \$n \\ge 3\$ data points minimum.  
* **Zyklus-Kompass Engine (`calculate_cycle_stats`):**  
  Determines current cycle day, projected phase, and historical average scores per cycle day.  
* **Experiment-Evaluator (`evaluate_experiment`):**  
  Compares baseline metric averages (equal duration prior to start) versus active experiment duration averages.  
* **Heatmap Aggregator (`get_annual_heatmap_data`):**  
  Maps daily log dates to severity color buckets (0: none, 1-3: mild, 4-6: moderate, 7-10: severe).

### **3\. Implementiere `backend/app/main.py`**

* FastAPI REST API-Routen: `/api/health`, `/api/logs`, `/api/flares`, `/api/experiments`, `/api/labs`, `/api/ampel`, `/api/analysis/correlations`, `/api/analysis/heatmap`, `/api/export`, `/api/import`.  
* Einbindung des Static Files Server zur Auslieferung des Single-Page Frontend Verzeichnisses `docs/`.

### **4\. Implementiere Zusatz-Skripte**

* `scripts/study_radar.py`: Verbindung zur PubMed E-Utilities API via Multi-Keyword- & Themencluster-Suchpipeline. Nutzt konfigurierbare Themencluster und Suchbegriffe (u. a. Endometriose/Beckenschmerz, chronische/viszerale Entzündungen, Bauchfellentzündung/`peritonitis`/`peritoneal inflammation`/abdominale Entzündungen, sowie Diagnostik-Lücke/`unexplained chronic pelvic pain`/`negative imaging`/`diagnostic delay`/postoperative Beschwerden). Führt gestaffelte Abfragen (`esearch.fcgi` \+ `esummary.fcgi`/`efetch.fcgi`) aus, dedupliziert Ergebnisse sauber anhand der PubMed-ID (`pmid`), speichert pro Studie die passenden Keywords und den Themencluster mit ab und schreibt das Ergebnis in `data/studies.json`.  
* `scripts/appointment_watcher.py`: Modular aufgebautes Skript mit Konfigurations-Interface für lokale Termin-Abfragen.

---

## **Phase 4 – Backend-Tests (`pytest`)**

Schreibe die Testsuite in `tests/` und führe sie aus:

```py
# Minimal auszuführende Testabdeckung
def test_storage_backup_rotation():
    # Prüft die lückenlose Erzeugung von data.json.bak.1 bis .bak.5

def test_lag_correlation_computation():
    # Validiert die deterministische 24h/48h/72h-Erkennung bekannter Testmuster

def test_cycle_phase_calculator():
    # Validiert Phasenberechnung bei irregulären und regulären Zyklen

def test_api_export_import():
    # Testet den vollständigen Runden-Export und -Import via REST API
```

*Vorgabe:* Führe `pytest` aus. Alle Tests müssen ohne Warnungen oder Fehler bestehen.

---

## **Phase 5 – Frontend PWA (ZTA-OS UI-Standard & Client-Side Engine)**

Erstelle die Standalone-Frontend-Dateien im Verzeichnis `docs/`. Das Frontend ist so aufgebaut, dass es **sowohl ohne Backend** (rein über `IndexedDB` auf GitHub Pages) **als auch mit FastAPI-Backend** synchron betrieben werden kann.

### **Clientseitige Dateien**

* `docs/index.html`: Semantische HTML5-Struktur mit Safe-Area-Paddings für iOS (`env(safe-area-inset-top)`), Mobile Top-Bar, Hauptinhalts-Container und fixed Bottom-Tab-Bar mit 5 Buttons.  
* `docs/css/style.css`: Strikte Einhaltung der CSS-Design-Tokens aus Abschnitt 2\.  
* `docs/js/db.js`: Transaktionale IndexedDB-Wrapper-Klasse (`EndoDB`) mit automatischem Fallback auf `localStorage` und Import/Export-Methoden.  
* `docs/js/logic_client.js`: 1:1 Spiegelung der Berechnungs-Logik aus `backend/app/logic.py` in nativem JavaScript (ES6) zur serverlosen Echtzeit-Auswertung im Browser.  
* `docs/js/app.js`: App-Router, State-Management, Tab-Switching, Event-Handling und Synchronisations-Management.  
* `docs/manifest.json` & `docs/sw.js`: Service Worker Konfiguration für Caching aller statischen Assets (Offline-First WebApp).  
* `docs/handbuch.html`: Eingebettetes, layengerechtes Nutzerhandbuch im ZTA-OS Doku-Stil.

### **Details der 5 Tabs im UI**

1. **Tab "Heute":**  
   * Prominenter, roter/orangefarbener **1-Tap Flare-Up Notfall-Button** ganz oben. Löste einen modalen Screen im abgedunkelten High-Contrast-Modus aus.  
   * Daily-Log Formular (30-Sekunden Slider für Schmerz, Entzündung, Energie; Tag-Cloud für Ernährung & Verdauung).  
   * Zyklus-Kompass Card mit visueller Tagesanzeige.  
2. **Tab "Muster":**  
   * Interactive **Jahres-Heatmap** im GitHub-Stil (52 Wochen × 7 Tage Grid), horizontal scrollbar am Handy.  
   * **Verzögerungs-Detektiv Card:** Liste der identifizierten zeitversetzten Trigger mit Angabe der Verzögerung (\$+24h\$, \$+48h\$) und Signifikanz (\$n\$).  
   * **Persönliche Ampel-Liste:** Tabs für Grün, Gelb, Rot inkl. Live-Suchfeld.  
   * **Selbst-Experimente:** Vorher-/Nachher-Vergleichskarten.  
3. **Tab "Tresor":**  
   * Laborwerte-Verlaufsgrafik (Visualisierung via HTML5 Canvas ohne externe schwere Bibliotheken).  
   * Dokumenten- & Befundarchiv.  
   * Offene Fragen für den nächsten Arztbesuch (interaktive Checkliste).  
   * Prominenter Button **"Arzttermin-Dossier (PDF) generieren"**.  
4. **Tab "Radar":**  
   * Liste gefilterter Studien-Updates mit Lesezeichen-Funktion, Filtern nach Themencluster / Suchbegriff sowie Anzeige der passenden Keywords und des Themenbereichs pro Studie.  
   * Suchprofile für den Termin-Agenten.  
5. **Tab "Mehr":**  
   * Dynamic Custom-Field Configurator.  
   * Data Management: `JSON-Export herunterladen`, `JSON-Import hochladen`, `90-Tage Demo-Daten laden`, `Alle Daten löschen`.  
   * PIN-Sperre Setup.  
   * Link zu `handbuch.html`.

---

## **Phase 6 – Druck- & PDF-Optimierung**

Implementiere ein spezialisiertes CSS Media Print Stylesheet in `docs/css/style.css` für die Instant-Dossier-Erzeugung via `window.print()`:s  
@media print {  
/\* Ausblenden aller Navigations- und Interaktions-Elemente \*/  
.bottom-tab-bar,  
.top-bar,  
.btn,  
.no-print {  
display: none \!important;  
}

body {  
background: \#FFFFFF \!important;  
color: \#000000 \!important;  
font-size: 10pt;  
}

.dossier-page {  
page-break-after: always;  
margin: 1cm;  
}

.card {  
border: 1px solid \#CBD5E1 \!important;  
box-shadow: none \!important;  
break-inside: avoid;  
margin-below: 12pt;  
}  
}

````

Das Dossier bündelt automatisch:
* Übersicht Schmerz & Entzündung der letzten 30/90 Tage.
* Relevante Verzögerungs-Korrelationen.
* Aktive/Abgeschlossene Selbst-Experimente.
* Letzte Laborwerte & Auszug der offenen Fragenliste.

---

### Phase 7 – Deployment-Skripte & GitHub-Pages-Vorbereitung

1. **Erstelle `start.ps1` (Windows PowerShell):**
   ```powershell
   # Startet Python Backend und öffnet PWA im Browser
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   python scripts/build_initial_data.py
   uvicorn backend.app.main:app --reload --port 8000
````

2. **Erstelle `start.sh` (Linux/macOS):**

```
#!/usr/bin/env bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 scripts/build_initial_data.py
uvicorn backend.app.main:app --reload --port 8000
```

3. **Erstelle `Dockerfile` & `docker-compose.yml`** für den isolierten Container-Betrieb des FastAPI-Backends.  
4. **GitHub Pages Pre-Publishing:**  
   * Stelle sicher, dass die Datei `docs/.nojekyll` existiert (verhindert das Ignorieren von Unterordnern durch GitHub Pages).  
   * Alle Asset-Pfade in `docs/index.html` müssen relativ aufgelöst sein (`./css/style.css`, `./js/app.js`).

---

## **Phase 8 – QA-Abnahme & 8-Rollen-Review**

Führe vor dem finale Git Commit & Push folgende Rollen-Prüfungen durch:

```
+-----------------------------------------------------------------------------------+
|                            8-ROULLEN QA CHECKLISTE                                |
+-----------------------------------------------------------------------------------+
| [✓] 1. Software Architect  : Dual-Mode Entkopplung (IndexedDB vs Backend REST)   |
| [✓] 2. Frontend Specialist : iOS Safari Safe-Area, Touch-Targets >=44px, PWA Tag  |
| [✓] 3. Data Engineer       : Lag-Korrelation Engine (0/24/48/72h) mathematisch ok|
| [✓] 4. Security & Privacy  : Single-User isolation, local PIN hash, zero tracking|
| [✓] 5. Compliance & Legal  : Strikte Abwesenheit medizinischer Diagnosen/Versprechen|
| [✓] 6. QA Automation Lead  : `pytest` Coverage der backend core business logic    |
| [✓] 7. UX / Accessibility  : ZTA-OS V10.2 Farb-Tokens, High Contrast Flare Mode   |
| [✓] 8. DevOps Engine       : Standardized start.ps1/sh, GH Pages relative paths   |
+-----------------------------------------------------------------------------------+
```

### **Finaler Release-Befehlsablauf für Git**

```
# GitHub Repository Initialisierung und Push
git init
git add .
git commit -m "feat: initial release endo-app v1.0.0 (pwa dual-mode)"
git branch -M main
git remote add origin https://github.com/<username>/endo-app.git
git push -u origin main
```

*Aktivierung GitHub Pages:* In den GitHub Repository-Einstellungen unter **Pages** den Source-Zweig auf `main` und den Ordner auf `/docs` (oder Root) stellen und speichern. Die App ist anschließend unter `https://<username>.github.io/endo-app/` sofort auf allen mobilen Endgeräten einsatzbereit.