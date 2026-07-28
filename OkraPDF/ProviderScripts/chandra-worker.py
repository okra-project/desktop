#!/usr/bin/env python3
"""Chandra OCR 2 worker — local MLX VLM parser for okraPDF desktop.

Mirrors unlimited-ocr-worker.py's persistence/checkpoint/progress contract so the
Swift coordinator (LocalPageCheckpointStore / RunHealth) drives it identically.
The only Chandra-specific parts are: the trained OCR_LAYOUT prompt, and an
HTML `<div data-bbox=...>` projection (chandra-html-v1) in place of the
Unlimited-OCR `<|det|>` token markers. Output block/document JSON schema is the
same shape, so downstream views stay uniform.

Model weights are NEVER bundled: the pinned MLX repo is downloaded + SHA-verified
by the Swift ModelDownloader into ~/.okra/providers/chandra/model and passed via
--model. This script only runs inference and projects the result.
"""
import argparse
import html as html_lib
import json
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


# Verbatim from datalab-to/chandra @ chandra/prompts.py — the model was trained on
# this exact prompt; do NOT paraphrase.
OCR_LAYOUT_PROMPT = (
    "OCR this image to HTML, arranged as layout blocks.  Each layout block should be a "
    "div with the data-bbox attribute representing the bounding box of the block in "
    "x0 y0 x1 y1 format.  Bboxes are normalized 0-1000. The data-label attribute is the "
    "label for the block.\n\n"
    "Use the following labels:\n"
    "- Caption\n- Footnote\n- Equation-Block\n- List-Group\n- Page-Header\n- Page-Footer\n"
    "- Image\n- Section-Header\n- Table\n- Text\n- Complex-Block\n- Code-Block\n- Form\n"
    "- Table-Of-Contents\n- Figure\n- Chemical-Block\n- Diagram\n- Bibliography\n- Blank-Page\n\n"
    "Only use these tags [\"math\",\"br\",\"i\",\"b\",\"u\",\"del\",\"sup\",\"sub\",\"table\",\"tr\","
    "\"td\",\"p\",\"th\",\"div\",\"pre\",\"h1\",\"h2\",\"h3\",\"h4\",\"h5\",\"ul\",\"ol\",\"li\",\"input\","
    "\"a\",\"span\",\"img\",\"hr\",\"tbody\",\"small\",\"caption\",\"strong\",\"thead\",\"big\",\"code\","
    "\"chem\"], and these attributes [\"class\",\"colspan\",\"rowspan\",\"display\",\"checked\",\"type\","
    "\"border\",\"value\",\"style\",\"href\",\"alt\",\"align\",\"data-bbox\",\"data-label\"].\n\n"
    "Guidelines:\n"
    "* Inline math: Surround math with <math>...</math> tags. Math expressions should be "
    "rendered in KaTeX-compatible LaTeX. Use display for block math.\n"
    "* Tables: Use colspan and rowspan attributes to match table structure.\n"
    "* Formatting: Maintain consistent formatting with the image, including spacing, "
    "indentation, subscripts/superscripts, and special characters.\n"
    "* Images: Include a description of any images in the alt attribute of an <img> tag. "
    "Do not fill out the src property. Describe in detail inside the div tag. Also convert "
    "charts to high fidelity data, and convert diagrams to mermaid.\n"
    "* Forms: Mark checkboxes and radio buttons properly.\n"
    "* Text: join lines together properly into paragraphs using <p>...</p> tags.  Use <br> "
    "tags for line breaks within paragraphs, but only when absolutely necessary to maintain meaning.\n"
    "* Chemistry: Use <chem>...</chem> tags for chemical formulas with reactive SMILES.\n"
    "* Lists: Preserve indents and proper list markers.\n"
    "* Use the simplest possible HTML structure that accurately represents the content of the block.\n"
    "* Make sure the text is accurate and easy for a human to read and interpret.  Reading "
    "order should be correct and natural."
)

# Chandra data-label (lowercased, spaces->hyphens) -> canonical block category.
CATEGORY_ALIASES = {
    "section-header": "heading",
    "page-header": "header",
    "page-footer": "footer",
    "list-group": "list",
    "list-item": "list",
    "figure": "image",
    "picture": "image",
    "image": "image",
    "equation-block": "equation",
    "formula": "equation",
    "code-block": "code",
    "chemical-block": "chemistry",
    "table-of-contents": "table-of-contents",
    "complex-block": "complex-block",
    "blank-page": "blank-page",
}
# Categories whose fidelity lives in markup (tables, math, lists, ...) — keep the
# inner HTML in the rendered Markdown instead of flattening to text.
HTML_PRESERVING = {"table", "complex-block", "list", "diagram", "chemistry", "form", "equation", "code"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Chandra OCR 2 on rendered PDF pages")
    parser.add_argument("--model", help="Served model id (with --endpoint) or local MLX model directory")
    parser.add_argument(
        "--endpoint",
        help="OpenAI-compatible base URL, e.g. http://localhost:11434/v1 for Ollama (also LM Studio / "
        "vLLM / LiteLLM). When set, inference POSTs {endpoint}/chat/completions with --model as the "
        "served model id — no venv/mlx-vlm needed, stdlib HTTP only.",
    )
    parser.add_argument(
        "--api-key",
        default="",
        help="Bearer token for the endpoint (Ollama needs none; vLLM / LiteLLM / gateways may).",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--page-output-directory", required=True)
    parser.add_argument("--page-progress", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--images", nargs="+", required=True)
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Exercise the render->project contract without loading model weights",
    )
    return parser.parse_args()


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def canonical_category(raw_label: str) -> str:
    normalized = re.sub(r"\s+", "-", raw_label.strip().lower()).strip("-")
    if not normalized:
        return "text"
    return CATEGORY_ALIASES.get(normalized, normalized)


def normalized_bbox(values: list[float]) -> dict[str, float | str]:
    x1, y1, x2, y2 = [min(max(value, 0.0), 1000.0) for value in values]
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    return {
        "x": round(left / 1000.0, 6),
        "y": round(top / 1000.0, 6),
        "width": round((right - left) / 1000.0, 6),
        "height": round((bottom - top) / 1000.0, 6),
        "unit": "normalized",
        "origin": "top-left",
    }


_VOID_TAGS = {"br", "img", "hr", "input", "meta", "link", "col", "area", "base", "source", "wbr"}


class _DataBboxExtractor(HTMLParser):
    """Collect every element carrying data-bbox as a block, in document order.

    Tracks the full element stack (not just data-bbox elements) so a block closes
    on its OWN end tag, not the first inner one — inner HTML (via source offsets)
    keeps tables/math intact. Tolerant of void elements and stray/missing closes.
    Inner blocks' flattened text bubbles up to their enclosing block.
    """

    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self._source = source
        self._line_starts = [0]
        for line in source.splitlines(keepends=True):
            self._line_starts.append(self._line_starts[-1] + len(line))
        self.blocks: list[dict[str, Any]] = []
        self._stack: list[dict[str, Any]] = []

    def _offset(self) -> int:
        line, col = self.getpos()
        return self._line_starts[line - 1] + col

    def _finalize(self, frame: dict[str, Any], end_offset: int) -> None:
        inner_html = self._source[frame["inner_start"]:end_offset].strip()
        text = re.sub(r"\s+", " ", "".join(frame["text_parts"])).strip()
        self.blocks.append({
            "label": frame["label"], "bbox_raw": frame["bbox_raw"], "html": inner_html, "text": text,
        })
        for parent in reversed(self._stack):
            if parent.get("is_bbox"):
                parent["text_parts"].append(text)
                break

    def handle_starttag(self, tag, attrs):
        if tag in _VOID_TAGS:
            return
        a = dict(attrs)
        frame: dict[str, Any] = {"tag": tag, "is_bbox": "data-bbox" in a}
        if frame["is_bbox"]:
            start_tag_text = self.get_starttag_text() or ""
            frame["label"] = a.get("data-label")
            frame["bbox_raw"] = a.get("data-bbox", "")
            frame["inner_start"] = self._offset() + len(start_tag_text)
            frame["text_parts"] = []
        self._stack.append(frame)

    def handle_data(self, data):
        if not data.strip():
            return
        for frame in reversed(self._stack):
            if frame.get("is_bbox"):
                frame["text_parts"].append(data)
                break

    def handle_endtag(self, tag):
        if tag in _VOID_TAGS:
            return
        idx = next((i for i in range(len(self._stack) - 1, -1, -1) if self._stack[i]["tag"] == tag), None)
        if idx is None:
            return
        end_offset = self._offset()
        popped = self._stack[idx:]
        del self._stack[idx:]
        for frame in reversed(popped):
            if frame.get("is_bbox"):
                self._finalize(frame, end_offset)

    def finalize_open(self) -> None:
        """Close any data-bbox elements the model left unterminated at EOF."""
        for frame in reversed(self._stack):
            if frame.get("is_bbox"):
                self._finalize(frame, len(self._source))
        self._stack.clear()


_BBOX_NUM = re.compile(r"-?\d+(?:\.\d+)?")


def block_markdown(block: dict[str, Any]) -> str:
    text = (block["text"] or "").strip()
    inner_html = (block.get("html") or "").strip()
    category = block["type"]
    if not text and not inner_html:
        return ""
    if category in HTML_PRESERVING and inner_html:
        return inner_html
    if category == "heading":
        return text if text.startswith("#") else f"### {text}"
    if category == "header":
        return text if text.startswith("#") else f"#### {text}"
    if category == "caption":
        return text if text.startswith("_") else f"_{text}_"
    if category == "image":
        return f"> Figure: {text}" if text else ""
    return text


def parse_model_output(raw_text: str, page_number: int, image_file: str) -> dict[str, Any]:
    """Project Chandra HTML (chandra-html-v1) into the canonical page/block schema."""
    raw = raw_text.strip()
    # mlx-vlm doesn't reliably halt on Chandra's turn-end token (the tokenizer's
    # eos is <|im_end|> but generation_config pins a different eos id), so the
    # model re-parses the page in a new turn. Keep only the first turn — the loop
    # tail can never reach the projection.
    cut = min(
        (i for i in (raw.find(m) for m in ("<|im_end|>", "<|im_start|>", "<|endoftext|>")) if i != -1),
        default=-1,
    )
    if cut != -1:
        raw = raw[:cut].strip()
    # Chandra occasionally wraps output in a ```html fence — strip it.
    fenced = re.match(r"^```[a-zA-Z]*\n(.*)\n```$", raw, re.DOTALL)
    if fenced:
        raw = fenced.group(1).strip()

    extractor = _DataBboxExtractor(raw)
    extractor.feed(raw)
    extractor.finalize_open()

    blocks: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    duplicate_block_count = 0
    consecutive_duplicate_count = 0
    longest_duplicate_run = 0

    for candidate in extractor.blocks:
        nums = [float(n) for n in _BBOX_NUM.findall(candidate["bbox_raw"] or "")]
        source_bbox = nums[:4] if len(nums) >= 4 else None
        text = html_lib.unescape(candidate["text"] or "").strip()
        inner_html = candidate["html"] or ""
        if not text and not inner_html.strip():
            continue
        category = canonical_category(candidate["label"] or "text")
        collapsed_text = re.sub(r"\s+", " ", text).strip()
        bbox_key = tuple(round(v, 3) for v in source_bbox) if source_bbox else None
        signature = (category, bbox_key, collapsed_text or inner_html)
        if signature in seen:
            duplicate_block_count += 1
            consecutive_duplicate_count += 1
            longest_duplicate_run = max(longest_duplicate_run, consecutive_duplicate_count)
            continue
        consecutive_duplicate_count = 0
        seen.add(signature)
        block_number = len(blocks) + 1
        blocks.append({
            "id": f"page-{page_number}-block-{block_number}",
            "type": category,
            "sourceType": (candidate["label"] or "Text").strip() or "Text",
            "text": text,
            "html": inner_html,
            "bbox": normalized_bbox(source_bbox) if source_bbox else None,
            "sourceBbox": [round(v, 3) for v in source_bbox] if source_bbox else None,
            "sourceBboxScale": 1000 if source_bbox else None,
        })

    loop_detected = longest_duplicate_run >= 3 or duplicate_block_count >= 8
    warnings: list[str] = []
    if duplicate_block_count:
        warnings.append(
            f"Removed {duplicate_block_count} duplicate layout block"
            f"{'s' if duplicate_block_count != 1 else ''}."
        )
    if loop_detected:
        warnings.append("Truncated a repeated generation tail.")
    if not blocks and raw:
        warnings.append("No data-bbox layout blocks detected; kept raw output as a single text block.")
        blocks.append({
            "id": f"page-{page_number}-block-1",
            "type": "text",
            "sourceType": "Text",
            "text": html_lib.unescape(re.sub(r"<[^>]+>", " ", raw)).strip(),
            "html": raw,
            "bbox": None,
            "sourceBbox": None,
            "sourceBboxScale": None,
        })

    markdown_parts = [block_markdown(block) for block in blocks]
    markdown = "\n\n".join(part for part in markdown_parts if part).strip()
    plain_text = "\n".join(block["text"] for block in blocks if block["text"]).strip()
    return {
        "pageNumber": page_number,
        "imageFile": image_file,
        "markdown": markdown,
        "plainText": plain_text,
        "blocks": blocks,
        "diagnostics": {
            "rawCharacterCount": len(raw_text),
            "blockCount": len(blocks),
            "duplicateBlockCount": duplicate_block_count,
            "loopDetected": loop_detected,
            "warnings": warnings,
        },
    }


def document_payload(title, total_page_count, pages, complete, simulation) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "object": "local_extraction",
        "provider": {"id": "chandra", "name": "Chandra OCR 2"},
        "title": title,
        "pageCount": total_page_count,
        "completedPageCount": len(pages),
        "complete": complete,
        "simulation": simulation,
        "pages": pages,
    }


def persist_page(page_output_directory: Path, page_number: int, markdown: str, structured_page: dict[str, Any]) -> None:
    write_atomic(page_output_directory / f"page-{page_number:04d}.md", markdown.rstrip("\n") + "\n")
    write_atomic(
        page_output_directory / f"page-{page_number:04d}.json",
        json.dumps(structured_page, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
    )


def load_persisted_page(page_output_directory: Path, page_number: int) -> dict[str, Any] | None:
    markdown_path = page_output_directory / f"page-{page_number:04d}.md"
    json_path = page_output_directory / f"page-{page_number:04d}.json"
    if not markdown_path.exists() or not json_path.exists():
        return None
    try:
        page = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return page if isinstance(page, dict) else None


def persist_document_outputs(output, structured_output, page_output_directory, header, title, total_page_count, pages, simulation) -> None:
    ordered_pages = sorted(pages, key=lambda page: int(page["pageNumber"]))
    markdown_sections = [
        (page_output_directory / f"page-{int(page['pageNumber']):04d}.md").read_text(encoding="utf-8").strip()
        for page in ordered_pages
    ]
    markdown = header.strip() + "\n\n"
    if markdown_sections:
        markdown += "\n\n".join(markdown_sections) + "\n"
    write_atomic(output, markdown)
    write_atomic(
        structured_output,
        json.dumps(
            document_payload(title, total_page_count, ordered_pages, complete=len(ordered_pages) == total_page_count, simulation=simulation),
            indent=2, sort_keys=True, ensure_ascii=False,
        ) + "\n",
    )


def update_page_progress(progress_path: Path, page_number: int, status: str, completed_page_count: int) -> None:
    manifest = json.loads(progress_path.read_text(encoding="utf-8"))
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    manifest["updatedAt"] = timestamp
    manifest["completedPageCount"] = completed_page_count
    manifest["currentPageNumber"] = page_number
    manifest["currentPageStatus"] = status
    manifest["errorMessage"] = None
    if status == "succeeded":
        manifest["lastCompletedPageNumber"] = page_number
        manifest["lastCompletedAt"] = timestamp
    write_atomic(progress_path, json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def run(images, title, output, page_output_directory, page_progress, structured_output, simulation, infer) -> None:
    structured_pages: list[dict[str, Any]] = []
    header = f"# {title}"
    if simulation:
        header = "\n\n".join([
            f"# {title}",
            "> Simulation: Chandra OCR 2 model weights were not loaded.",
        ])
    for page_number, image_path in enumerate(images, start=1):
        persisted_page = load_persisted_page(page_output_directory, page_number)
        if persisted_page is not None:
            structured_pages.append(persisted_page)
            persist_document_outputs(output, structured_output, page_output_directory, header, title, len(images), structured_pages, simulation)
            update_page_progress(page_progress, page_number, "succeeded", len(structured_pages))
            print(f"Restored page {page_number} of {len(images)}", flush=True)
            continue
        update_page_progress(page_progress, page_number, "processing", page_number - 1)
        raw_text = infer(image_path, page_number)
        structured_page = parse_model_output(raw_text, page_number=page_number, image_file=Path(image_path).name)
        structured_pages.append(structured_page)
        section = f"## Page {page_number}\n\n{structured_page['markdown']}"
        persist_page(page_output_directory, page_number, section, structured_page)
        persist_document_outputs(output, structured_output, page_output_directory, header, title, len(images), structured_pages, simulation)
        update_page_progress(page_progress, page_number, "succeeded", page_number)
        print(f"Processed page {page_number} of {len(images)}", flush=True)


def make_openai_infer(base_url: str, model_id: str, api_key: str):
    """Infer via an OpenAI-compatible /chat/completions endpoint (Ollama, LM Studio,
    vLLM, LiteLLM, ...) — stdlib only, no venv/mlx-vlm. Mirrors Docling's ApiVlmOptions
    and june's local-endpoint client: one page image per request as an image_url data URL.

    reasoning_effort=none disables "thinking" on reasoning-capable builds (e.g. the
    Ollama Chandra build) so the layout HTML lands in message.content, not a reasoning
    field. Context must be sized on the served model — with Ollama, bake PARAMETER
    num_ctx via a Modelfile, since /v1 ignores a per-request num_ctx.
    """
    import base64
    import urllib.request

    endpoint = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"

    def infer(image_path: str, page_number: int) -> str:
        image_b64 = base64.b64encode(Path(image_path).read_bytes()).decode("ascii")
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": OCR_LAYOUT_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
            ]}],
            "temperature": 0,
            "max_tokens": 4000,
            "reasoning_effort": "none",
        }
        request = urllib.request.Request(
            endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers
        )
        with urllib.request.urlopen(request, timeout=1800) as response:
            body = json.load(response)
        return body["choices"][0]["message"].get("content") or ""

    return infer


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    page_output_directory = Path(args.page_output_directory)
    page_progress = Path(args.page_progress)
    structured_output = output.with_suffix(".json")
    page_output_directory.mkdir(parents=True, exist_ok=True)

    if args.simulate:
        def infer(image_path: str, page_number: int) -> str:
            name = Path(image_path).name
            return (
                f'<div data-bbox="80 60 920 140" data-label="Section-Header">Simulated Chandra page {page_number}</div>'
                f'<div data-bbox="80 160 920 900" data-label="Text">Simulated projection for {name}. '
                f'Weights were not loaded.</div>'
            )
        run(args.images, args.title, output, page_output_directory, page_progress, structured_output, True, infer)
        return

    if args.endpoint:
        infer = make_openai_infer(args.endpoint, args.model, args.api_key)
        run(args.images, args.title, output, page_output_directory, page_progress, structured_output, False, infer)
        return

    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    model, processor = load(args.model)
    config = load_config(args.model)

    def infer(image_path: str, page_number: int) -> str:
        prompt = apply_chat_template(processor, config, OCR_LAYOUT_PROMPT, num_images=1)
        # Greedy decoding on a dense page makes Chandra re-parse the page in a loop
        # (mlx-vlm doesn't halt on its <|im_end|>). A repetition penalty + a per-page
        # token cap (~one dense page) keep it to a single clean pass; the projection
        # also truncates any residual loop tail at the ChatML terminator.
        result = generate(
            model, processor, prompt, [image_path],
            max_tokens=3000, temperature=0.0,
            repetition_penalty=1.2, repetition_context_size=64,
            cropping=False, image_size=1024, verbose=False,
        )
        return result.text if hasattr(result, "text") else str(result)

    run(args.images, args.title, output, page_output_directory, page_progress, structured_output, False, infer)


if __name__ == "__main__":
    main()
