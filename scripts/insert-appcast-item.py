#!/usr/bin/env python3
"""Insert a signed Sparkle appcast item into appcast.xml.

The release workflow calls this after notarizing the DMG so every published
prerelease adds one EdDSA-signed item to the feed the desktop app polls.
"""
import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"
DC_NS = "http://purl.org/dc/elements/1.1/"

ET.register_namespace("sparkle", SPARKLE_NS)
ET.register_namespace("dc", DC_NS)


def build_item(
    *,
    version: str,
    build_number: str,
    tag: str,
    pub_date: str,
    enclosure_url: str,
    ed_signature: str,
    length: int,
    minimum_system_version: str = "13.0",
) -> ET.Element:
    item = ET.Element("item")

    title = ET.SubElement(item, "title")
    title.text = f"okraPDF Desktop v{version}"

    sparkle_version = ET.SubElement(item, f"{{{SPARKLE_NS}}}version")
    sparkle_version.text = build_number

    short_version = ET.SubElement(item, f"{{{SPARKLE_NS}}}shortVersionString")
    short_version.text = version

    pub_date_el = ET.SubElement(item, "pubDate")
    pub_date_el.text = pub_date

    link = ET.SubElement(item, "link")
    link.text = f"https://github.com/okra-project/desktop/releases/tag/{tag}"

    minimum = ET.SubElement(item, f"{{{SPARKLE_NS}}}minimumSystemVersion")
    minimum.text = minimum_system_version

    ET.SubElement(
        item,
        "enclosure",
        {
            "url": enclosure_url,
            f"{{{SPARKLE_NS}}}edSignature": ed_signature,
            "length": str(length),
            "type": "application/octet-stream",
        },
    )
    return item


def insert_item(appcast_path: Path, item: ET.Element) -> None:
    tree = ET.parse(appcast_path)
    channel = tree.getroot().find("channel")
    if channel is None:
        raise ValueError(f"{appcast_path} has no <channel> element")

    # Replace an existing item for the same build (release re-run), otherwise
    # insert newest-first directly after the channel metadata.
    build_number = item.findtext(f"{{{SPARKLE_NS}}}version")
    existing_items = channel.findall("item")
    for existing in existing_items:
        if existing.findtext(f"{{{SPARKLE_NS}}}version") == build_number:
            channel.remove(existing)
            break

    insert_at = next(
        (index + 1 for index, child in enumerate(channel) if child.tag == "language"),
        len(channel) - len(existing_items),
    )
    channel.insert(insert_at, item)
    ET.indent(tree, space="  ")
    tree.write(appcast_path, encoding="utf-8", xml_declaration=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--appcast", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--build-number", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--pub-date", required=True)
    parser.add_argument("--enclosure-url", required=True)
    parser.add_argument("--ed-signature", required=True)
    parser.add_argument("--length", required=True, type=int)
    args = parser.parse_args()

    item = build_item(
        version=args.version,
        build_number=args.build_number,
        tag=args.tag,
        pub_date=args.pub_date,
        enclosure_url=args.enclosure_url,
        ed_signature=args.ed_signature,
        length=args.length,
    )
    insert_item(args.appcast, item)
    return 0


if __name__ == "__main__":
    sys.exit(main())
