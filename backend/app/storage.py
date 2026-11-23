"""Thread-sichere JSON-Persistenz mit Backup-Rotation (.bak.1 bis .bak.5) und Revisionsschutz."""
from __future__ import annotations

import copy
import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_BACKUPS = 5

DEFAULT_TOPIC_CLUSTERS = [
    "endometriosis",
    "inflammation",
    "peritoneal_abdominal",
    "diagnostic_gap",
]

LIST_COLLECTIONS = (
    "daily_logs",
    "flare_ups",
    "self_experiments",
    "ampel_items",
    "lab_entries",
    "medical_notes",
    "doctor_questions",
    "studies",
    "appointment_profiles",
)


def utc_now_iso() -> str:
    """Gibt den aktuellen UTC-Zeitstempel als ISO-8601 String mit Z-Suffix zurueck."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class StorageCorruptedError(Exception):
    """Wird ausgeloest, wenn data.json beschaedigt, leer oder ungueltig ist."""

    def __init__(self, message: str, latest_backup: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.latest_backup = latest_backup


class RevisionConflictError(Exception):
    """Wird ausgeloest, wenn if_revision nicht zur gespeicherten Revision passt (HTTP 409)."""

    def __init__(self, expected_revision: int, current_revision: int):
        super().__init__(
            f"Revisionskonflikt: Client sendete Revision {expected_revision}, "
            f"aktuell gespeichert ist Revision {current_revision}."
        )
        self.expected_revision = expected_revision
        self.current_revision = current_revision


class StorageEngine:
    """Thread-sichere, atomare JSON-Storage-Engine fuer die Single-User Endo-App."""

    def __init__(self, data_path: Optional[Path | str] = None):
        raw_path = data_path or os.environ.get("DATA_FILE", "data/data.json")
        self.data_path = Path(raw_path).resolve()
        self.data_dir = self.data_path.parent
        self._lock = threading.RLock()

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def default_state() -> Dict[str, Any]:
        """Liefert eine valide leere Grundstruktur gemaess Endo-App Datenmodell."""
        return {
            "version": "1.0.0",
            "revision": 0,
            "last_updated": utc_now_iso(),
            "settings": {
                "pin_hash": None,
                "pin_enabled": False,
                "cycle_average_length": 28,
                "theme_mode": "light",
                "custom_fields": [],
                "study_radar": {
                    "topic_clusters": list(DEFAULT_TOPIC_CLUSTERS),
                    "custom_queries": [],
                },
            },
            "daily_logs": [],
            "flare_ups": [],
            "self_experiments": [],
            "ampel_items": [],
            "lab_entries": [],
            "medical_notes": [],
            "doctor_questions": [],
            "studies": [],
            "appointment_profiles": [],
        }

    @classmethod
    def normalize_state(cls, raw_data: Any) -> Dict[str, Any]:
        """Prueft die Grundstruktur eines geladenen Datensatzes und ergaenzt fehlende Felder."""
        if not isinstance(raw_data, dict):
            raise ValueError("Datensatz muss ein JSON-Objekt sein.")

        base = cls.default_state()
        normalized = copy.deepcopy(base)

        normalized["version"] = str(raw_data.get("version") or "1.0.0")
        raw_revision = raw_data.get("revision", 0)
        try:
            normalized["revision"] = int(raw_revision)
        except (TypeError, ValueError) as exc:
            raise ValueError("Ungueltiges Revisionsfeld.") from exc

        normalized["last_updated"] = str(raw_data.get("last_updated") or utc_now_iso())

        raw_settings = raw_data.get("settings")
        if raw_settings is not None:
            if not isinstance(raw_settings, dict):
                raise ValueError("settings muss ein Objekt sein.")
            merged_settings = copy.deepcopy(base["settings"])
            for key, value in raw_settings.items():
                if key == "study_radar" and isinstance(value, dict):
                    merged_radar = copy.deepcopy(base["settings"]["study_radar"])
                    merged_radar.update(value)
                    merged_settings["study_radar"] = merged_radar
                else:
                    merged_settings[key] = copy.deepcopy(value)
            normalized["settings"] = merged_settings

        for col in LIST_COLLECTIONS:
            if col in raw_data and raw_data[col] is not None:
                if not isinstance(raw_data[col], list):
                    raise ValueError(f"Feld '{col}' muss eine Liste sein.")
                normalized[col] = copy.deepcopy(raw_data[col])

        return normalized

    def find_latest_backup(self) -> Optional[str]:
        for idx in range(1, MAX_BACKUPS + 1):
            bak = self.data_path.with_name(f"{self.data_path.name}.bak.{idx}")
            if bak.exists():
                return bak.name
        return None

    def list_backups(self) -> List[str]:
        """Gibt alle vorhandenen Backups (.bak.1 bis .bak.5) geordnet zurueck."""
        backups: List[str] = []
        for idx in range(1, MAX_BACKUPS + 1):
            bak = self.data_path.with_name(f"{self.data_path.name}.bak.{idx}")
            if bak.exists():
                backups.append(bak.name)
        return backups

    def _rotate_backups(self) -> None:
        """Rotiert bestehende Backups (.bak.4 -> .bak.5, ..., data.json -> .bak.1)."""
        if not self.data_path.exists():
            return
        # Vor der Rotation sicherstellen, dass die aktuelle Datei lesbar ist
        _ = self.load()
        for idx in range(MAX_BACKUPS - 1, 0, -1):
            src = self.data_path.with_name(f"{self.data_path.name}.bak.{idx}")
            dst = self.data_path.with_name(f"{self.data_path.name}.bak.{idx + 1}")
            if src.exists():
                os.replace(src, dst)
        bak1 = self.data_path.with_name(f"{self.data_path.name}.bak.1")
        shutil.copy2(self.data_path, bak1)

    def _atomic_write(self, state: Dict[str, Any]) -> None:
        self.ensure_dirs()
        tmp_name = f"{self.data_path.name}.tmp.{os.getpid()}.{uuid.uuid4().hex[:8]}"
        tmp_path = self.data_dir / tmp_name
        payload = json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8")

        try:
            with open(tmp_path, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, self.data_path)
        finally:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def load(self) -> Dict[str, Any]:
        """Laedt den aktuellen Datensatz oder liefert bei fehlender Datei einen leeren Standardzustand."""
        with self._lock:
            if not self.data_path.exists():
                return self.default_state()
            try:
                raw_bytes = self.data_path.read_bytes()
                if not raw_bytes.strip():
                    raise ValueError("Datendatei ist leer.")
                parsed = json.loads(raw_bytes.decode("utf-8"))
                return self.normalize_state(parsed)
            except Exception as exc:
                latest = self.find_latest_backup()
                hint = (
                    f"Letztes verfuegbares Backup: {latest}."
                    if latest
                    else "Kein Backup im Datenordner vorhanden."
                )
                raise StorageCorruptedError(
                    f"Die Datendatei '{self.data_path.name}' ist beschaedigt oder unlesbar. {hint}",
                    latest_backup=latest,
                ) from exc

    def save(self, data: Dict[str, Any], if_revision: Optional[int] = None) -> Dict[str, Any]:
        """Speichert den Datensatz atomar mit Backup-Rotation und optionalem Revisionsschutz."""
        with self._lock:
            if self.data_path.exists():
                current = self.load()
                current_rev = int(current.get("revision", 0))
            else:
                current_rev = 0

            if if_revision is not None and int(if_revision) != current_rev:
                raise RevisionConflictError(int(if_revision), current_rev)

            next_state = self.normalize_state(data)
            next_state["revision"] = current_rev + 1
            next_state["last_updated"] = utc_now_iso()

            if self.data_path.exists():
                self._rotate_backups()

            self._atomic_write(next_state)
            return next_state
