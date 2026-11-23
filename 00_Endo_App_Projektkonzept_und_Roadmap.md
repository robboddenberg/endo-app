# **Endo-App – Projektkonzept & Roadmap**

**Stand:** 23\. November 2026  \|  Status: Konzept & MVP-Planung  \|  Standard: 00-app-standard (Mobile-First PWA, Apple HIG)  
---

# **1\. Projektvision & Zielsetzung**

Entwicklung einer persönlichen Selbsthilfe- und Tracking-Plattform für Menschen mit Endometriose und chronischen Entzündungsprozessen. Die App ersetzt ausdrücklich keinen Arztbesuch und gibt keine medizinischen Heilversprechen ab, sondern schließt die Alltagslücke durch strukturierte Selbstbeobachtung, gebündelte Informationen und alltagstaugliche Werkzeuge („Hilfe zur Selbsthilfe"). Der Fokus liegt dabei strikt auf der Nutzung als Single-User-Konzept und Prototyp: Multi-User-Funktionen, Datenschutzkomplexität und medizinische Zertifizierungen entfallen vorerst vollständig, um den maximalen Nutzen für den persönlichen Alltag zu erreichen.

* **Startpunkt:** Strikter Single-User-Fokus für Konzept & Prototyp. Es wird vorerst bewusst komplett ausgeklammert, dass andere Menschen die App nutzen oder sehen. Ziel ist es, das absolute Maximum für den persönlichen Alltag herauszuholen – das eliminiert gleichzeitig Multi-User-Datenschutz-, MDR- und Community-Komplexität.  
* **Unverbindliche Option (Parkplatz):** Mögliche spätere Öffnung als skalierbare Plattform oder Community für andere Betroffene bleibt als Option im Hinterkopf, ist für die aktuelle Entwicklung jedoch nicht relevant.

---

# **2\. Gesammelte Anforderungen & Funktions-Ideen (Roh-Backlog)**

## **1\. Individualisiertes Alltags- & Symptom-Tracking**

* Erfassung von Zyklusphase, Ernährung, Sport/Bewegung, Schmerzlevel, Stuhl/Verdauung sowie individuellem Befinden („Wie fühle ich mich nach X?").  
* Anpassbare und eigene Tracking-Felder, damit jede Nutzerin ausschließlich die für sie relevanten Parameter dokumentiert.

## **2\. Persönliche Muster-Auswertung & Impulse**

* Zusammenführung der eigenen Eingaben zur Visualisierung von Korrelationen (z. B. Zusammenhänge zwischen bestimmten Lebensmitteln, Sportarten, Zyklusphasen und Schmerzintensität).  
* Neutrale, auf die Daten und die aktuelle Zyklusphase zugeschnittene Tagesimpulse.

## **3\. Automatisierter Studien-Radar**

* **Multi-Keyword- & Themen-Abdeckung:** Parallele/kombinierte Suchqueries über verschiedene Themencluster statt nur „Endometriose“, u. a.:  
  * Endometriose & Zyklus-/Hormonbezug (`endometriosis`, `deep infiltrating endometriosis`, `pelvic pain`, `luteal phase`)  
  * Entzündungen & Immun-/Darm-/Muskel-Faktoren (`chronic inflammation`, `neuroinflammation`, `visceral hypersensitivity`, `mast cell`, `gut microbiome`)  
  * Bauchfell & akute/wiederkehrende abdominale Entzündungen (`peritonitis`, `peritoneal inflammation`, `abdominal pain`, `pelvic congestion`)  
  * Diagnostik-Lücke & unklare Befunde (`unexplained chronic pelvic pain`, `negative imaging`, `diagnostic delay`, `postoperative pain`)  
* **Deduplizierung, Relevanz-Scoring & Quellen-Transparenz:** Treffer über mehere Suchbegriffe hinweg automatisch per PMID/DOI deduplizieren, mit Treffer-Keyword/Themen-Tag versehen, als neutrale, leicht verständliche Zusammenfassung aufbereiten und stets mit direktem Link zur Originalquelle (z. B. PubMed) ausgeben.  
* **Konfigurierbarkeit:** Suchbegriffe und Themen-Cluster sollen in der Konfiguration (`data/study_radar_config.json` bzw. `scripts/study_radar.py`) leicht erweiterbar sein.

## **4\. Termin-Agent (Umkreissuche)**

* Unterstützende Suche und Benachrichtigungsfunktion für relevante Versorgungsangebote in der Nähe (z. B. Lymphdrainage, Spezial-Check-ups, Facharzttermine).

## **5\. Community & Zyklus-Classes (Perspektivisch)**

* Austausch-Plattform für Betroffene.  
* Zyklusangepasste Inhalte und Kursangebote (z. B. gezielte Bewegungseinheiten abgestimmt auf die Lutealphase).

## **2.5 Bestätigte Single-User Power-Features (gesetzt)**

* **1-Klick Arzttermin-Dossier (PDF-Export):** Nüchterne 1–2-Seiten-Zusammenfassung der letzten 30/90 Tage (Schmerzverlauf nach Zyklustag, Symptome, Maßnahmen, Korrelationen) zur optimalen Vorbereitung auf Facharzt- oder Kliniktermine.  
* **Schub- / Flare-Up-Modus (1-Tap Notfall-UI):** Extrem reduzierte Oberfläche für akute Schmerz-/Entzündungstage mit großen Buttons (Start, Stärke, Ort, Akut-Maßnahme) plus persönlicher „Was mir sonst hilft“-Checkliste.  
* **Verzögerungs-Detektiv (24–72h Lag-Korrelation):** Prüft nicht nur tagesgleiche Zusammenhänge, sondern erkennt zeitversetzte Entzündungs-/Schmerzreaktionen 12–72 Stunden nach bestimmten Lebensmitteln, Sportarten oder Stress.  
* **Selbst-Experiment-Tracker (Vorher/Nachher-Vergleich):** Markiert gezielte Tests (z. B. 3 Wochen ohne Gluten, neues Supplement, Lymphdrainage-Serie) auf der Zeitachse und vergleicht die durchschnittliche Symptomlast vorher vs. währenddessen.  
* **Privater Befund- & Laborwerte-Tresor:** Zentrale Ablage für Arztbriefe, Blutwerte-Verläufe (z. B. CRP, Ferritin, Vitamin D, Hormone), optionale Foto-Timeline (z. B. Schwellungen/Endo-Belly) und Notizliste mit Fragen für den nächsten Arzttermin.  
* **Persönlich kalibrierter Zyklus-Kompass:** Lernt aus ihren eigenen vergangenen Zyklen statt aus generischen Texten und zeigt pro Zyklustag eine dezente Energie-/Trainings-Prognose (z. B. wann intensiver Sport vs. Regeneration erfahrungsgemäß gut tut).  
* **Persönliche Ampel-Liste (Grün / Gelb / Rot):** Dynamisch wachsende Übersicht über Lebensmittel, Aktivitäten und Routinen – was fast immer gut vertragen wird (Grün), was zyklusabhängig ist (Gelb) und was häufig triggert (Rot).  
* **Jahres-Heatmap (Langzeit-Verlauf):** Kompakte visuelle Jahresübersicht (wie ein GitHub-Graph), bei der jeder Tag nach Symptom-/Entzündungslevel eingefärbt ist – macht saisonale Muster, Stressphasen und echte Langzeit-Fortschritte auf einen Blick sichtbar.

## **2.6 Zurückgestellte Ideen (Parkplatz / Optional)**

* **Schmerz- & Körperkarte (Body-Map):** Visuelle Silhouette, auf der sie mit einem Tippen markiert, wo der Schmerz/die Entzündung sitzt (z. B. Unterbauch, Rücken, Beine, Gelenke, Kopf) plus Schmerzart (ziehend, stechend, brennend, Druck). Erzeugt über die Zeit eine Heatmap für Muster und Arztgespräche.  
* **Wirkungs-Check für Akut-Helfer & Supplements:** Protokolliert nicht nur, was sie nimmt oder tut (Medikamente, Supplements, Wärmflasche, Tee, Dehnen, Lymphdrainage), sondern fragt optional nach 60–90 Minuten per 1-Tap nach, wie gut es geholfen hat (gar nicht / etwas / stark) – zeigt objektiv, was wirklich wirkt.  
* **Energie- & Pacing-Budget (Crash-Prävention):** Morgendlicher 1-Tap-Energie-Check (z. B. 1–10). Zeigt auf Basis ihrer eigenen Historie, wie viel Belastung (Arbeit, Sport, Termine) an Tagen mit diesem Level gut ging, ohne am Folgetag einen Entzündungs- oder Erschöpfungs-Crash zu riskieren.  
* **Wohlfühl-Rezepte & „Schub-Küche“ (gekoppelt an die Ampel-Liste):** Persönlicher Mini-Tresor für eigene, gut verträgliche Gerichte, getaggt nach Aufwand (z. B. „5-Minuten-Schub-Essen“ vs. „Normal“) und Zyklusphase, verknüpft mit ihrer grünen Ampel-Liste für entscheidungsfreie Tage.

---

# **3\. Phasen-Roadmap (Vom schlanken MVP zur Plattform)**

Um Verzettelung zu vermeiden, wird die Entwicklung strikt modular in drei aufeinander aufbauenden Ausbaustufen umgesetzt:

| Phase | Fokus | Kernelemente & Deliverables |
| :---- | :---- | :---- |
| **Phase 1: MVP** | Tägliches Tracking & erster Aha-Moment | • Mobile-First PWA im ruhigen Apple-HIG-Design (iOS-Safari-optimiert)• 30-Sekunden-Daily-Log für Top-5-Felder (Zyklus, Ernährung, Sport, Schmerz, Stuhl/Befinden)• Einfache, verständliche Verlaufs- und Musteransicht• Datenschutz-First (lokale Speicherung / eigener Speicher mit Export) |
| **Phase 2: KI & Automation** | Automatisierung & erweiterter Nutzen | • Backend-Job für automatisierten Studien-Radar (wöchentliches Briefing inkl. Quellenlinks)• Prototyp eines Termin-Agents / Benachrichtigungs-Bots für lokale Versorgungsangebote |
| **Parkplatz / Optional (bewusst zurückgestellt)** | Öffnung für weitere Nutzerinnen / Community / Classes – erst relevant, falls irgendwann gewünscht | • Spätere Validierung & Öffnung für Betroffene (optional)• Community-Funktionen & zyklusangepasste Classes erst bei gezieltem Ausbauwunsch |

---

# **4\. Rechtliche Leitplanken & Datenschutz (MDR & DSGVO)**

* **Strikt keine Medizinprodukt-Claims (EU-MDR):** Kein Versprechen von Heilung, Linderung oder Diagnose. Wording konsequent auf Selbstbeobachtung, Dokumentation, allgemeine Wissensvermittlung und neutrale Impulse beschränken – keine automatisierten medizinischen Handlungsanweisungen aus Symptomen ableiten.  
* **Sensible Gesundheitsdaten (Art. 9 DSGVO):** Von Beginn an Privacy-by-Design berücksichtigen. Start mit lokaler und datensparsamer Speicherung; strikte Trennung von Nutzerdaten vor einem möglichen Multi-User- oder Community-Ausbau.

---

# **5\. Technischer Ansatz & Entwicklung (Antigravity)**

## **Architektur**

Orientierung am `00-app-standard` (saubere Trennung von Backend-Logik, Datenhaltung und Mobile-First-PWA-Frontend).

* **UI/UX-Referenz:** Orientierung an den finalen UI-Standards von ZTA-OS (Apple HIG, clean, minimalistisch, mobile-first iOS-Safari PWA, ruhige Farbhierarchie, große Touch-Targets, Tabular Numerals).  
* **Deployment & Sync:** Entwicklung im Google-Drive-Ordner `Endo`, Veröffentlichung als eigenes GitHub-Repository (inkl. GitHub Pages PWA).  
* **Steuerungsdatei:** `PROMPT-ANTIGRAVITY.md` im selben Ordner als vollständige Bauanleitung und Schritt-für-Schritt-Abfolgeliste für Antigravity.

## **Modell-Strategie (LLM / Tooling)**

| Entwicklungsbereich | Eingesetztes Modell | Anwendungszweck |
| :---- | :---- | :---- |
| **Architektur & Core** | Orchestrator (Argon) / Claude Opus 5.5 (High) | Grundarchitektur, Datenmodellierung & System-Design |
| **Implementierung** | Claude Sonnet 5.5 (Medium) / Gemini 4 Argon (Medium) | Laufende Entwicklung von Backend, Tests und PWA-Frontend |
| **UI & Content** | Gemini 3.8 Flash | Schnelle UI-Iterationen, Micro-Copy & Textanpassungen |

---

# **6\. Nächste konkrete Schritte**

1. **Top-5-Felder definieren:** Gemeinsam festlegen, welche 5 Eingaben im Alltag wirklich täglich und ohne Reibung getippt werden.  
2. **Datenmodell & MVP-Spezifikation:** Schema für Einträge, Zyklusphasen und benutzerdefinierte Tags festzurren.  
3. **Klickbarer Prototyp:** Erste lauffähige PWA-Version fürs iPhone aufsetzen und im Alltag testen.

