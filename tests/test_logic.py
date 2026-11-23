"""Tests fuer die deterministische Analyse-Engine und den Demo-Generator."""
from __future__ import annotations

from datetime import date, timedelta

from backend.app.logic import (
    analyze_lag_correlations,
    calculate_cycle_stats,
    determine_cycle_phase,
    evaluate_experiment,
    get_annual_heatmap_data,
)
from scripts.build_initial_data import generate_initial_data
from scripts.study_radar import merge_and_deduplicate_studies


def test_lag_correlation_computation() -> None:
    """Validiert die deterministische 24h/48h/72h-Erkennung bekannter Testmuster."""
    start = date(2026, 9, 1)
    logs = []
    for idx in range(25):
        current = start + timedelta(days=idx)
        logs.append(
            {
                "id": f"log_{current.isoformat()}",
                "date": current.isoformat(),
                "cycle_day": (idx % 28) + 1,
                "pain_score": 2,
                "inflammation_score": 2,
                "energy_score": 7,
                "nutrition_tags": ["hafer"],
                "digestion_tags": [],
                "activity_type": "Spaziergang",
            }
        )

    # +24h Muster nach "glutenhaltig" (n=4)
    for trigger_idx in (1, 6, 11, 16):
        logs[trigger_idx]["nutrition_tags"].append("glutenhaltig")
        logs[trigger_idx + 1]["pain_score"] = 8

    # +48h Muster nach "stress" (n=3)
    for trigger_idx in (2, 8, 14):
        logs[trigger_idx]["nutrition_tags"].append("stress")
        logs[trigger_idx + 2]["inflammation_score"] = 9

    # +72h Muster nach "hartes_training" (n=3)
    for trigger_idx in (3, 9, 15):
        logs[trigger_idx]["nutrition_tags"].append("hartes_training")
        logs[trigger_idx + 3]["pain_score"] = 7

    # Seltenes Tag (n=2 < 3) muss herausgefiltert werden
    for trigger_idx in (0, 20):
        logs[trigger_idx]["nutrition_tags"].append("einzeltest")

    correlations = analyze_lag_correlations(logs, min_occurrences=3)
    by_pair = {(row["tag"], row["offset_hours"]): row for row in correlations}

    assert ("glutenhaltig", 24) in by_pair
    assert by_pair[("glutenhaltig", 24)]["n"] == 4
    assert by_pair[("glutenhaltig", 24)]["pain_delta"] > 4.0

    assert ("stress", 48) in by_pair
    assert by_pair[("stress", 48)]["n"] == 3
    assert by_pair[("stress", 48)]["inflammation_delta"] > 5.0

    assert ("hartes_training", 72) in by_pair
    assert by_pair[("hartes_training", 72)]["n"] == 3
    assert by_pair[("hartes_training", 72)]["pain_delta"] > 3.0

    assert all(row["tag"] != "einzeltest" for row in correlations)

    # Compliance-Check: keine Gedankenstriche in generierten Hinweistexten
    for row in correlations:
        assert "\u2013" not in row["neutral_hint"]
        assert "\u2014" not in row["neutral_hint"]

    # Gegenprobe mit 90-Tage Demo-Datensatz
    demo = generate_initial_data(reference_date=date(2026, 11, 23))
    assert len(demo["daily_logs"]) == 90
    demo_corr = analyze_lag_correlations(demo["daily_logs"], min_occurrences=3)
    demo_pairs = {(row["tag"], row["offset_hours"]): row for row in demo_corr}
    assert ("glutenhaltig", 24) in demo_pairs
    assert demo_pairs[("glutenhaltig", 24)]["pain_delta"] > 1.5
    assert ("stress", 48) in demo_pairs
    assert demo_pairs[("stress", 48)]["inflammation_delta"] > 1.5


def test_cycle_phase_calculator() -> None:
    """Validiert Phasenberechnung bei regulaeren (28T) und irregulaeren (21T, 34T) Zyklen."""
    # Regulaerer 28-Tage Zyklus
    assert determine_cycle_phase(1, 28) == "menstruation"
    assert determine_cycle_phase(5, 28) == "menstruation"
    assert determine_cycle_phase(9, 28) == "follicular"
    assert determine_cycle_phase(14, 28) == "ovulation"
    assert determine_cycle_phase(22, 28) == "luteal"

    # Kurzer / irregulaerer 21-Tage Zyklus (Ovulation um Tag 7)
    assert determine_cycle_phase(3, 21) == "menstruation"
    assert determine_cycle_phase(7, 21) == "ovulation"
    assert determine_cycle_phase(16, 21) == "luteal"

    # Langer / irregulaerer 34-Tage Zyklus (Ovulation um Tag 20)
    assert determine_cycle_phase(12, 34) == "follicular"
    assert determine_cycle_phase(20, 34) == "ovulation"
    assert determine_cycle_phase(29, 34) == "luteal"

    # Leere Logs sicher abfangen
    empty_stats = calculate_cycle_stats([], cycle_average_length=28)
    assert empty_stats["current_cycle_day"] is None
    assert empty_stats["current_phase"] is None

    # Berechnung mit Demo-Logs
    demo = generate_initial_data(reference_date=date(2026, 11, 23))
    stats = calculate_cycle_stats(demo["daily_logs"], cycle_average_length=28)
    assert stats["current_cycle_day"] == demo["daily_logs"][-1]["cycle_day"]
    assert stats["current_phase"] in ("menstruation", "follicular", "ovulation", "luteal")
    assert 1 in stats["per_cycle_day_averages"]
    assert "menstruation" in stats["phase_averages"]
    assert "\u2013" not in stats["daily_impulse"]
    assert "\u2014" not in stats["daily_impulse"]


def test_evaluate_experiment_and_heatmap() -> None:
    """Prueft Experiment-Auswertung, Heatmap-Buckets und PMID-Deduplizierung."""
    demo = generate_initial_data(reference_date=date(2026, 11, 23))
    omega_exp = demo["self_experiments"][0]
    evaluated = evaluate_experiment(omega_exp, demo["daily_logs"])

    assert evaluated["duration_days"] == 21
    assert evaluated["deltas"]["pain_delta"] < 0
    assert evaluated["deltas"]["inflammation_delta"] < 0
    assert evaluated["deltas"]["energy_delta"] > 0
    assert "\u2013" not in evaluated["neutral_summary"]
    assert "\u2014" not in evaluated["neutral_summary"]

    # Heatmap-Buckets (0: none, 1: mild, 2: moderate, 3: severe)
    bucket_logs = [
        {"date": "2026-10-01", "pain_score": 0, "inflammation_score": 0, "energy_score": 8},
        {"date": "2026-10-02", "pain_score": 2, "inflammation_score": 3, "energy_score": 7},
        {"date": "2026-10-03", "pain_score": 5, "inflammation_score": 4, "energy_score": 5},
        {"date": "2026-10-04", "pain_score": 8, "inflammation_score": 6, "energy_score": 3},
    ]
    heatmap = get_annual_heatmap_data(bucket_logs, year=2026)
    assert [row["bucket"] for row in heatmap] == [0, 1, 2, 3]
    assert [row["severity"] for row in heatmap] == ["none", "mild", "moderate", "severe"]
    assert get_annual_heatmap_data(bucket_logs, year=2025) == []

    # Studien-Radar PMID-Deduplizierung mit Bewahrung von Lesezeichen
    existing = [
        {
            "id": "pub_123",
            "pmid": "123",
            "pub_date": "2026-01-01",
            "title": "Studie A",
            "is_bookmarked": True,
            "matched_keywords": ["endometriosis"],
            "topic_cluster": "endometriosis",
        }
    ]
    incoming = [
        {
            "id": "pub_123",
            "pmid": "123",
            "pub_date": "2026-01-01",
            "title": "Studie A",
            "is_bookmarked": False,
            "matched_keywords": ["peritonitis"],
            "topic_cluster": "peritoneal_abdominal",
        },
        {
            "id": "pub_456",
            "pmid": "456",
            "pub_date": "2026-02-01",
            "title": "Studie B",
            "is_bookmarked": False,
            "matched_keywords": ["diagnostic delay"],
            "topic_cluster": "diagnostic_gap",
        },
    ]
    merged = merge_and_deduplicate_studies(existing, incoming)
    assert len(merged) == 2
    study_123 = next(item for item in merged if item["pmid"] == "123")
    assert study_123["is_bookmarked"] is True
    assert study_123["matched_keywords"] == ["endometriosis", "peritonitis"]
