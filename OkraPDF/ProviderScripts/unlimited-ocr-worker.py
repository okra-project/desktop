#!/usr/bin/env python3
import argparse
from pathlib import Path

from mlx_vlm import generate, load
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Unlimited-OCR on rendered PDF pages")
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--images", nargs="+", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
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
