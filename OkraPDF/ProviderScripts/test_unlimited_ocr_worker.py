import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).with_name("unlimited-ocr-worker.py")
spec = importlib.util.spec_from_file_location("unlimited_ocr_worker", MODULE_PATH)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

ALASKA_LIKE_RAW = (
    "<|det|>header [438, 30, 897, 66]<|/det|>Manage Checked Bags - Alaska Airlines\n"
    "<|det|>image [58, 96, 340, 172]<|/det|>Alaska logo\n"
    "<|det|>text<|/det|>View reservation\n"
    "<|det|>title [60, 400, 540, 470]<|/det|>Checked bags\n"
    "<|det|>heading [60, 520, 200, 560]<|/det|>Note\n"
    "<|det|>list-item<|/det|>Guests must be checked in to add bags.\n"
    "<|det|>list-item<|/det|>We will check your bags to the final destination on your ticket\n"
    "as long as there are fewer than 18 hours between flights.\n"
    "<|det|>text<|/det|>Checked bags added. Use a bag tag station at the airport.\n"
    "<|det|>text<|/det|>Read more about Checked bags\n"
)


def parse_alaska():
    return worker.parse_model_output(ALASKA_LIKE_RAW, page_number=1, image_file="page-1.png")


def test_every_marked_entity_becomes_its_own_block():
    page = parse_alaska()
    texts = [block["text"] for block in page["blocks"]]
    assert texts == [
        "Manage Checked Bags - Alaska Airlines",
        "Alaska logo",
        "View reservation",
        "Checked bags",
        "Note",
        "Guests must be checked in to add bags.",
        "We will check your bags to the final destination on your ticket\n"
        "as long as there are fewer than 18 hours between flights.",
        "Checked bags added. Use a bag tag station at the airport.",
        "Read more about Checked bags",
    ]


def test_marker_category_survives_even_without_bbox():
    page = parse_alaska()
    types = [block["type"] for block in page["blocks"]]
    assert types == [
        "header",
        "image",
        "text",
        "title",
        "heading",
        "list-item",
        "list-item",
        "text",
        "text",
    ]


def test_grounded_blocks_keep_normalized_bbox():
    page = parse_alaska()
    header = page["blocks"][0]
    assert header["bbox"] == {
        "x": 0.438,
        "y": 0.03,
        "width": pytest.approx(0.459, abs=1e-6),
        "height": pytest.approx(0.036, abs=1e-6),
        "unit": "normalized",
        "origin": "top-left",
    }
    grounded = [b for b in page["blocks"] if b["bbox"] is not None]
    assert [b["text"] for b in grounded] == [
        "Manage Checked Bags - Alaska Airlines",
        "Alaska logo",
        "Checked bags",
        "Note",
    ]


def test_ungrounded_blocks_have_no_bbox_but_are_not_dropped():
    page = parse_alaska()
    ungrounded = [b for b in page["blocks"] if b["bbox"] is None]
    assert [b["text"] for b in ungrounded] == [
        "View reservation",
        "Guests must be checked in to add bags.",
        "We will check your bags to the final destination on your ticket\n"
        "as long as there are fewer than 18 hours between flights.",
        "Checked bags added. Use a bag tag station at the airport.",
        "Read more about Checked bags",
    ]


def test_multiline_continuation_stays_with_owning_marker():
    page = parse_alaska()
    list_items = [b for b in page["blocks"] if b["type"] == "list-item"]
    assert len(list_items) == 2
    assert "18 hours between flights" in list_items[1]["text"]


def test_bboxless_markers_are_not_reported_as_malformed():
    page = parse_alaska()
    diagnostics = page["diagnostics"]
    assert diagnostics["malformedDetectionCount"] == 0
    assert diagnostics["detectionCount"] == 9
    assert diagnostics["groundedBlockCount"] == 4
    assert diagnostics["ungroundedBlockCount"] == 5


def test_truly_orphan_markers_still_count_as_malformed():
    raw = (
        "<|det|>title [10, 10, 500, 60]<|/det|>A title\n"
        "some stray text <|/det|> more text\n"
        "<|det|> [12, 20, 400, 50]<|/det|>missing category\n"
    )
    page = worker.parse_model_output(raw, page_number=1, image_file="p.png")
    assert page["diagnostics"]["malformedDetectionCount"] > 0
    assert any("title" == b["type"] for b in page["blocks"])


def test_pdf_input_is_rejected_with_actionable_message():
    with pytest.raises(SystemExit) as excinfo:
        worker.validate_image_paths(["/Users/test/Desktop/print.pdf"])
    message = str(excinfo.value)
    assert "print.pdf" in message
    assert "run-unlimited-ocr.sh" in message


def test_rendered_page_images_are_accepted():
    worker.validate_image_paths(["pages/page-0001.png", "pages/page-0002.jpeg"])
