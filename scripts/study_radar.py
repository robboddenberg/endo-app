"""PubMed E-Utilities Studien-Radar mit Multi-Keyword- und Themencluster-Pipeline."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.storage import StorageEngine
from scripts.build_initial_data import DEFAULT_STUDY_RADAR_CONFIG

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"


def load_radar_config(config_path: Path) -> Dict[str, Any]:
    """Laedt die Themencluster-Konfiguration oder liefert die Standard-Cluster."""
    if config_path.exists():
        try:
            loaded = json.loads(config_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict) and isinstance(loaded.get("clusters"), dict):
                return loaded
        except (OSError, json.JSONDecodeError):
            pass
    return json.loads(json.dumps(DEFAULT_STUDY_RADAR_CONFIG))


def search_pubmed_ids(
    query: str,
    retmax: int = 5,
    timeout: float = 10.0,
    session: Optional[requests.Session] = None,
) -> List[str]:
    """Fragt PubMed esearch.fcgi fuer einen Suchbegriff ab und liefert PMIDs."""
    http = session or requests.Session()
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": retmax,
        "sort": "pub+date",
        "retmode": "json",
    }
    response = http.get(ESEARCH_URL, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    id_list = payload.get("esearchresult", {}).get("idlist", [])
    return [str(pmid) for pmid in id_list if pmid]


def fetch_pubmed_summaries(
    pmids: List[str],
    timeout: float = 10.0,
    session: Optional[requests.Session] = None,
) -> Dict[str, Dict[str, Any]]:
    """Ruft Metadaten fuer eine Liste von PubMed-IDs ueber esummary.fcgi ab."""
    if not pmids:
        return {}
    http = session or requests.Session()
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "json",
    }
    response = http.get(ESUMMARY_URL, params=params, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    result_block = payload.get("result", {})

    summaries: Dict[str, Dict[str, Any]] = {}
    for pmid in pmids:
        raw = result_block.get(str(pmid))
        if isinstance(raw, dict):
            summaries[str(pmid)] = raw
    return summaries


def build_study_record(
    pmid: str,
    summary_raw: Dict[str, Any],
    topic_cluster: str,
    matched_keywords: List[str],
    existing_bookmarked: bool = False,
) -> Dict[str, Any]:
    """Wandelt ein PubMed-Summary-Objekt in das einheitliche Endo-App Studien-Schema um."""
    title = str(summary_raw.get("title") or f"PubMed Studie {pmid}").strip().rstrip(".")
    pub_date = str(summary_raw.get("pubdate") or "")[:10]
    journal = str(summary_raw.get("fulljournalname") or summary_raw.get("source") or "PubMed")
    summary_de = (
        f"Publikation aus '{journal}' ({pub_date or 'aktuell'}) zum Themenbereich "
        f"'{topic_cluster}'. Suchtreffer ueber: {', '.join(matched_keywords)}. "
        "Rein informative Literaturuebersicht ohne medizinische Empfehlung."
    )
    return {
        "id": f"pub_{pmid}",
        "pmid": str(pmid),
        "pub_date": pub_date,
        "title": title,
        "summary_de": summary_de,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "is_bookmarked": existing_bookmarked,
        "matched_keywords": list(dict.fromkeys(matched_keywords)),
        "topic_cluster": topic_cluster,
    }


def merge_and_deduplicate_studies(
    existing_studies: List[Dict[str, Any]],
    incoming_studies: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Dedupliziert Studien anhand der PMID und bewahrt bestehende Lesezeichen."""
    by_pmid: Dict[str, Dict[str, Any]] = {}
    for study in existing_studies:
        pmid = str(study.get("pmid") or "").strip()
        if pmid:
            by_pmid[pmid] = dict(study)

    for study in incoming_studies:
        pmid = str(study.get("pmid") or "").strip()
        if not pmid:
            continue
        if pmid in by_pmid:
            prev = by_pmid[pmid]
            merged_keywords = list(
                dict.fromkeys(
                    list(prev.get("matched_keywords", []))
                    + list(study.get("matched_keywords", []))
                )
            )
            updated = dict(study)
            updated["is_bookmarked"] = bool(prev.get("is_bookmarked") or study.get("is_bookmarked"))
            updated["matched_keywords"] = merged_keywords
            by_pmid[pmid] = updated
        else:
            by_pmid[pmid] = dict(study)

    merged_list = list(by_pmid.values())
    merged_list.sort(key=lambda item: (bool(item.get("is_bookmarked")), item.get("pub_date", "")), reverse=True)
    return merged_list


def run_study_radar(
    data_dir: Optional[Path] = None,
    offline_fallback: bool = True,
    session: Optional[requests.Session] = None,
) -> List[Dict[str, Any]]:
    """Fuehrt die Multi-Cluster PubMed Pipeline aus und speichert studies.json sowie data.json."""
    target_dir = Path(data_dir) if data_dir is not None else (ROOT_DIR / "data")
    target_dir.mkdir(parents=True, exist_ok=True)

    config = load_radar_config(target_dir / "study_radar_config.json")
    clusters: Dict[str, Dict[str, Any]] = config.get("clusters", {})
    max_per_cluster = int(config.get("max_results_per_cluster", 6))

    storage = StorageEngine(target_dir / "data.json")
    state = storage.load()
    existing_studies = list(state.get("studies", []))

    studies_path = target_dir / "studies.json"
    if not existing_studies and studies_path.exists():
        try:
            existing_studies = json.loads(studies_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing_studies = []

    bookmarked_pmids = {
        str(item.get("pmid"))
        for item in existing_studies
        if item.get("is_bookmarked") and item.get("pmid")
    }

    pmid_hits: Dict[str, Dict[str, Any]] = {}
    http = session or requests.Session()

    for cluster_key, cluster_cfg in clusters.items():
        queries = cluster_cfg.get("queries", [])
        cluster_pmids: List[str] = []
        for query in queries:
            try:
                found_ids = search_pubmed_ids(
                    query=query,
                    retmax=max(2, max_per_cluster // max(1, len(queries))),
                    session=http,
                )
            except requests.RequestException:
                if not offline_fallback:
                    raise
                found_ids = []

            for pmid in found_ids:
                entry = pmid_hits.setdefault(
                    pmid,
                    {"topic_cluster": cluster_key, "matched_keywords": []},
                )
                entry["matched_keywords"].append(query)
                if pmid not in cluster_pmids:
                    cluster_pmids.append(pmid)

    all_pmids = list(pmid_hits.keys())
    summaries: Dict[str, Dict[str, Any]] = {}
    if all_pmids:
        try:
            summaries = fetch_pubmed_summaries(all_pmids, session=http)
        except requests.RequestException:
            if not offline_fallback:
                raise
            summaries = {}

    incoming: List[Dict[str, Any]] = []
    for pmid, meta in pmid_hits.items():
        summary_raw = summaries.get(pmid)
        if not summary_raw:
            continue
        incoming.append(
            build_study_record(
                pmid=pmid,
                summary_raw=summary_raw,
                topic_cluster=meta["topic_cluster"],
                matched_keywords=meta["matched_keywords"],
                existing_bookmarked=(pmid in bookmarked_pmids),
            )
        )

    merged = merge_and_deduplicate_studies(existing_studies, incoming)
    studies_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    state["studies"] = merged
    storage.save(state)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="Aktualisiert das PubMed Studien-Radar fuer die Endo-App.")
    parser.add_argument("--data-dir", type=Path, default=None, help="Pfad zum Datenverzeichnis")
    parser.add_argument("--strict-online", action="store_true", help="Bei Netzwerkfehlern abbrechen")
    args = parser.parse_args()

    studies = run_study_radar(
        data_dir=args.data_dir,
        offline_fallback=not args.strict_online,
    )
    print(f"Studien-Radar abgeschlossen: {len(studies)} deduplizierte Studien gespeichert.")


if __name__ == "__main__":
    main()
