#!/usr/bin/env python3
import argparse
import os
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Baidu Unlimited-OCR on rendered PDF pages")
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--images", nargs="+", required=True)
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Exercise the PDF-to-worker contract without loading model weights",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.simulate:
        sections = [
            f"# {args.title}",
            "",
            "> Simulation: Baidu Unlimited-OCR model weights were not loaded.",
            "",
            (
                "Offline flags: "
                f"HF_HUB_OFFLINE={os.environ.get('HF_HUB_OFFLINE', '')}, "
                f"TRANSFORMERS_OFFLINE={os.environ.get('TRANSFORMERS_OFFLINE', '')}, "
                f"HF_DATASETS_OFFLINE={os.environ.get('HF_DATASETS_OFFLINE', '')}."
            ),
        ]
        for page_number, image_path in enumerate(args.images, start=1):
            sections.append(
                f"## Page {page_number}\n\n"
                f"Simulated local OCR for `{Path(image_path).name}`."
            )
            print(f"Processed page {page_number} of {len(args.images)}", flush=True)

        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("\n\n".join(sections) + "\n", encoding="utf-8")
        return

    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    model, processor = load(args.model)
    config = load_config(args.model)
    sections = [f"# {args.title}"]

    for page_number, image_path in enumerate(args.images, start=1):
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
        sections.append(f"## Page {page_number}\n\n{text.strip()}")
        print(f"Processed page {page_number} of {len(args.images)}", flush=True)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n\n".join(sections) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
