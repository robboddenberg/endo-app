"""Modulares Termin-Agent Skript mit Konfigurations-Interface fuer lokale Suchprofile."""
from __future__ import annotations

import argparse
import json
import sys
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.storage import StorageEngine


class BaseAppointmentProvider(ABC):
    """Abstrakte Schnittstelle fuer lokale Termin-Suchprovider."""

    provider_name: str = "base"

    @abstractmethod
    def check_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """Prueft ein Suchprofil und liefert einen standardisierten Statusbericht."""


class DirectBookingLinkProvider(BaseAppointmentProvider):
    """Standard-Provider: Validiert Buchungs-URLs und bereitet direkte Prueflinks auf."""

    provider_name = "direct_booking_link"

    def __init__(self, timeout: float = 5.0, verify_http: bool = False):
        self.timeout = timeout
        self.verify_http = verify_http

    def check_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        booking_url = str(profile.get("booking_url") or "").strip()
        parsed = urlparse(booking_url) if booking_url else None
        is_valid_url = bool(parsed and parsed.scheme in ("http", "https") and parsed.netloc)

        reachable: Optional[bool] = None
        http_status: Optional[int] = None
        note = "Direktlink bereit fuer manuelle Terminpruefung im Browser."

        if not is_valid_url:
            note = "Keine gueltige Buchungs-URL im Suchprofil hinterlegt."
        elif self.verify_http:
            try:
                resp = requests.head(booking_url, timeout=self.timeout, allow_redirects=True)
                http_status = resp.status_code
                reachable = resp.status_code < 400
                note = (
                    f"Buchungsseite erreichbar (HTTP {resp.status_code})."
                    if reachable
                    else f"Buchungsseite meldete HTTP {resp.status_code}."
                )
            except requests.RequestException as exc:
                reachable = False
                note = f"Verbindungspruefung nicht moeglich: {exc}"

        return {
            "profile_id": profile.get("id"),
            "service_name": profile.get("service_name", ""),
            "zip_code": profile.get("zip_code", ""),
            "radius_km": profile.get("radius_km", 15),
            "booking_url": booking_url,
            "active": bool(profile.get("active", True)),
            "provider": self.provider_name,
            "is_valid_url": is_valid_url,
            "reachable": reachable,
            "http_status": http_status,
            "checked_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "note": note,
        }


def run_appointment_watcher(
    data_path: Optional[Path] = None,
    provider: Optional[BaseAppointmentProvider] = None,
    only_active: bool = True,
) -> List[Dict[str, Any]]:
    """Liest Termin-Suchprofile aus data.json und fuehrt den konfigurierten Provider aus."""
    storage = StorageEngine(data_path or (ROOT_DIR / "data" / "data.json"))
    state = storage.load()
    profiles = state.get("appointment_profiles", [])
    active_provider = provider or DirectBookingLinkProvider(verify_http=False)

    results: List[Dict[str, Any]] = []
    for profile in profiles:
        if only_active and not profile.get("active", True):
            continue
        results.append(active_provider.check_profile(profile))
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Prueft hinterlegte Termin-Suchprofile der Endo-App.")
    parser.add_argument("--data-file", type=Path, default=None, help="Pfad zur data.json")
    parser.add_argument("--verify-http", action="store_true", help="Fuehrt optionalen HTTP-HEAD Check aus")
    parser.add_argument("--include-inactive", action="store_true", help="Auch inaktive Profile einschliessen")
    args = parser.parse_args()

    provider = DirectBookingLinkProvider(verify_http=args.verify_http)
    report = run_appointment_watcher(
        data_path=args.data_file,
        provider=provider,
        only_active=not args.include_inactive,
    )
    print(json.dumps({"profiles_checked": len(report), "results": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
