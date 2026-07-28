import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER_PATH = ROOT / "OkraPDF" / "PluginScripts" / "presidio-ner-worker.py"
SPEC = importlib.util.spec_from_file_location("presidio_ner_worker", WORKER_PATH)
WORKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = WORKER
SPEC.loader.exec_module(WORKER)


class FakeResult:
    entity_type = "PERSON"
    start = 0
    end = 8
    score = 0.91


class FakeAnalyzer:
    def analyze(self, **kwargs):
        self.kwargs = kwargs
        return [FakeResult()]


class PresidioNERWorkerTests(unittest.TestCase):
    def test_maps_presidio_span_to_source_block_box(self):
        analyzer = FakeAnalyzer()
        payload = {
            "source_output": "/tmp/result.json",
            "language": "en",
            "entities": ["PERSON"],
            "min_score": 0.35,
            "nodes": [
                {
                    "id": "page-1-block-1",
                    "page": 1,
                    "text": "Jane Doe works here",
                    "bbox": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.04},
                }
            ],
        }

        result = WORKER.detect_nodes(payload, analyzer=analyzer)

        self.assertEqual(result["object"], "okra.pii-detection")
        self.assertEqual(result["stats"]["total"], 1)
        self.assertEqual(result["stats"]["boxes_available"], 1)
        self.assertEqual(result["stats"]["by_type"], {"PERSON": 1})
        self.assertEqual(result["stats"]["by_source"], {"presidio": 1})
        self.assertEqual(result["findings"][0]["text"], "Jane Doe")
        self.assertEqual(result["findings"][0]["bbox"], payload["nodes"][0]["bbox"])
        self.assertEqual(
            result["boxes"][0],
            {
                "page": 1,
                "x": 0.1,
                "y": 0.2,
                "w": 0.3,
                "h": 0.04,
                "type": "PERSON",
                "text": "Jane Doe",
                "score": 0.91,
                "source": "presidio",
            },
        )
        self.assertEqual(analyzer.kwargs["score_threshold"], 0.35)

    def test_simulation_is_deterministic_and_text_only(self):
        payload = {
            "source_output": "/tmp/result.md",
            "language": "en",
            "entities": ["PERSON", "EMAIL_ADDRESS"],
            "min_score": 0.35,
            "nodes": [
                {
                    "id": "markdown-output-1",
                    "page": None,
                    "text": "Contact Jane Doe at jane@example.com.",
                    "bbox": None,
                }
            ],
        }

        result = WORKER.detect_nodes(payload, simulate=True)

        self.assertEqual(result["stats"]["total"], 2)
        self.assertEqual(result["stats"]["boxes_available"], 0)
        self.assertEqual(result["boxes"], [])
        self.assertEqual(
            {finding["entity_type"] for finding in result["findings"]},
            {"PERSON", "EMAIL_ADDRESS"},
        )


if __name__ == "__main__":
    unittest.main()
