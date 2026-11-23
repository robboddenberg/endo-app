"""Deterministische Analyse- und Auswertungs-Engine fuer die Endo-App."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

LAG_OFFSETS: Tuple[Tuple[int, int, str], ...] = (
    (0, 0, "t+0h"),
    (24, 1, "t+24h"),
    (48, 2, "t+48h"),
    (72, 3, "t+72h"),
)

PHASE_IMPULSES: Dict[str, str] = {
    "menstruation": (
        "Zyklusphase Menstruation: In den ersten Zyklustagen zeigen sich häufiger höhere "
        "Schmerz- und Entzündungsscores. Plane wenn möglich ruhige Phasen und Wärme ein."
    ),
    "follicular": (
        "Zyklusphase Follikelphase: Erfahrungsgemäß steigen die Energiewerte in diesem "
        "Abschnitt häufig wieder an. Gut geeignet für gleichmäßige, moderate Bewegung."
    ),
    "ovulation": (
        "Zyklusphase Ovulation: Rund um die Zyklusmitte treten teilweise punktuelle "
        "Unterbauch-Signale auf. Beobachte dein eigenes Belastungsgefühl aufmerksam."
    ),
    "luteal": (
        "Zyklusphase Lutealphase: In der zweiten Zyklushälfte nehmen Spannung und "
        "Wärmebedürfnis oft zu. Pacing und regelmäßige Pausen können entlastend wirken."
    ),
}


def _parse_iso_date(value: Any) -> Optional[date]:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _extract_tags(log: Dict[str, Any]) -> List[str]:
    raw_tags: List[str] = []
    for field in ("nutrition_tags", "digestion_tags", "tags"):
        items = log.get(field)
        if isinstance(items, list):
            for item in items:
                if isinstance(item, str) and item.strip():
                    raw_tags.append(item.strip().lower())

    activity = log.get("activity_type")
    if isinstance(activity, str) and activity.strip():
        raw_tags.append(activity.strip().lower())

    # Dedupliziert unter Beibehaltung der Reihenfolge
    return list(dict.fromkeys(raw_tags))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def analyze_lag_correlations(
    daily_logs: List[Dict[str, Any]],
    min_occurrences: int = 3,
) -> List[Dict[str, Any]]:
    """Berechnet zeitversetzte Mittelwert-Differenzen fuer Tags bei +0h, +24h, +48h und +72h."""
    if not daily_logs:
        return []

    logs_by_date: Dict[date, Dict[str, Any]] = {}
    for entry in daily_logs:
        parsed_date = _parse_iso_date(entry.get("date"))
        if parsed_date is not None:
            logs_by_date[parsed_date] = entry

    if not logs_by_date:
        return []

    sorted_dates = sorted(logs_by_date.keys())
    all_logs = [logs_by_date[d] for d in sorted_dates]

    # Pro Datum vorkommende Tags einmalig ermitteln
    tags_by_date: Dict[date, List[str]] = {
        d: _extract_tags(logs_by_date[d]) for d in sorted_dates
    }

    # Alle bekannten Tags sammeln
    unique_tags = sorted({tag for tags in tags_by_date.values() for tag in tags})

    results: List[Dict[str, Any]] = []
    for tag in unique_tags:
        trigger_dates = [d for d in sorted_dates if tag in tags_by_date[d]]
        for offset_hours, offset_days, offset_label in LAG_OFFSETS:
            exposed_dates = set()
            exposed_logs: List[Dict[str, Any]] = []
            for trigger_d in trigger_dates:
                target_d = trigger_d + timedelta(days=offset_days)
                target_log = logs_by_date.get(target_d)
                if target_log is not None and target_d not in exposed_dates:
                    exposed_dates.add(target_d)
                    exposed_logs.append(target_log)

            n_count = len(exposed_logs)
            if n_count < min_occurrences:
                continue

            baseline_logs = [
                logs_by_date[d] for d in sorted_dates if d not in exposed_dates
            ]
            if not baseline_logs:
                baseline_logs = all_logs

            avg_pain = round(_mean([_safe_float(x.get("pain_score")) for x in exposed_logs]), 2)
            avg_infl = round(
                _mean([_safe_float(x.get("inflammation_score")) for x in exposed_logs]), 2
            )
            avg_energy = round(
                _mean([_safe_float(x.get("energy_score")) for x in exposed_logs]), 2
            )

            base_pain = round(
                _mean([_safe_float(x.get("pain_score")) for x in baseline_logs]), 2
            )
            base_infl = round(
                _mean([_safe_float(x.get("inflammation_score")) for x in baseline_logs]), 2
            )
            base_energy = round(
                _mean([_safe_float(x.get("energy_score")) for x in baseline_logs]), 2
            )

            pain_delta = round(avg_pain - base_pain, 2)
            infl_delta = round(avg_infl - base_infl, 2)
            energy_delta = round(avg_energy - base_energy, 2)
            max_abs_delta = round(max(abs(pain_delta), abs(infl_delta)), 2)

            neutral_hint = (
                f"Verzögerungs-Detektiv: An Tagen ({offset_label}) nach '{tag}' lag dein "
                f"Schmerzscore im Schnitt {pain_delta:+.1f} Punkte und dein Entzündungsscore "
                f"{infl_delta:+.1f} Punkte im Vergleich zur Baseline (n={n_count} Einträge). "
                "Beobachte dies weiter."
            )

            results.append(
                {
                    "tag": tag,
                    "offset_hours": offset_hours,
                    "offset_days": offset_days,
                    "offset_label": offset_label,
                    "n": n_count,
                    "avg_pain": avg_pain,
                    "baseline_pain": base_pain,
                    "pain_delta": pain_delta,
                    "avg_inflammation": avg_infl,
                    "baseline_inflammation": base_infl,
                    "inflammation_delta": infl_delta,
                    "avg_energy": avg_energy,
                    "baseline_energy": base_energy,
                    "energy_delta": energy_delta,
                    "max_abs_delta": max_abs_delta,
                    "neutral_hint": neutral_hint,
                }
            )

    results.sort(
        key=lambda item: (-item["max_abs_delta"], -item["n"], item["tag"], item["offset_hours"])
    )
    return results


def determine_cycle_phase(cycle_day: int, cycle_length: int = 28) -> str:
    """Ordnet einen Zyklustag deterministisch einer Phase zu (auch fuer irregulaere Zyklen)."""
    normalized_length = max(15, min(60, int(cycle_length or 28)))
    day = max(1, int(cycle_day or 1))

    if day <= 5:
        return "menstruation"

    ovulation_center = max(7, normalized_length - 14)
    if (ovulation_center - 1) <= day <= (ovulation_center + 1):
        return "ovulation"
    if day < (ovulation_center - 1):
        return "follicular"
    return "luteal"


def calculate_cycle_stats(
    daily_logs: List[Dict[str, Any]],
    cycle_average_length: int = 28,
) -> Dict[str, Any]:
    """Berechnet Zyklus-Kompass Kennzahlen, Tagesdurchschnitte und neutralen Tagesimpuls."""
    cycle_length = max(15, min(60, int(cycle_average_length or 28)))
    valid_logs: List[Tuple[date, Dict[str, Any]]] = []
    for entry in daily_logs:
        parsed = _parse_iso_date(entry.get("date"))
        if parsed is not None:
            valid_logs.append((parsed, entry))

    valid_logs.sort(key=lambda pair: pair[0])

    if not valid_logs:
        return {
            "cycle_average_length": cycle_length,
            "current_cycle_day": None,
            "current_phase": None,
            "latest_date": None,
            "per_cycle_day_averages": {},
            "phase_averages": {},
            "daily_impulse": (
                "Noch keine täglichen Einträge vorhanden. Erfasse deinen ersten Tag, "
                "um persönliche Zyklusmuster sichtbar zu machen."
            ),
        }

    latest_date, latest_log = valid_logs[-1]
    raw_day = latest_log.get("cycle_day")
    current_cycle_day = max(1, int(raw_day)) if raw_day is not None else 1
    current_phase = determine_cycle_phase(current_cycle_day, cycle_length)

    by_day: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    by_phase: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for _, log in valid_logs:
        c_day = log.get("cycle_day")
        if c_day is not None:
            try:
                day_int = max(1, int(c_day))
            except (TypeError, ValueError):
                day_int = 1
        else:
            day_int = 1
        phase = determine_cycle_phase(day_int, cycle_length)
        by_day[day_int].append(log)
        by_phase[phase].append(log)

    per_cycle_day_averages: Dict[int, Dict[str, Any]] = {}
    for day_int in sorted(by_day.keys()):
        bucket = by_day[day_int]
        per_cycle_day_averages[day_int] = {
            "cycle_day": day_int,
            "phase": determine_cycle_phase(day_int, cycle_length),
            "count": len(bucket),
            "avg_pain": round(_mean([_safe_float(x.get("pain_score")) for x in bucket]), 2),
            "avg_inflammation": round(
                _mean([_safe_float(x.get("inflammation_score")) for x in bucket]), 2
            ),
            "avg_energy": round(_mean([_safe_float(x.get("energy_score")) for x in bucket]), 2),
        }

    phase_averages: Dict[str, Dict[str, Any]] = {}
    for phase_name in ("menstruation", "follicular", "ovulation", "luteal"):
        bucket = by_phase.get(phase_name, [])
        if bucket:
            phase_averages[phase_name] = {
                "count": len(bucket),
                "avg_pain": round(_mean([_safe_float(x.get("pain_score")) for x in bucket]), 2),
                "avg_inflammation": round(
                    _mean([_safe_float(x.get("inflammation_score")) for x in bucket]), 2
                ),
                "avg_energy": round(
                    _mean([_safe_float(x.get("energy_score")) for x in bucket]), 2
                ),
            }

    phase_stat = phase_averages.get(current_phase)
    impulse_base = PHASE_IMPULSES.get(current_phase, "")
    if phase_stat:
        daily_impulse = (
            f"{impulse_base} Bisheriger Schnitt in dieser Phase (n={phase_stat['count']}): "
            f"Schmerz {phase_stat['avg_pain']:.1f}/10, Entzündung {phase_stat['avg_inflammation']:.1f}/10, "
            f"Energie {phase_stat['avg_energy']:.1f}/10."
        )
    else:
        daily_impulse = impulse_base

    return {
        "cycle_average_length": cycle_length,
        "current_cycle_day": current_cycle_day,
        "current_phase": current_phase,
        "latest_date": latest_date.isoformat(),
        "per_cycle_day_averages": per_cycle_day_averages,
        "phase_averages": phase_averages,
        "daily_impulse": daily_impulse,
    }


def evaluate_experiment(
    experiment: Dict[str, Any],
    daily_logs: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Vergleicht Baseline- und Experimentzeitraum gleicher Dauer anhand von Daily-Logs."""
    start_dt = _parse_iso_date(experiment.get("start_date"))
    end_dt = _parse_iso_date(experiment.get("end_date"))

    dated_logs: List[Tuple[date, Dict[str, Any]]] = []
    for entry in daily_logs:
        parsed = _parse_iso_date(entry.get("date"))
        if parsed is not None:
            dated_logs.append((parsed, entry))
    dated_logs.sort(key=lambda pair: pair[0])

    if start_dt is None:
        return dict(experiment)

    latest_log_date = dated_logs[-1][0] if dated_logs else date.today()
    effective_end_dt = end_dt if (end_dt is not None and end_dt >= start_dt) else latest_log_date
    if effective_end_dt < start_dt:
        effective_end_dt = start_dt

    duration_days = max(1, (effective_end_dt - start_dt).days + 1)
    baseline_end = start_dt - timedelta(days=1)
    baseline_start = start_dt - timedelta(days=duration_days)

    baseline_logs = [
        log for log_dt, log in dated_logs if baseline_start <= log_dt <= baseline_end
    ]
    experiment_logs = [
        log for log_dt, log in dated_logs if start_dt <= log_dt <= effective_end_dt
    ]

    fallback_base = experiment.get("baseline_metrics") or {}
    fallback_exp = experiment.get("experiment_metrics") or {}

    if baseline_logs:
        baseline_metrics = {
            "avg_pain": round(_mean([_safe_float(x.get("pain_score")) for x in baseline_logs]), 2),
            "avg_inflammation": round(
                _mean([_safe_float(x.get("inflammation_score")) for x in baseline_logs]), 2
            ),
            "avg_energy": round(
                _mean([_safe_float(x.get("energy_score")) for x in baseline_logs]), 2
            ),
        }
    else:
        baseline_metrics = {
            "avg_pain": round(_safe_float(fallback_base.get("avg_pain")), 2),
            "avg_inflammation": round(_safe_float(fallback_base.get("avg_inflammation")), 2),
            "avg_energy": round(_safe_float(fallback_base.get("avg_energy")), 2),
        }

    if experiment_logs:
        experiment_metrics = {
            "avg_pain": round(
                _mean([_safe_float(x.get("pain_score")) for x in experiment_logs]), 2
            ),
            "avg_inflammation": round(
                _mean([_safe_float(x.get("inflammation_score")) for x in experiment_logs]), 2
            ),
            "avg_energy": round(
                _mean([_safe_float(x.get("energy_score")) for x in experiment_logs]), 2
            ),
        }
    else:
        experiment_metrics = {
            "avg_pain": round(_safe_float(fallback_exp.get("avg_pain")), 2),
            "avg_inflammation": round(_safe_float(fallback_exp.get("avg_inflammation")), 2),
            "avg_energy": round(_safe_float(fallback_exp.get("avg_energy")), 2),
        }

    pain_delta = round(experiment_metrics["avg_pain"] - baseline_metrics["avg_pain"], 2)
    infl_delta = round(
        experiment_metrics["avg_inflammation"] - baseline_metrics["avg_inflammation"], 2
    )
    energy_delta = round(experiment_metrics["avg_energy"] - baseline_metrics["avg_energy"], 2)

    title = str(experiment.get("title") or "Experiment")
    neutral_summary = (
        f"Experiment '{title}' ({duration_days} Tage): Schmerz {pain_delta:+.2f}, "
        f"Entzündung {infl_delta:+.2f}, Energie {energy_delta:+.2f} gegenüber dem "
        f"Vergleichszeitraum davor."
    )

    enriched = dict(experiment)
    enriched.update(
        {
            "duration_days": duration_days,
            "baseline_window": {
                "start_date": baseline_start.isoformat(),
                "end_date": baseline_end.isoformat(),
                "count": len(baseline_logs),
            },
            "experiment_window": {
                "start_date": start_dt.isoformat(),
                "end_date": effective_end_dt.isoformat(),
                "count": len(experiment_logs),
            },
            "baseline_metrics": baseline_metrics,
            "experiment_metrics": experiment_metrics,
            "deltas": {
                "pain_delta": pain_delta,
                "inflammation_delta": infl_delta,
                "energy_delta": energy_delta,
            },
            "neutral_summary": neutral_summary,
        }
    )
    return enriched


def get_annual_heatmap_data(
    daily_logs: List[Dict[str, Any]],
    year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Mappt Daily-Logs auf Heatmap-Severity-Buckets (0: none, 1: mild, 2: moderate, 3: severe)."""
    items: List[Dict[str, Any]] = []
    for entry in daily_logs:
        parsed_dt = _parse_iso_date(entry.get("date"))
        if parsed_dt is None:
            continue
        if year is not None and parsed_dt.year != year:
            continue

        pain = _safe_float(entry.get("pain_score"))
        infl = _safe_float(entry.get("inflammation_score"))
        energy = _safe_float(entry.get("energy_score"))
        combined_score = max(pain, infl)

        if combined_score <= 0:
            bucket = 0
            severity = "none"
        elif combined_score <= 3:
            bucket = 1
            severity = "mild"
        elif combined_score <= 6:
            bucket = 2
            severity = "moderate"
        else:
            bucket = 3
            severity = "severe"

        items.append(
            {
                "date": parsed_dt.isoformat(),
                "pain_score": int(round(pain)),
                "inflammation_score": int(round(infl)),
                "energy_score": int(round(energy)),
                "score": int(round(combined_score)),
                "bucket": bucket,
                "severity": severity,
                "cycle_phase": entry.get("cycle_phase"),
            }
        )

    items.sort(key=lambda row: row["date"])
    return items
