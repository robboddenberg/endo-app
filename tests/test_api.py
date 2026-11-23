"""End-to-End API-Tests fuer FastAPI Endpunkte, Export/Import und Konfliktschutz."""
from __future__ import annotations

from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.storage import StorageEngine
from scripts.build_initial_data import generate_initial_data


def _create_isolated_client(tmp_path: Path) -> tuple[TestClient, StorageEngine]:
    data_file = tmp_path / "data.json"
    storage = StorageEngine(data_file)
    app.state.storage = storage
    return TestClient(app), storage


def test_api_export_import(tmp_path: Path) -> None:
    """Testet den vollstaendigen Runden-Export und -Import via REST API inkl. 409-Pruefung."""
    client, storage = _create_isolated_client(tmp_path)
    try:
        # 1. Initialen leeren Export abrufen
        resp_empty = client.get("/api/export")
        assert resp_empty.status_code == 200
        empty_payload = resp_empty.json()
        assert empty_payload["revision"] == 0
        assert empty_payload["daily_logs"] == []

        # 2. 90-Tage Demo-Datensatz ueber /api/import laden
        demo = generate_initial_data(reference_date=date(2026, 11, 23))
        resp_import = client.post("/api/import?if_revision=0", json=demo)
        assert resp_import.status_code == 200
        import_body = resp_import.json()
        assert import_body["status"] == "imported"
        assert import_body["revision"] == 1
        assert import_body["counts"]["daily_logs"] == 90

        # 3. Export erneut abrufen und modifizieren
        resp_export = client.get("/api/export")
        assert resp_export.status_code == 200
        exported = resp_export.json()
        assert len(exported["daily_logs"]) == 90
        assert exported["revision"] == 1

        exported["doctor_questions"].append(
            {
                "id": "q_test_roundtrip",
                "created_date": "2026-11-23",
                "question": "Neue Testfrage nach Export?",
                "is_resolved": False,
            }
        )

        # 4. Falscher if_revision Wert muss 409 Conflict liefern
        resp_conflict = client.post("/api/import?if_revision=99", json=exported)
        assert resp_conflict.status_code == 409

        # 5. Korrekter if_revision Wert importiert und erzeugt Backup .bak.1
        resp_reimport = client.post("/api/import?if_revision=1", json=exported)
        assert resp_reimport.status_code == 200
        assert resp_reimport.json()["revision"] == 2
        assert "data.json.bak.1" in storage.list_backups()

        resp_verify = client.get("/api/export")
        assert resp_verify.status_code == 200
        questions = resp_verify.json()["doctor_questions"]
        assert any(q["id"] == "q_test_roundtrip" for q in questions)
    finally:
        app.state.storage = None


def test_api_crud_and_analysis_routes(tmp_path: Path) -> None:
    """Testet alle wichtigen CRUD- und Analyse-Endpunkte im Verbund."""
    client, _ = _create_isolated_client(tmp_path)
    try:
        demo = generate_initial_data(reference_date=date(2026, 11, 23))
        assert client.post("/api/import", json=demo).status_code == 200

        # Health
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"
        assert health.json()["has_data"] is True

        # Daily Log erstellen & wieder abrufen
        log_resp = client.post(
            "/api/logs",
            json={
                "date": "2026-11-24",
                "cycle_day": 7,
                "pain_score": 2,
                "inflammation_score": 2,
                "energy_score": 8,
                "nutrition_tags": ["hafer"],
                "activity_type": "Yoga",
            },
        )
        assert log_resp.status_code == 200
        created_log = log_resp.json()["item"]
        assert created_log["cycle_phase"] == "follicular"
        assert client.get("/api/logs").status_code == 200

        # Flare-Up erstellen & loeschen
        flare_resp = client.post(
            "/api/flares",
            json={
                "start_timestamp": "2026-11-24T08:00:00Z",
                "initial_pain_score": 7,
                "peak_pain_score": 8,
                "body_locations": ["Unterleib"],
                "applied_measures": ["Waermflasche"],
            },
        )
        assert flare_resp.status_code == 200
        flare_id = flare_resp.json()["item"]["id"]
        assert client.get("/api/flares").status_code == 200
        assert client.delete(f"/api/flares/{flare_id}").status_code == 200

        # Experimente, Labor, Ampel, Befunde, Fragen, Studien, Termine, Settings
        assert client.get("/api/experiments").status_code == 200
        assert client.get("/api/labs").status_code == 200
        assert client.get("/api/ampel").status_code == 200
        assert client.get("/api/medical-notes").status_code == 200
        assert client.get("/api/questions").status_code == 200
        assert client.get("/api/appointments").status_code == 200
        assert client.get("/api/settings").status_code == 200

        # Lesezeichen auf Studie umschalten
        study_id = demo["studies"][0]["id"]
        prev_bm = demo["studies"][0]["is_bookmarked"]
        bm_resp = client.post(f"/api/studies/{study_id}/bookmark")
        assert bm_resp.status_code == 200
        assert bm_resp.json()["item"]["is_bookmarked"] is (not prev_bm)

        # Analyse-Endpunkte
        corr_resp = client.get("/api/analysis/correlations")
        assert corr_resp.status_code == 200
        corr_data = corr_resp.json()
        assert len(corr_data["correlations"]) >= 2
        assert "cycle_stats" in corr_data

        heat_resp = client.get("/api/analysis/heatmap")
        assert heat_resp.status_code == 200
        assert len(heat_resp.json()["heatmap"]) >= 90

        cycle_resp = client.get("/api/analysis/cycle")
        assert cycle_resp.status_code == 200
        assert cycle_resp.json()["current_cycle_day"] == 7
    finally:
        app.state.storage = None


def test_pwa_frontend_and_8_role_compliance(tmp_path: Path) -> None:
    """Prueft Phase 5 bis 8: PWA Static Serving, Beige-Palette, Print-CSS, DevOps & Compliance."""
    client, _ = _create_isolated_client(tmp_path)
    try:
        root_dir = Path(__file__).resolve().parent.parent
        docs_dir = root_dir / "docs"

        # 1. Static Serving von index.html und handbuch.html ueber FastAPI
        index_resp = client.get("/")
        assert index_resp.status_code == 200
        assert "Endo-App" in index_resp.text
        assert "./css/style.css" in index_resp.text
        assert "./js/app.js" in index_resp.text
        assert "kein Medizinprodukt" in index_resp.text

        hb_resp = client.get("/handbuch.html")
        assert hb_resp.status_code == 200
        assert "Hilfe zur Selbsthilfe" in hb_resp.text

        # 2. Pflichtdateien fuer PWA, Print-Dossier und DevOps (Phase 5 bis 7)
        required_files = [
            docs_dir / ".nojekyll",
            docs_dir / "index.html",
            docs_dir / "handbuch.html",
            docs_dir / "manifest.json",
            docs_dir / "icon.svg",
            docs_dir / "sw.js",
            docs_dir / "css" / "style.css",
            docs_dir / "js" / "db.js",
            docs_dir / "js" / "logic_client.js",
            docs_dir / "js" / "components" / "charts.js",
            docs_dir / "js" / "app.js",
            root_dir / "start.ps1",
            root_dir / "start.sh",
            root_dir / "Dockerfile",
            root_dir / "docker-compose.yml",
        ]
        for file_path in required_files:
            assert file_path.exists(), f"Pflichtdatei fehlt: {file_path}"

        # 3. Beige-Farbsystem, High-Contrast Flare-Mode und @media print in style.css
        css_text = (docs_dir / "css" / "style.css").read_text(encoding="utf-8")
        assert "--bg-app: #F5F1E8" in css_text
        assert "@media print" in css_text
        assert ".flare-high-contrast" in css_text
        assert "min-height: 44px" in css_text

        # 4. Sprach-Compliance: Keine Gedankenstriche in selbst erstellten Textdateien
        binary_exts = {".png", ".ico", ".jpg", ".jpeg", ".webp", ".woff", ".woff2"}
        for path in root_dir.rglob("*"):
            if (
                path.is_file()
                and path.suffix.lower() not in binary_exts
                and "__pycache__" not in path.parts
                and ".pytest_cache" not in path.parts
                and ".git" not in path.parts
                and not path.name.startswith(("00_", "01_"))
            ):
                content = path.read_text(encoding="utf-8")
                assert "\u2013" not in content, f"En-Dash gefunden in {path}"
                assert "\u2014" not in content, f"Em-Dash gefunden in {path}"
    finally:
        app.state.storage = None

