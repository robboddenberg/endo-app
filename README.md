# Endo-App

Persoenlicher Selbsthilfe- und Tracking-Begleiter fuer Menschen mit Endometriose und chronischen Entzuendungsprozessen.

> **Wichtiger Hinweis (Hilfe zur Selbsthilfe / Kein Medizinprodukt):**
> Diese Anwendung dient ausschliesslich der persoenlichen Dokumentation und Selbstbeobachtung. Sie stellt keine medizinischen Diagnosen, gibt keine Heilversprechen ab und ersetzt keinen Arztbesuch. Alle Hinweise und Auswertungen sind rein beschreibend und korrelativ formuliert.

## Architektur im Dual-Mode

1. **Modus A (Standalone Mobile-First PWA):** Auslieferung ueber GitHub Pages (`docs/`) mit lokaler Speicherung in `IndexedDB` (inklusive Fallback auf `localStorage`) und direktem JSON-Export/Import.
2. **Modus B (Hybrides FastAPI Backend):** Lokaler Python-Server (`backend/app/main.py`) mit atomarer JSON-Persistenz (`data/data.json`), Backup-Rotation (`.bak.1` bis `.bak.5`), Revisionspruefung (`409 Conflict`) und Auswertungs-Engine (`backend/app/logic.py`).

## Quickstart

### Lokales Python/FastAPI Backend (3 Zeilen)

```powershell
pip install -r requirements.txt
python scripts/build_initial_data.py
uvicorn backend.app.main:app --reload --port 8000
```

### Deployment auf GitHub Pages

1. Repository auf GitHub als privates Projekt anlegen und `docs/` als Pages-Quelle (`main` Branch, Ordner `/docs`) aktivieren.
2. Sicherstellen, dass `docs/.nojekyll` vorhanden ist und alle Asset-Pfade relativ aufgeloest werden.
3. App ueber die bereitgestellte HTTPS-URL im mobilen Browser (z. B. iOS Safari: "Zum Home-Bildschirm") oeffnen.

## Projektstruktur

- `backend/app/`: FastAPI-Anwendung (`main.py`, `storage.py`, `logic.py`)
- `scripts/`: Demo-Daten-Generator (`build_initial_data.py`), PubMed Studien-Radar (`study_radar.py`), Termin-Agent (`appointment_watcher.py`)
- `docs/`: Standalone PWA Frontend sowie Projektdokumentation (`SESSION-STATE.md`)
- `data/`: Lokales Datenverzeichnis (strikt von Git ausgeschlossen)
- `tests/`: Automatisierte Backend-Testsuite (`pytest`)
