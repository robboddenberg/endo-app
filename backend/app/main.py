"""FastAPI REST-API und Static-File-Auslieferung fuer die Endo-App."""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .logic import (
    analyze_lag_correlations,
    calculate_cycle_stats,
    determine_cycle_phase,
    evaluate_experiment,
    get_annual_heatmap_data,
)
from .storage import RevisionConflictError, StorageCorruptedError, StorageEngine

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DOCS_DIR = ROOT_DIR / "docs"

app = FastAPI(
    title="Endo-App API",
    description="Single-User Selbsthilfe- und Tracking-API (kein Medizinprodukt).",
    version="1.0.0",
)


def get_storage(request: Optional[Request] = None) -> StorageEngine:
    """Liefert die konfigurierte StorageEngine (Test-Override oder DATA_FILE Env)."""
    if request is not None:
        state_storage = getattr(request.app.state, "storage", None)
        if state_storage is not None:
            return state_storage
    state_storage = getattr(app.state, "storage", None)
    if state_storage is not None:
        return state_storage
    return StorageEngine(os.environ.get("DATA_FILE", str(ROOT_DIR / "data" / "data.json")))


@app.exception_handler(RevisionConflictError)
async def revision_conflict_handler(_: Request, exc: RevisionConflictError) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "detail": str(exc),
            "expected_revision": exc.expected_revision,
            "current_revision": exc.current_revision,
        },
    )


@app.exception_handler(StorageCorruptedError)
async def storage_corrupted_handler(_: Request, exc: StorageCorruptedError) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "detail": exc.message,
            "latest_backup": exc.latest_backup,
        },
    )


class DailyLogPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    date: str
    cycle_day: int = Field(default=1, ge=1, le=60)
    cycle_phase: Optional[str] = None
    pain_score: int = Field(default=0, ge=0, le=10)
    inflammation_score: int = Field(default=0, ge=0, le=10)
    energy_score: int = Field(default=5, ge=0, le=10)
    nutrition_tags: List[str] = Field(default_factory=list)
    nutrition_note: str = ""
    activity_type: str = ""
    activity_intensity: str = "none"
    digestion_score: str = "normal"
    digestion_tags: List[str] = Field(default_factory=list)
    wellbeing_note: str = ""
    general_note: str = ""
    custom_values: Dict[str, Any] = Field(default_factory=dict)


class FlareUpPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    start_timestamp: str
    end_timestamp: Optional[str] = None
    initial_pain_score: int = Field(default=5, ge=0, le=10)
    peak_pain_score: int = Field(default=5, ge=0, le=10)
    body_locations: List[str] = Field(default_factory=list)
    applied_measures: List[str] = Field(default_factory=list)
    notes: str = ""


class ExperimentPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    title: str
    target_hypothesis: str = ""
    start_date: str
    end_date: Optional[str] = None
    status: str = "active"
    baseline_metrics: Dict[str, float] = Field(default_factory=dict)
    experiment_metrics: Dict[str, float] = Field(default_factory=dict)


class LabEntryPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    date: str
    parameter: str
    value: float
    unit: str = ""
    reference_range: str = ""
    notes: str = ""


class AmpelItemPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    category: str = "nutrition"
    name: str
    status: str = Field(default="green", pattern="^(green|yellow|red)$")
    notes: str = ""


class MedicalNotePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    date: str
    doctor_type: str
    summary: str
    file_ref: Optional[str] = None


class QuestionPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    created_date: str
    question: str
    is_resolved: bool = False


class AppointmentProfilePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    service_name: str
    zip_code: str
    radius_km: int = Field(default=15, ge=1, le=200)
    booking_url: str = ""
    active: bool = True


def _upsert_by_id(items: List[Dict[str, Any]], new_item: Dict[str, Any], prefix: str) -> Dict[str, Any]:
    item = dict(new_item)
    if not item.get("id"):
        item["id"] = f"{prefix}_{uuid.uuid4().hex[:10]}"
    for idx, existing in enumerate(items):
        if existing.get("id") == item["id"]:
            items[idx] = item
            return item
    items.append(item)
    return item


def _delete_by_id(items: List[Dict[str, Any]], item_id: str) -> bool:
    for idx, existing in enumerate(items):
        if existing.get("id") == item_id:
            items.pop(idx)
            return True
    return False


@app.get("/api/health")
def health_check(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    has_data = any(
        bool(state.get(col))
        for col in ("daily_logs", "flare_ups", "self_experiments", "lab_entries")
    )
    return {
        "status": "ok",
        "version": state.get("version", "1.0.0"),
        "revision": state.get("revision", 0),
        "has_data": has_data,
        "data_file": str(storage.data_path),
        "backups": storage.list_backups(),
    }


# --- Daily Logs ---
@app.get("/api/logs")
def list_logs(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    logs = sorted(state.get("daily_logs", []), key=lambda item: item.get("date", ""))
    return {"items": logs, "revision": state.get("revision", 0)}


@app.post("/api/logs")
def upsert_log(
    request: Request,
    payload: DailyLogPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    avg_len = int(state.get("settings", {}).get("cycle_average_length", 28))

    item = payload.model_dump()
    if not item.get("id"):
        item["id"] = f"log_{item['date']}"
    if not item.get("cycle_phase"):
        item["cycle_phase"] = determine_cycle_phase(item["cycle_day"], avg_len)

    logs = state.setdefault("daily_logs", [])
    # Auch nach Datum deduplizieren, falls das gleiche Datum ohne ID gepostet wird
    replaced = False
    for idx, existing in enumerate(logs):
        if existing.get("id") == item["id"] or existing.get("date") == item["date"]:
            logs[idx] = item
            replaced = True
            break
    if not replaced:
        logs.append(item)

    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/logs/{log_id}")
def delete_log(
    request: Request,
    log_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("daily_logs", []), log_id):
        raise HTTPException(status_code=404, detail=f"Log '{log_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": log_id, "revision": saved["revision"]}


# --- Flare-Ups ---
@app.get("/api/flares")
def list_flares(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    flares = sorted(
        state.get("flare_ups", []),
        key=lambda item: item.get("start_timestamp", ""),
        reverse=True,
    )
    return {"items": flares, "revision": state.get("revision", 0)}


@app.post("/api/flares")
def upsert_flare(
    request: Request,
    payload: FlareUpPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("flare_ups", []), payload.model_dump(), "flare")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/flares/{flare_id}")
def delete_flare(
    request: Request,
    flare_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("flare_ups", []), flare_id):
        raise HTTPException(status_code=404, detail=f"Flare-Up '{flare_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": flare_id, "revision": saved["revision"]}


# --- Selbst-Experimente ---
@app.get("/api/experiments")
def list_experiments(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    logs = state.get("daily_logs", [])
    evaluated = [evaluate_experiment(exp, logs) for exp in state.get("self_experiments", [])]
    return {"items": evaluated, "revision": state.get("revision", 0)}


@app.post("/api/experiments")
def upsert_experiment(
    request: Request,
    payload: ExperimentPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    raw_item = _upsert_by_id(state.setdefault("self_experiments", []), payload.model_dump(), "exp")
    evaluated = evaluate_experiment(raw_item, state.get("daily_logs", []))
    raw_item["baseline_metrics"] = evaluated.get("baseline_metrics", {})
    raw_item["experiment_metrics"] = evaluated.get("experiment_metrics", {})
    saved = storage.save(state, if_revision=if_revision)
    return {"item": evaluated, "revision": saved["revision"]}


@app.delete("/api/experiments/{exp_id}")
def delete_experiment(
    request: Request,
    exp_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("self_experiments", []), exp_id):
        raise HTTPException(status_code=404, detail=f"Experiment '{exp_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": exp_id, "revision": saved["revision"]}


# --- Laborwerte ---
@app.get("/api/labs")
def list_labs(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    labs = sorted(state.get("lab_entries", []), key=lambda item: item.get("date", ""))
    return {"items": labs, "revision": state.get("revision", 0)}


@app.post("/api/labs")
def upsert_lab(
    request: Request,
    payload: LabEntryPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("lab_entries", []), payload.model_dump(), "lab")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/labs/{lab_id}")
def delete_lab(
    request: Request,
    lab_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("lab_entries", []), lab_id):
        raise HTTPException(status_code=404, detail=f"Laborwert '{lab_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": lab_id, "revision": saved["revision"]}


# --- Ampel-Liste ---
@app.get("/api/ampel")
def list_ampel(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    return {"items": state.get("ampel_items", []), "revision": state.get("revision", 0)}


@app.post("/api/ampel")
def upsert_ampel(
    request: Request,
    payload: AmpelItemPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("ampel_items", []), payload.model_dump(), "amp")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/ampel/{item_id}")
def delete_ampel(
    request: Request,
    item_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("ampel_items", []), item_id):
        raise HTTPException(status_code=404, detail=f"Ampel-Eintrag '{item_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": item_id, "revision": saved["revision"]}


# --- Befunde & Arztbriefe ---
@app.get("/api/medical-notes")
def list_medical_notes(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    notes = sorted(
        state.get("medical_notes", []),
        key=lambda item: item.get("date", ""),
        reverse=True,
    )
    return {"items": notes, "revision": state.get("revision", 0)}


@app.post("/api/medical-notes")
def upsert_medical_note(
    request: Request,
    payload: MedicalNotePayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("medical_notes", []), payload.model_dump(), "doc")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/medical-notes/{note_id}")
def delete_medical_note(
    request: Request,
    note_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("medical_notes", []), note_id):
        raise HTTPException(status_code=404, detail=f"Befund '{note_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": note_id, "revision": saved["revision"]}


# --- Offene Fragen fuer Arztbesuche ---
@app.get("/api/questions")
def list_questions(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    return {"items": state.get("doctor_questions", []), "revision": state.get("revision", 0)}


@app.post("/api/questions")
def upsert_question(
    request: Request,
    payload: QuestionPayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("doctor_questions", []), payload.model_dump(), "q")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/questions/{question_id}")
def delete_question(
    request: Request,
    question_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("doctor_questions", []), question_id):
        raise HTTPException(status_code=404, detail=f"Frage '{question_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": question_id, "revision": saved["revision"]}


# --- Studien-Radar ---
@app.get("/api/studies")
def list_studies(request: Request, cluster: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    studies = state.get("studies", [])
    if cluster:
        studies = [s for s in studies if s.get("topic_cluster") == cluster]
    return {"items": studies, "revision": state.get("revision", 0)}


@app.post("/api/studies/{study_id}/bookmark")
def toggle_study_bookmark(
    request: Request,
    study_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    for study in state.setdefault("studies", []):
        if study.get("id") == study_id or study.get("pmid") == study_id:
            study["is_bookmarked"] = not bool(study.get("is_bookmarked"))
            saved = storage.save(state, if_revision=if_revision)
            return {"item": study, "revision": saved["revision"]}
    raise HTTPException(status_code=404, detail=f"Studie '{study_id}' nicht gefunden.")


# --- Termin-Suchprofile ---
@app.get("/api/appointments")
def list_appointments(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    return {"items": state.get("appointment_profiles", []), "revision": state.get("revision", 0)}


@app.post("/api/appointments")
def upsert_appointment(
    request: Request,
    payload: AppointmentProfilePayload,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    item = _upsert_by_id(state.setdefault("appointment_profiles", []), payload.model_dump(), "app_prof")
    saved = storage.save(state, if_revision=if_revision)
    return {"item": item, "revision": saved["revision"]}


@app.delete("/api/appointments/{profile_id}")
def delete_appointment(
    request: Request,
    profile_id: str,
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    if not _delete_by_id(state.setdefault("appointment_profiles", []), profile_id):
        raise HTTPException(status_code=404, detail=f"Terminprofil '{profile_id}' nicht gefunden.")
    saved = storage.save(state, if_revision=if_revision)
    return {"deleted_id": profile_id, "revision": saved["revision"]}


# --- Einstellungen ---
@app.get("/api/settings")
def get_settings(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    return {"settings": state.get("settings", {}), "revision": state.get("revision", 0)}


@app.put("/api/settings")
def update_settings(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    current_settings = state.setdefault("settings", {})
    current_settings.update(payload)
    saved = storage.save(state, if_revision=if_revision)
    return {"settings": saved["settings"], "revision": saved["revision"]}


# --- Analyse-Endpunkte ---
@app.get("/api/analysis/correlations")
def analysis_correlations(
    request: Request,
    min_occurrences: int = Query(default=3, ge=1, le=50),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    logs = state.get("daily_logs", [])
    avg_len = int(state.get("settings", {}).get("cycle_average_length", 28))
    return {
        "correlations": analyze_lag_correlations(logs, min_occurrences=min_occurrences),
        "cycle_stats": calculate_cycle_stats(logs, cycle_average_length=avg_len),
        "disclaimer": "Hinweis: Alle Auswertungen sind rein beschreibende Beobachtungen ohne medizinische Diagnosefunktion.",
    }


@app.get("/api/analysis/heatmap")
def analysis_heatmap(
    request: Request,
    year: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    return {
        "heatmap": get_annual_heatmap_data(state.get("daily_logs", []), year=year),
        "revision": state.get("revision", 0),
    }


@app.get("/api/analysis/cycle")
def analysis_cycle(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    state = storage.load()
    avg_len = int(state.get("settings", {}).get("cycle_average_length", 28))
    return calculate_cycle_stats(state.get("daily_logs", []), cycle_average_length=avg_len)


# --- Export & Import ---
@app.get("/api/export")
def export_data(request: Request) -> Dict[str, Any]:
    storage = get_storage(request)
    return storage.load()


@app.post("/api/import")
def import_data(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    if_revision: Optional[int] = Query(default=None),
) -> Dict[str, Any]:
    storage = get_storage(request)
    effective_revision = if_revision
    data_body = payload

    if "data" in payload and isinstance(payload["data"], dict) and "daily_logs" not in payload:
        data_body = payload["data"]
        if effective_revision is None and "if_revision" in payload:
            effective_revision = payload.get("if_revision")

    try:
        normalized = StorageEngine.normalize_state(data_body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    saved = storage.save(normalized, if_revision=effective_revision)
    return {
        "status": "imported",
        "revision": saved["revision"],
        "last_updated": saved["last_updated"],
        "counts": {
            "daily_logs": len(saved.get("daily_logs", [])),
            "flare_ups": len(saved.get("flare_ups", [])),
            "self_experiments": len(saved.get("self_experiments", [])),
            "lab_entries": len(saved.get("lab_entries", [])),
        },
    }


if (DOCS_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(DOCS_DIR), html=True), name="frontend")
