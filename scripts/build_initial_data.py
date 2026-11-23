"""Deterministischer Demo-Daten-Generator (90 Tage) fuer die Endo-App."""
from __future__ import annotations

import argparse
import json
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_STUDY_RADAR_CONFIG: Dict[str, Any] = {
    "max_results_per_cluster": 8,
    "clusters": {
        "endometriosis": {
            "label": "Endometriose & Zyklusbezug",
            "queries": [
                "endometriosis",
                "deep infiltrating endometriosis",
                "pelvic pain luteal phase",
            ],
        },
        "inflammation": {
            "label": "Entzuendung, Immun- & Darmfaktoren",
            "queries": [
                "chronic inflammation endometriosis",
                "neuroinflammation pelvic pain",
                "visceral hypersensitivity",
                "mast cell gut microbiome",
            ],
        },
        "peritoneal_abdominal": {
            "label": "Bauchfell & abdominale Entzuendungen",
            "queries": [
                "peritonitis endometriosis",
                "peritoneal inflammation abdominal pain",
                "pelvic congestion syndrome",
            ],
        },
        "diagnostic_gap": {
            "label": "Diagnostik-Luecke & unklare Befunde",
            "queries": [
                "unexplained chronic pelvic pain",
                "negative imaging endometriosis",
                "diagnostic delay endometriosis",
                "postoperative pelvic pain",
            ],
        },
    },
}


CURATED_STUDIES: List[Dict[str, Any]] = [
    {
        "id": "pub_3459102",
        "pmid": "3459102",
        "pub_date": "2023-08-15",
        "title": "Anti-inflammatory dietary interventions in endometriosis management",
        "summary_de": "Beobachtungsstudie zu Omega-3-Fettsaeuren und Polyphenolen im Zusammenhang mit dokumentierten Schmerz- und Entzuendungswerten bei Endometriose.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/3459102/",
        "is_bookmarked": True,
        "matched_keywords": ["endometriosis", "chronic inflammation endometriosis"],
        "topic_cluster": "inflammation",
    },
    {
        "id": "pub_36874219",
        "pmid": "36874219",
        "pub_date": "2024-02-10",
        "title": "Peritoneal immune environment and visceral pain mechanisms in chronic pelvic pain",
        "summary_de": "Uebersichtsarbeit ueber peritoneale Entzuendungsprozesse, Bauchfellreizungen und viszerale Schmerzweiterleitung im kleinen Becken.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/36874219/",
        "is_bookmarked": True,
        "matched_keywords": ["peritoneal inflammation abdominal pain", "visceral hypersensitivity"],
        "topic_cluster": "peritoneal_abdominal",
    },
    {
        "id": "pub_35124890",
        "pmid": "35124890",
        "pub_date": "2023-11-03",
        "title": "Diagnostic delay and negative routine imaging in superficial and deep pelvic pain",
        "summary_de": "Analyse zur Diagnostik-Luecke bei chronischem Beckenschmerz trotz unauffaelliger Standardbildgebung und zur Rolle strukturierter Symptomtagebuecher.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/35124890/",
        "is_bookmarked": False,
        "matched_keywords": ["diagnostic delay endometriosis", "negative imaging endometriosis"],
        "topic_cluster": "diagnostic_gap",
    },
    {
        "id": "pub_37219045",
        "pmid": "37219045",
        "pub_date": "2024-05-19",
        "title": "Gut microbiome patterns, mast cell activity, and abdominal bloating",
        "summary_de": "Explorative Untersuchung zu Zusammenhaengen zwischen Darmmikrobiom, Mastzell-Aktivierung und zyklusabhaengigem Blaehbauch.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/37219045/",
        "is_bookmarked": False,
        "matched_keywords": ["mast cell gut microbiome", "chronic inflammation endometriosis"],
        "topic_cluster": "inflammation",
    },
    {
        "id": "pub_33981452",
        "pmid": "33981452",
        "pub_date": "2023-06-28",
        "title": "Cycle-adapted movement and autonomic stress regulation in pelvic pain",
        "summary_de": "Vergleichsbeobachtung zu moderater Bewegung, Entspannungsroutinen und zyklusabhaengigem Belastungsempfinden.",
        "url": "https://pubmed.ncbi.nlm.nih.gov/33981452/",
        "is_bookmarked": True,
        "matched_keywords": ["endometriosis", "pelvic pain luteal phase"],
        "topic_cluster": "endometriosis",
    },
]


def _clamp_score(value: float, low: int = 0, high: int = 10) -> int:
    return max(low, min(high, int(round(value))))


def _cycle_phase_for_day(cycle_day: int) -> str:
    if cycle_day <= 5:
        return "menstruation"
    if cycle_day <= 12:
        return "follicular"
    if cycle_day <= 15:
        return "ovulation"
    return "luteal"


def _compute_window_averages(logs: List[Dict[str, Any]]) -> Dict[str, float]:
    if not logs:
        return {"avg_pain": 0.0, "avg_inflammation": 0.0, "avg_energy": 0.0}
    count = len(logs)
    return {
        "avg_pain": round(sum(float(item["pain_score"]) for item in logs) / count, 2),
        "avg_inflammation": round(sum(float(item["inflammation_score"]) for item in logs) / count, 2),
        "avg_energy": round(sum(float(item["energy_score"]) for item in logs) / count, 2),
    }


def generate_initial_data(reference_date: Optional[date] = None) -> Dict[str, Any]:
    """Erzeugt deterministisch 90 Tage lueckenlose Demo-Daten fuer die Endo-App."""
    ref_date = reference_date or date.today()
    start_date = ref_date - timedelta(days=89)
    rng = random.Random(42)

    nutrition_pool = ["antientzündlich", "warmes Frühstück", "hafer", "beeren", "gemüsesuppe", "fencheltee"]
    activity_pool = [
        ("Spaziergang", "mild"),
        ("Yoga", "mild"),
        ("Dehnen", "mild"),
        ("Pilates", "moderat"),
        ("Ruhetag", "none"),
    ]
    wellbeing_notes = {
        "menstruation": "Ruhiger Tag mit Wärmflasche und viel Ruhe.",
        "follicular": "Leichteres Körpergefühl und spürbar mehr Fokus.",
        "ovulation": "Mittleres Energielevel, leichtes Ziehen im Unterbauch.",
        "luteal": "Höheres Wärmebedürfnis, bewusstes Pacing eingeplant.",
    }

    daily_logs: List[Dict[str, Any]] = []
    gluten_trigger_days = {idx for idx in range(85) if idx % 8 == 2}
    stress_trigger_days = {idx for idx in range(85) if idx % 9 == 4}

    for idx in range(90):
        current_date = start_date + timedelta(days=idx)
        cycle_day = (idx % 28) + 1
        cycle_phase = _cycle_phase_for_day(cycle_day)

        if cycle_phase == "menstruation":
            base_pain = 5.5 + rng.uniform(-0.6, 0.9)
            base_infl = 5.0 + rng.uniform(-0.5, 0.8)
            base_energy = 4.0 + rng.uniform(-0.6, 0.8)
        elif cycle_phase == "follicular":
            base_pain = 2.0 + rng.uniform(-0.5, 0.7)
            base_infl = 2.2 + rng.uniform(-0.4, 0.7)
            base_energy = 7.4 + rng.uniform(-0.6, 0.7)
        elif cycle_phase == "ovulation":
            base_pain = 3.2 + rng.uniform(-0.4, 0.7)
            base_infl = 3.3 + rng.uniform(-0.4, 0.7)
            base_energy = 7.0 + rng.uniform(-0.5, 0.6)
        else:
            # Lutealphase steigt gegen Zyklusende leicht an
            luteal_progress = (cycle_day - 16) / 12.0
            base_pain = 3.1 + luteal_progress * 1.6 + rng.uniform(-0.4, 0.6)
            base_infl = 3.3 + luteal_progress * 1.5 + rng.uniform(-0.4, 0.6)
            base_energy = 5.6 - luteal_progress * 1.1 + rng.uniform(-0.5, 0.5)

        nutrition_tags = [nutrition_pool[idx % len(nutrition_pool)], nutrition_pool[(idx + 2) % len(nutrition_pool)]]
        digestion_tags = ["regelmäßig"]
        digestion_score = "normal"

        if idx in gluten_trigger_days:
            nutrition_tags.append("glutenhaltig")
            nutrition_note = "Unterwegs Weizenbrötchen gegessen."
        else:
            nutrition_note = "Bekömmliche, warme Mahlzeiten über den Tag verteilt."

        if idx in stress_trigger_days:
            nutrition_tags.append("stress")
            digestion_tags.append("stress")

        # Selbst-Experiment 1: 3 Wochen Omega-3 (Tag 45 bis 65)
        in_omega3_window = 45 <= idx <= 65
        if in_omega3_window:
            if "omega3" not in nutrition_tags:
                nutrition_tags.append("omega3")
            if "antientzündlich" not in nutrition_tags:
                nutrition_tags.append("antientzündlich")
            base_pain -= 1.4
            base_infl -= 1.5
            base_energy += 1.3

        # Aktives Experiment: Abendliche Waerme- und Magnesium-Routine (ab Tag 76)
        in_active_window = idx >= 76
        magnesium_taken = in_active_window or (idx % 3 == 0)
        if in_active_window:
            base_pain -= 0.7
            base_infl -= 0.6
            base_energy += 0.6

        # Verzoegerte Effekte aus +24h (Gluten) und +48h (Stress)
        bloating_level = _clamp_score(base_infl * 0.8 + rng.uniform(-0.5, 0.8), 0, 10)
        if (idx - 1) in gluten_trigger_days:
            base_pain += 3.2
            bloating_level = rng.randint(7, 9)
            digestion_score = "unruhig"
            digestion_tags = ["blähbauch", "träge"]

        if (idx - 2) in stress_trigger_days:
            base_infl += 3.3
            digestion_tags.append("verspannt")

        activity_type, activity_intensity = activity_pool[(idx + cycle_day) % len(activity_pool)]
        if cycle_phase == "menstruation" and activity_intensity == "moderat":
            activity_type, activity_intensity = ("Ruhetag", "none")

        pain_score = _clamp_score(base_pain, 0, 10)
        inflammation_score = _clamp_score(base_infl, 0, 10)
        energy_score = _clamp_score(base_energy, 1, 10)

        daily_logs.append(
            {
                "id": f"log_{current_date.isoformat()}",
                "date": current_date.isoformat(),
                "cycle_day": cycle_day,
                "cycle_phase": cycle_phase,
                "pain_score": pain_score,
                "inflammation_score": inflammation_score,
                "energy_score": energy_score,
                "nutrition_tags": list(dict.fromkeys(nutrition_tags)),
                "nutrition_note": nutrition_note,
                "activity_type": activity_type,
                "activity_intensity": activity_intensity,
                "digestion_score": digestion_score,
                "digestion_tags": list(dict.fromkeys(digestion_tags)),
                "wellbeing_note": wellbeing_notes[cycle_phase],
                "general_note": f"Zyklustag {cycle_day}: Schmerz {pain_score}/10, Entzündung {inflammation_score}/10.",
                "custom_values": {
                    "cf_bloating_level": bloating_level,
                    "cf_magnesium": magnesium_taken,
                },
            }
        )

    # 3 protokollierte Flare-Up-Episoden innerhalb der 90 Tage
    flare_indices = [15, 41, 78]
    flare_ups: List[Dict[str, Any]] = []
    flare_details = [
        (
            "07:45:00Z",
            "13:15:00Z",
            8,
            9,
            ["Unterleib zentriert", "Rücken lendenübergreifend"],
            ["Wärmflasche", "Kamillentee", "Flachlegen"],
            "Starker Schub am Morgen während der späten Lutealphase.",
        ),
        (
            "14:20:00Z",
            "19:00:00Z",
            7,
            8,
            ["Unterleib rechts", "Beckenboden"],
            ["Wärmepflaster", "Atemübung", "Kurzer Spaziergang danach"],
            "Deutliches Ziehen am Nachmittag, mit Wärme gut begleitet.",
        ),
        (
            "09:10:00Z",
            "15:30:00Z",
            7,
            9,
            ["Unterleib komplett", "Unterer Rücken", "Oberschenkel"],
            ["Wärmflasche", "Fencheltee", "Beine hochlagern"],
            "Stärkeres Druckgefühl am ersten Zyklustag.",
        ),
    ]
    for flare_num, (day_idx, details) in enumerate(zip(flare_indices, flare_details), start=1):
        d_iso = (start_date + timedelta(days=day_idx)).isoformat()
        start_t, end_t, init_p, peak_p, locs, measures, note = details
        flare_ups.append(
            {
                "id": f"flare_{d_iso}_{flare_num:02d}",
                "start_timestamp": f"{d_iso}T{start_t}",
                "end_timestamp": f"{d_iso}T{end_t}",
                "initial_pain_score": init_p,
                "peak_pain_score": peak_p,
                "body_locations": locs,
                "applied_measures": measures,
                "notes": note,
            }
        )

    # Selbst-Experimente passend zu den Datenfenstern
    omega_baseline_logs = daily_logs[24:45]
    omega_exp_logs = daily_logs[45:66]
    active_baseline_logs = daily_logs[62:76]
    active_exp_logs = daily_logs[76:90]

    self_experiments: List[Dict[str, Any]] = [
        {
            "id": "exp_omega3_01",
            "title": "3 Wochen Omega-3 (Algenöl)",
            "target_hypothesis": "Beobachtung der Schmerz- und Entzündungswerte während 21 Tagen Omega-3-Betonung",
            "start_date": daily_logs[45]["date"],
            "end_date": daily_logs[65]["date"],
            "status": "completed",
            "baseline_metrics": _compute_window_averages(omega_baseline_logs),
            "experiment_metrics": _compute_window_averages(omega_exp_logs),
        },
        {
            "id": "exp_waerme_02",
            "title": "Abendliche Wärme- und Magnesium-Routine",
            "target_hypothesis": "Beobachtung von Abendspannung und Energieverlauf über 14 Tage",
            "start_date": daily_logs[76]["date"],
            "end_date": None,
            "status": "active",
            "baseline_metrics": _compute_window_averages(active_baseline_logs),
            "experiment_metrics": _compute_window_averages(active_exp_logs),
        },
    ]

    ampel_items: List[Dict[str, Any]] = [
        {
            "id": "amp_1",
            "category": "nutrition",
            "name": "Glutenhaltiges Brot",
            "status": "red",
            "notes": "In eigenen Notizen häufig 24h danach mit Blähbauch und erhöhtem Schmerzscore dokumentiert.",
        },
        {
            "id": "amp_2",
            "category": "nutrition",
            "name": "Gekochtes Gemüse & Kurkuma-Suppe",
            "status": "green",
            "notes": "Im Alltag durchgehend gut verträglich dokumentiert.",
        },
        {
            "id": "amp_3",
            "category": "activity",
            "name": "Intensives HIIT-Training",
            "status": "yellow",
            "notes": "In der Follikelphase gut verträglich, in der späten Lutealphase oft anstrengender.",
        },
        {
            "id": "amp_4",
            "category": "activity",
            "name": "Sanftes Yin-Yoga & Spaziergang",
            "status": "green",
            "notes": "Über alle Zyklusphasen hinweg angenehm und ausgleichend.",
        },
        {
            "id": "amp_5",
            "category": "nutrition",
            "name": "Stark verarbeitete Fertigsnacks",
            "status": "red",
            "notes": "Häufig mit unruhiger Verdauung am Folgetag vermerkt.",
        },
    ]

    lab_entries: List[Dict[str, Any]] = [
        {
            "id": "lab_1",
            "date": (start_date + timedelta(days=12)).isoformat(),
            "parameter": "CRP",
            "value": 6.8,
            "unit": "mg/l",
            "reference_range": "< 5.0",
            "notes": "Leicht über Referenzbereich während einer akuten Phase.",
        },
        {
            "id": "lab_2",
            "date": (start_date + timedelta(days=72)).isoformat(),
            "parameter": "CRP",
            "value": 2.4,
            "unit": "mg/l",
            "reference_range": "< 5.0",
            "notes": "Im Referenzbereich.",
        },
        {
            "id": "lab_3",
            "date": (start_date + timedelta(days=12)).isoformat(),
            "parameter": "Ferritin",
            "value": 18.0,
            "unit": "µg/l",
            "reference_range": "30 - 200",
            "notes": "Erniedrigt dokumentiert, beim nächsten Termin ansprechen.",
        },
        {
            "id": "lab_4",
            "date": (start_date + timedelta(days=72)).isoformat(),
            "parameter": "Ferritin",
            "value": 29.0,
            "unit": "µg/l",
            "reference_range": "30 - 200",
            "notes": "Anstieg gegenüber Vorwert sichtbar.",
        },
        {
            "id": "lab_5",
            "date": (start_date + timedelta(days=12)).isoformat(),
            "parameter": "Vitamin D",
            "value": 22.0,
            "unit": "ng/ml",
            "reference_range": "30 - 60",
            "notes": "Niedriger Ausgangswert im Spätherbst.",
        },
        {
            "id": "lab_6",
            "date": (start_date + timedelta(days=72)).isoformat(),
            "parameter": "Vitamin D",
            "value": 36.0,
            "unit": "ng/ml",
            "reference_range": "30 - 60",
            "notes": "Innerhalb des Referenzbereichs.",
        },
    ]

    medical_notes: List[Dict[str, Any]] = [
        {
            "id": "doc_1",
            "date": (start_date + timedelta(days=20)).isoformat(),
            "doctor_type": "Gynäkologie",
            "summary": "Ultraschallkontrolle unauffällig. Hinweis erhalten, zyklische Beschwerdespitzen strukturiert zu dokumentieren und Beckenbodentherapie zu prüfen.",
            "file_ref": None,
        },
        {
            "id": "doc_2",
            "date": (start_date + timedelta(days=68)).isoformat(),
            "doctor_type": "Endometriose-Sprechstunde",
            "summary": "Ausführliches Anamnesegespräch anhand des eigenen Symptomverlaufs. Verlaufskontrolle in 3 Monaten vereinbart.",
            "file_ref": None,
        },
    ]

    doctor_questions: List[Dict[str, Any]] = [
        {
            "id": "q_1",
            "created_date": (start_date + timedelta(days=75)).isoformat(),
            "question": "Ist ein Rezept für spezialisierte Beckenboden-Physiotherapie sinnvoll?",
            "is_resolved": False,
        },
        {
            "id": "q_2",
            "created_date": (start_date + timedelta(days=80)).isoformat(),
            "question": "Wann sollte der Ferritin-Wert zur Verlaufskontrolle erneut bestimmt werden?",
            "is_resolved": False,
        },
        {
            "id": "q_3",
            "created_date": (start_date + timedelta(days=84)).isoformat(),
            "question": "Welche diagnostischen Schritte sind bei wiederkehrenden Schüben trotz unauffälligem Ultraschall üblich?",
            "is_resolved": False,
        },
    ]

    appointment_profiles: List[Dict[str, Any]] = [
        {
            "id": "app_prof_1",
            "service_name": "Osteopathie / Lymphdrainage",
            "zip_code": "10115",
            "radius_km": 15,
            "booking_url": "https://beispiel-praxis.de/termin",
            "active": True,
        },
        {
            "id": "app_prof_2",
            "service_name": "Spezialsprechstunde Endometriose & Beckenboden",
            "zip_code": "10115",
            "radius_km": 25,
            "booking_url": "https://beispiel-zentrum.de/sprechstunde",
            "active": True,
        },
    ]

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "version": "1.0.0",
        "revision": 1,
        "last_updated": now_iso,
        "settings": {
            "pin_hash": None,
            "pin_enabled": False,
            "cycle_average_length": 28,
            "theme_mode": "light",
            "custom_fields": [
                {
                    "id": "cf_bloating_level",
                    "label": "Blähbauch-Intensität",
                    "type": "scale_10",
                    "enabled": True,
                },
                {
                    "id": "cf_magnesium",
                    "label": "Magnesium genommen",
                    "type": "boolean",
                    "enabled": True,
                },
            ],
            "study_radar": {
                "topic_clusters": [
                    "endometriosis",
                    "inflammation",
                    "peritoneal_abdominal",
                    "diagnostic_gap",
                ],
                "custom_queries": [],
            },
        },
        "daily_logs": daily_logs,
        "flare_ups": flare_ups,
        "self_experiments": self_experiments,
        "ampel_items": ampel_items,
        "lab_entries": lab_entries,
        "medical_notes": medical_notes,
        "doctor_questions": doctor_questions,
        "studies": [dict(item) for item in CURATED_STUDIES],
        "appointment_profiles": appointment_profiles,
    }


def write_initial_files(data_dir: Optional[Path] = None, reference_date: Optional[date] = None) -> Path:
    """Schreibt data.json, studies.json und study_radar_config.json in data_dir."""
    root_dir = Path(__file__).resolve().parent.parent
    target_dir = Path(data_dir) if data_dir is not None else (root_dir / "data")
    target_dir.mkdir(parents=True, exist_ok=True)

    payload = generate_initial_data(reference_date=reference_date)

    data_file = target_dir / "data.json"
    data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    studies_file = target_dir / "studies.json"
    studies_file.write_text(json.dumps(payload["studies"], ensure_ascii=False, indent=2), encoding="utf-8")

    config_file = target_dir / "study_radar_config.json"
    if not config_file.exists():
        config_file.write_text(
            json.dumps(DEFAULT_STUDY_RADAR_CONFIG, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return data_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Erzeugt 90 Tage deterministische Demo-Daten fuer die Endo-App.")
    parser.add_argument("--data-dir", type=Path, default=None, help="Zielverzeichnis fuer JSON-Dateien")
    args = parser.parse_args()

    out_path = write_initial_files(data_dir=args.data_dir)
    print(f"Initiale Endo-App Demo-Daten erfolgreich erzeugt: {out_path}")


if __name__ == "__main__":
    main()
