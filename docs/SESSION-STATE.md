# Session-State: Endo-App

Letzte Aktualisierung: 2026-11-23
Aktueller Status: Alle Phasen 1 bis 8 abgeschlossen und live auf GitHub Pages veroeffentlicht.

## Live-URLs & Repository
- **GitHub Pages App-URL (PWA):** https://robboddenberg.github.io/endo-app/
- **Nutzerhandbuch (Live):** https://robboddenberg.github.io/endo-app/handbuch.html
- **GitHub Repository:** https://github.com/robboddenberg/endo-app
- **Datenschutz-Status:** `data/` und `secrets/` sind strikt via `.gitignore` ausgeschlossen (`0` persönliche Datendateien im Repository). Alle Eingaben in der Live-PWA bleiben lokal in der `IndexedDB` des jeweiligen Endgeraets.

## Abgeschlossene Phasen (1 bis 8)
- **Phase 1:** Struktur, `.gitignore`, `.env.example`, `requirements.txt`, `pytest.ini`, `README.md`.
- **Phase 2:** 90-Tage Demo-Daten-Generator (`scripts/build_initial_data.py`).
- **Phase 3:** Backend (`backend/app/storage.py`, `backend/app/logic.py`, `backend/app/main.py`) sowie `scripts/study_radar.py` und `scripts/appointment_watcher.py`.
- **Phase 4:** Automatisierte `pytest`-Suite (`tests/test_storage.py`, `tests/test_logic.py`, `tests/test_api.py`).
- **Phase 5:** Mobile-First PWA im ruhigen Beige-Farbsystem (`docs/css/style.css`, `docs/js/logic_client.js`, `docs/js/db.js`, `docs/js/components/charts.js`, `docs/js/app.js`, `docs/index.html`, `docs/handbuch.html`, `docs/manifest.json`, `docs/sw.js`).
- **Phase 6:** `@media print` Arzttermin-Dossier Engine (1-Klick PDF-/Druck-Bericht).
- **Phase 7:** Deployment-Skripte (`start.ps1`, `start.sh`, `Dockerfile`, `docker-compose.yml`, `scripts/build_github_pages.py`, PNG Touch-Icons 180/192/512px, `.nojekyll` und Root-Spiegelung).
- **Phase 8:** 8-Rollen-QA-Abnahme (`9 passed` in `pytest`) und Live-Schaltung auf GitHub Pages.
