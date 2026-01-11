#!/usr/bin/env python3
"""
Generate macOS app icon with proper Big Sur+ squircle mask.
Uses the continuous corner (superellipse) shape that Apple uses.
"""

import subprocess
import sys
from pathlib import Path

# Check for PIL
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

import math

def superellipse_mask(size, n=5):
    """
    Create a superellipse (squircle) mask.
    n=5 closely approximates Apple's continuous corner radius.
    Apple's actual formula is more complex, but n=5 is a good approximation.
    """
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)

    center = size / 2
    radius = size / 2

    # Generate superellipse points
    points = []
    num_points = 1000
    for i in range(num_points):
        t = 2 * math.pi * i / num_points
        # Superellipse formula: |x/a|^n + |y/b|^n = 1
        # Parametric form:
        cos_t = math.cos(t)
        sin_t = math.sin(t)
        x = center + radius * (abs(cos_t) ** (2/n)) * (1 if cos_t >= 0 else -1)
        y = center + radius * (abs(sin_t) ** (2/n)) * (1 if sin_t >= 0 else -1)
        points.append((x, y))

    draw.polygon(points, fill=255)
    return mask


def apple_squircle_mask(size):
    """
    Create Apple's iOS/macOS squircle mask using the exact corner radius ratio.
    macOS Big Sur uses ~22.37% continuous corner radius.
    """
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)

    # Apple's corner radius is approximately 22.37% of the icon size
    # But we use superellipse for the continuous curve
    corner_ratio = 0.2237
    corner_radius = int(size * corner_ratio)

    # For a proper squircle, we use a high-quality superellipse
    # with n ≈ 4-5 which matches Apple's curve closely
    return superellipse_mask(size, n=4.5)


def apply_mask_to_image(image, mask):
    """Apply the squircle mask to an image."""
    # Ensure image is RGBA
    if image.mode != 'RGBA':
        image = image.convert('RGBA')

    # Resize mask to match image
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.Resampling.LANCZOS)

    # Apply mask to alpha channel
    r, g, b, a = image.split()
    # Combine existing alpha with mask
    new_alpha = Image.composite(a, Image.new('L', image.size, 0), mask)
    image.putalpha(mask)

    return image


def generate_iconset(source_path, output_dir):
    """Generate all required icon sizes for macOS .iconset"""

    source = Image.open(source_path)
    if source.mode != 'RGBA':
        source = source.convert('RGBA')

    # Create the mask at source size
    print(f"Creating squircle mask for {source.size[0]}x{source.size[1]} source...")
    mask = apple_squircle_mask(source.size[0])

    # Apply mask to source
    masked_source = apply_mask_to_image(source.copy(), mask)

    # Icon sizes required for macOS .iconset
    # Format: (size, scale, filename)
    icon_sizes = [
        (16, 1, "icon_16x16.png"),
        (16, 2, "icon_16x16@2x.png"),
        (32, 1, "icon_32x32.png"),
        (32, 2, "icon_32x32@2x.png"),
        (128, 1, "icon_128x128.png"),
        (128, 2, "icon_128x128@2x.png"),
        (256, 1, "icon_256x256.png"),
        (256, 2, "icon_256x256@2x.png"),
        (512, 1, "icon_512x512.png"),
        (512, 2, "icon_512x512@2x.png"),
    ]

    # Create iconset directory
    iconset_dir = output_dir / "icon.iconset"
    iconset_dir.mkdir(parents=True, exist_ok=True)

    for base_size, scale, filename in icon_sizes:
        actual_size = base_size * scale
        print(f"Generating {filename} ({actual_size}x{actual_size})...")

        # Resize from masked source
        resized = masked_source.resize((actual_size, actual_size), Image.Resampling.LANCZOS)
        resized.save(iconset_dir / filename, 'PNG')

    return iconset_dir


def create_icns(iconset_dir, output_path):
    """Use iconutil to create .icns from .iconset"""
    print(f"Creating {output_path}...")
    result = subprocess.run(
        ['iconutil', '-c', 'icns', str(iconset_dir), '-o', str(output_path)],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    return True


def main():
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    assets_dir = project_dir / "assets"

    # Source image - use the high-res 1024x1024
    source_path = assets_dir / "icons" / "1024x1024.png"

    if not source_path.exists():
        # Fall back to logo-source.jpeg
        source_path = assets_dir / "logo-source.jpeg"

    if not source_path.exists():
        print(f"Error: No source image found at {source_path}")
        sys.exit(1)

    print(f"Using source: {source_path}")

    # Generate iconset
    iconset_dir = generate_iconset(source_path, assets_dir)

    # Create .icns
    icns_path = assets_dir / "icon.icns"
    if create_icns(iconset_dir, icns_path):
        print(f"✓ Created {icns_path}")

    # Also save the masked 1024x1024 as the main icon.png
    source = Image.open(source_path).convert('RGBA')
    mask = apple_squircle_mask(source.size[0])
    masked = apply_mask_to_image(source, mask)

    # Save various sizes
    for size, name in [(1024, "1024x1024.png"), (512, "512x512.png"), (256, "icon.png")]:
        resized = masked.resize((size, size), Image.Resampling.LANCZOS)
        output_path = assets_dir / name if name == "icon.png" else assets_dir / "icons" / name
        resized.save(output_path, 'PNG')
        print(f"✓ Saved {output_path}")

    print("\nDone! Your macOS icon now has the proper squircle shape.")
    print("Rebuild your app to see the changes.")


if __name__ == "__main__":
    main()
