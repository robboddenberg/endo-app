"""Tests fuer die atomare StorageEngine, Backup-Rotation und Revisionspruefung."""
from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.storage import (
    RevisionConflictError,
    StorageCorruptedError,
    StorageEngine,
)


def test_storage_backup_rotation(tmp_path: Path) -> None:
    """Prueft die lueckenlose Erzeugung von data.json.bak.1 bis .bak.5 und Rollover."""
    data_file = tmp_path / "data.json"
    engine = StorageEngine(data_file)

    # 6 Schreibvorgaenge erzeugen Revision 1 bis 6 -> Backups .bak.1 (Rev 5) .. .bak.5 (Rev 1)
    for step in range(1, 7):
        state = engine.default_state()
        state["daily_logs"] = [{"id": f"log_step_{step}", "date": f"2026-10-{step:02d}"}]
        saved = engine.save(state)
        assert saved["revision"] == step

    backups = engine.list_backups()
    assert backups == [
        "data.json.bak.1",
        "data.json.bak.2",
        "data.json.bak.3",
        "data.json.bak.4",
        "data.json.bak.5",
    ]

    for idx in range(1, 6):
        bak_path = tmp_path / f"data.json.bak.{idx}"
        assert bak_path.exists()
        bak_engine = StorageEngine(bak_path)
        bak_state = bak_engine.load()
        assert bak_state["revision"] == 6 - idx

    # 7. Schreibvorgang rotiert weiter, sodass .bak.5 nun Revision 2 enthaelt
    next_state = engine.load()
    next_state["daily_logs"].append({"id": "log_step_7", "date": "2026-10-07"})
    saved_7 = engine.save(next_state, if_revision=6)
    assert saved_7["revision"] == 7

    assert StorageEngine(tmp_path / "data.json.bak.1").load()["revision"] == 6
    assert StorageEngine(tmp_path / "data.json.bak.5").load()["revision"] == 2


def test_storage_revision_conflict(tmp_path: Path) -> None:
    """Prueft den Schutz vor ueberschreibenden Konflikten via if_revision."""
    data_file = tmp_path / "data.json"
    engine = StorageEngine(data_file)

    initial = engine.default_state()
    saved = engine.save(initial)
    assert saved["revision"] == 1

    with pytest.raises(RevisionConflictError) as exc_info:
        engine.save(saved, if_revision=999)

    assert exc_info.value.expected_revision == 999
    assert exc_info.value.current_revision == 1


def test_storage_corrupted_file_protection(tmp_path: Path) -> None:
    """Prueft, dass beschaedigte oder leere Datendateien StorageCorruptedError ausloesen."""
    data_file = tmp_path / "data.json"
    engine = StorageEngine(data_file)

    # Zuerst gueltige Versionen schreiben, damit ein Backup existiert
    s1 = engine.save(engine.default_state())
    engine.save(s1)
    assert (tmp_path / "data.json.bak.1").exists()

    # Beschaedigte JSON-Datei simulieren
    data_file.write_text("{ kaputtes json", encoding="utf-8")
    with pytest.raises(StorageCorruptedError) as exc_info:
        engine.load()
    assert exc_info.value.latest_backup == "data.json.bak.1"

    # Leere Datei simulieren
    data_file.write_text("   ", encoding="utf-8")
    with pytest.raises(StorageCorruptedError):
        engine.load()
