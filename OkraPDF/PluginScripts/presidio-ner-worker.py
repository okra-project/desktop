#!/usr/bin/env python3
"""Run Presidio over okraPDF extraction nodes and emit the local box-JSON seam."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


def _simulated_analyze(text: str) -> Iterable[dict[str, Any]]:
    patterns = (
        ("EMAIL_ADDRESS", r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", 0.99),
        ("US_SSN", r"\b\d{3}-\d{2}-\d{4}\b", 0.99),
        ("PHONE_NUMBER", r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b", 0.90),
        ("PERSON", r"\b(?:Jane Doe|John Doe)\b", 0.85),
    )
    for entity_type, pattern, score in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            yield {
                "entity_type": entity_type,
                "start": match.start(),
                "end": match.end(),
                "score": score,
            }


def detect_nodes(
    payload: dict[str, Any],
    analyzer: Any | None = None,
    simulate: bool = False,
) -> dict[str, Any]:
    nodes = payload.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("Presidio input must contain at least one extraction node.")

    language = payload.get("language", "en")
    entities = payload.get("entities") or None
    min_score = float(payload.get("min_score", 0))
    findings: list[dict[str, Any]] = []

    for node in nodes:
        text = node.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        if simulate:
            results = (
                result
                for result in _simulated_analyze(text)
                if entities is None or result["entity_type"] in entities
            )
        else:
            results = analyzer.analyze(
                text=text,
                language=language,
                entities=entities,
                score_threshold=min_score,
            )

        for result in results:
            if isinstance(result, dict):
                entity_type = result["entity_type"]
                start = int(result["start"])
                end = int(result["end"])
                score = float(result["score"])
            else:
                entity_type = result.entity_type
                start = int(result.start)
                end = int(result.end)
                score = float(result.score)
            start = max(0, min(start, len(text)))
            end = max(start, min(end, len(text)))
            if score < min_score or start == end:
                continue
            findings.append(
                {
                    "node_id": str(node.get("id", "node")),
                    "page": node.get("page"),
                    "entity_type": str(entity_type),
                    "start": start,
                    "end": end,
                    "score": score,
                    "text": text[start:end],
                    "bbox": node.get("bbox"),
                }
            )

    findings.sort(
        key=lambda item: (
            item["page"] is None,
            item["page"] or 0,
            item["node_id"],
            item["start"],
            item["entity_type"],
        )
    )
    boxes = [
        {
            "page": item["page"],
            "x": item["bbox"]["x"],
            "y": item["bbox"]["y"],
            "w": item["bbox"]["w"],
            "h": item["bbox"]["h"],
            "type": item["entity_type"],
            "text": item["text"],
            "score": item["score"],
            "source": "presidio",
        }
        for item in findings
        if item["page"] is not None and item["bbox"] is not None
    ]
    by_type = Counter(item["entity_type"] for item in findings)
    return {
        "schema_version": 1,
        "object": "okra.pii-detection",
        "plugin": "presidio-ner",
        "source_output": str(payload.get("source_output", "")),
        "findings": findings,
        "boxes": boxes,
        "stats": {
            "total": len(findings),
            "by_type": dict(sorted(by_type.items())),
            "by_source": {"presidio": len(findings)} if findings else {},
            "nodes_analyzed": len(nodes),
            "boxes_available": len(boxes),
        },
    }


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True, ensure_ascii=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
    except BaseException:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--simulate", action="store_true")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8") as source:
        payload = json.load(source)

    analyzer = None
    if not args.simulate:
        from presidio_analyzer import AnalyzerEngine

        analyzer = AnalyzerEngine()
    result = detect_nodes(payload, analyzer=analyzer, simulate=args.simulate)
    write_json_atomic(args.output, result)


if __name__ == "__main__":
    main()
