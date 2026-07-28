import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


def load_worker_module():
    worker_path = (
        Path(__file__).resolve().parents[2]
        / "OkraPDF"
        / "ProviderScripts"
        / "unlimited-ocr-worker.py"
    )
    spec = importlib.util.spec_from_file_location("unlimited_ocr_worker", worker_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


worker = load_worker_module()


class UnlimitedOCROutputParserTests(unittest.TestCase):
    def test_decodes_layout_tokens_and_truncates_repeated_tail(self):
        repeated_tail = "".join(
            "<|det|>text [87, 632, 220, 660]<|/det|>Example BankĊ"
            for _ in range(10)
        )
        raw = (
            "Ġ[0,Ġ0,Ġ999]<|/det|>Authorization agreementĊ"
            "<|det|>title [10, 20, 300, 50]<|/det|>Deposit formĊ"
            "<|det|>table [20, 80, 900, 500]<|/det|>"
            "<table><tr><td>Total</td><td>$49.00</td></tr></table>Ċ"
            + repeated_tail
        )

        page = worker.parse_model_output(raw, page_number=1, image_file="page-0001.png")

        self.assertEqual(len(page["blocks"]), 4)
        self.assertEqual(page["blocks"][0]["text"], "Authorization agreement")
        self.assertEqual(page["blocks"][1]["type"], "title")
        self.assertEqual(
            page["blocks"][1]["bbox"],
            {
                "x": 0.01,
                "y": 0.02,
                "width": 0.29,
                "height": 0.03,
                "unit": "normalized",
                "origin": "top-left",
            },
        )
        self.assertIn("<table>", page["markdown"])
        self.assertNotIn("Ġ", page["markdown"])
        self.assertNotIn("Ċ", page["markdown"])
        self.assertNotIn("<|det|>", page["markdown"])
        self.assertEqual(page["diagnostics"]["duplicateBlockCount"], 9)
        self.assertTrue(page["diagnostics"]["loopDetected"])
        self.assertGreater(page["diagnostics"]["tokenArtifactCount"], 0)
        self.assertGreater(page["diagnostics"]["malformedDetectionCount"], 0)

    def test_plain_text_output_stays_renderable(self):
        page = worker.parse_model_output(
            "First lineĊSecond line",
            page_number=2,
            image_file="page-0002.png",
        )

        self.assertEqual(len(page["blocks"]), 1)
        self.assertEqual(page["blocks"][0]["bbox"], None)
        self.assertEqual(page["plainText"], "First line\nSecond line")
        self.assertEqual(page["markdown"], "First line\nSecond line")

    def test_parses_ollama_style_layout_lines_without_control_tags(self):
        page = worker.parse_model_output(
            "title [6, 17, 991, 82]Model request\n"
            "text [51, 124, 105, 149]Open",
            page_number=1,
            image_file="page-0001.png",
        )

        self.assertEqual(len(page["blocks"]), 2)
        self.assertEqual(page["blocks"][0]["type"], "title")
        self.assertEqual(page["blocks"][0]["text"], "Model request")
        self.assertEqual(page["blocks"][1]["type"], "text")
        self.assertEqual(page["diagnostics"]["detectionCount"], 2)

    def test_structured_page_and_document_json_round_trip(self):
        page = worker.parse_model_output(
            "<|det|>text [0, 0, 999, 999]<|/det|>Full page",
            page_number=1,
            image_file="page-0001.png",
        )
        payload = worker.document_payload(
            "sample.pdf",
            total_page_count=1,
            pages=[page],
            complete=True,
            simulation=False,
        )

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            worker.write_atomic(
                output,
                json.dumps(payload, ensure_ascii=False),
            )
            decoded = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(decoded["schemaVersion"], 1)
        self.assertEqual(decoded["provider"]["id"], "unlimited-ocr")
        self.assertEqual(decoded["completedPageCount"], 1)
        self.assertTrue(decoded["complete"])
        self.assertEqual(decoded["pages"][0]["blocks"][0]["bbox"]["width"], 0.999)


if __name__ == "__main__":
    unittest.main()
