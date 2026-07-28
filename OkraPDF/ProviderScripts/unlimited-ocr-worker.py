#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Baidu Unlimited-OCR on rendered PDF pages")
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--page-output-directory", required=True)
    parser.add_argument("--page-progress", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--images", nargs="+", required=True)
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Exercise the PDF-to-worker contract without loading model weights",
    )
    return parser.parse_args()


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def persist_page(page_output_directory: Path, page_number: int, markdown: str) -> None:
    write_atomic(
        page_output_directory / f"page-{page_number:04d}.md",
        markdown.rstrip("\n") + "\n",
    )


def append_page(output: Path, markdown: str) -> None:
    with output.open("a", encoding="utf-8") as output_file:
        output_file.write(markdown.rstrip("\n") + "\n\n")


def update_page_progress(
    progress_path: Path,
    page_number: int,
    status: str,
    completed_page_count: int,
) -> None:
    manifest = json.loads(progress_path.read_text(encoding="utf-8"))
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )
    manifest["updatedAt"] = timestamp
    manifest["completedPageCount"] = completed_page_count
    manifest["currentPageNumber"] = page_number
    manifest["currentPageStatus"] = status
    manifest["errorMessage"] = None
    if status == "succeeded":
        manifest["lastCompletedPageNumber"] = page_number
        manifest["lastCompletedAt"] = timestamp
    write_atomic(
        progress_path,
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
    )


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    page_output_directory = Path(args.page_output_directory)
    page_progress = Path(args.page_progress)
    page_output_directory.mkdir(parents=True, exist_ok=True)

    if args.simulate:
        header = "\n\n".join([
            f"# {args.title}",
            "> Simulation: Baidu Unlimited-OCR model weights were not loaded.",
            (
                "Offline flags: "
                f"HF_HUB_OFFLINE={os.environ.get('HF_HUB_OFFLINE', '')}, "
                f"TRANSFORMERS_OFFLINE={os.environ.get('TRANSFORMERS_OFFLINE', '')}, "
                f"HF_DATASETS_OFFLINE={os.environ.get('HF_DATASETS_OFFLINE', '')}."
            ),
        ])
        write_atomic(output, header + "\n\n")
        for page_number, image_path in enumerate(args.images, start=1):
            update_page_progress(
                page_progress,
                page_number,
                "processing",
                page_number - 1,
            )
            section = (
                f"## Page {page_number}\n\n"
                f"Simulated local OCR for `{Path(image_path).name}`."
            )
            persist_page(page_output_directory, page_number, section)
            append_page(output, section)
            update_page_progress(
                page_progress,
                page_number,
                "succeeded",
                page_number,
            )
            print(f"Processed page {page_number} of {len(args.images)}", flush=True)
        return

    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    model, processor = load(args.model)
    config = load_config(args.model)
    write_atomic(output, f"# {args.title}\n\n")

    for page_number, image_path in enumerate(args.images, start=1):
        update_page_progress(
            page_progress,
            page_number,
            "processing",
            page_number - 1,
        )
        prompt = apply_chat_template(
            processor,
            config,
            "document parsing.",
            num_images=1,
        )
        result = generate(
            model,
            processor,
            prompt,
            [image_path],
            max_tokens=8192,
            temperature=0.0,
            cropping=False,
            image_size=1024,
            verbose=False,
        )
        text = result.text if hasattr(result, "text") else str(result)
        section = f"## Page {page_number}\n\n{text.strip()}"
        persist_page(page_output_directory, page_number, section)
        append_page(output, section)
        update_page_progress(
            page_progress,
            page_number,
            "succeeded",
            page_number,
        )
        print(f"Processed page {page_number} of {len(args.images)}", flush=True)


if __name__ == "__main__":
    main()
