import importlib.util
import tempfile
import unittest
from pathlib import Path


def load_appcast_module():
    script_path = (
        Path(__file__).resolve().parents[2]
        / "scripts"
        / "insert-appcast-item.py"
    )
    spec = importlib.util.spec_from_file_location("insert_appcast_item", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


appcast = load_appcast_module()

SEED_FEED = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>okraPDF Desktop Updates</title>
    <link>https://raw.githubusercontent.com/okra-project/desktop/main/appcast.xml</link>
    <description>In-app beta updates for the okraPDF desktop app.</description>
    <language>en</language>
  </channel>
</rss>
"""


def make_item(**overrides):
    kwargs = {
        "version": "0.5.0-beta.16",
        "build_number": "2026072808",
        "tag": "desktop-v0.5.0-beta.16",
        "pub_date": "Tue, 28 Jul 2026 08:10:00 +0000",
        "enclosure_url": "https://github.com/okra-project/desktop/releases/download/desktop-v0.5.0-beta.16/Okra-0.5.0-beta.16.dmg",
        "ed_signature": "c2ln",
        "length": 42,
    }
    kwargs.update(overrides)
    return appcast.build_item(**kwargs)


class InsertAppcastItemTests(unittest.TestCase):
    def write_feed(self, directory: str, contents: str = SEED_FEED) -> Path:
        path = Path(directory) / "appcast.xml"
        path.write_text(contents, encoding="utf-8")
        return path

    def test_inserts_signed_item_into_seed_feed(self):
        import xml.etree.ElementTree as ET

        with tempfile.TemporaryDirectory() as directory:
            path = self.write_feed(directory)
            appcast.insert_item(path, make_item())

            channel = ET.parse(path).getroot().find("channel")
            items = channel.findall("item")
            self.assertEqual(len(items), 1)

            item = items[0]
            sparkle = appcast.SPARKLE_NS
            self.assertEqual(item.findtext("title"), "okraPDF Desktop v0.5.0-beta.16")
            self.assertEqual(item.findtext(f"{{{sparkle}}}version"), "2026072808")
            self.assertEqual(
                item.findtext(f"{{{sparkle}}}shortVersionString"), "0.5.0-beta.16"
            )
            self.assertEqual(
                item.findtext(f"{{{sparkle}}}minimumSystemVersion"), "13.0"
            )
            self.assertEqual(
                item.findtext("link"),
                "https://github.com/okra-project/desktop/releases/tag/desktop-v0.5.0-beta.16",
            )

            enclosure = item.find("enclosure")
            self.assertEqual(enclosure.get(f"{{{sparkle}}}edSignature"), "c2ln")
            self.assertEqual(enclosure.get("length"), "42")
            self.assertTrue(
                enclosure.get("url").endswith(
                    "desktop-v0.5.0-beta.16/Okra-0.5.0-beta.16.dmg"
                )
            )

    def test_newest_item_lands_before_older_items(self):
        import xml.etree.ElementTree as ET

        with tempfile.TemporaryDirectory() as directory:
            path = self.write_feed(directory)
            appcast.insert_item(path, make_item())
            appcast.insert_item(
                path,
                make_item(
                    version="0.5.0-beta.17",
                    build_number="2026072908",
                    tag="desktop-v0.5.0-beta.17",
                ),
            )

            channel = ET.parse(path).getroot().find("channel")
            items = channel.findall("item")
            self.assertEqual(len(items), 2)
            self.assertEqual(
                items[0].findtext(f"{{{appcast.SPARKLE_NS}}}shortVersionString"),
                "0.5.0-beta.17",
            )

    def test_same_build_replaces_instead_of_duplicating(self):
        import xml.etree.ElementTree as ET

        with tempfile.TemporaryDirectory() as directory:
            path = self.write_feed(directory)
            appcast.insert_item(path, make_item(ed_signature="b2xk"))
            appcast.insert_item(path, make_item(ed_signature="bmV3"))

            channel = ET.parse(path).getroot().find("channel")
            items = channel.findall("item")
            self.assertEqual(len(items), 1)
            self.assertEqual(
                items[0].find("enclosure").get(
                    f"{{{appcast.SPARKLE_NS}}}edSignature"
                ),
                "bmV3",
            )

    def test_output_is_well_formed_xml_with_namespaces(self):
        import xml.etree.ElementTree as ET

        with tempfile.TemporaryDirectory() as directory:
            path = self.write_feed(directory)
            appcast.insert_item(path, make_item())
            root = ET.parse(path).getroot()
            self.assertEqual(root.tag, "rss")
            raw = path.read_text(encoding="utf-8")
            self.assertIn("xmlns:sparkle", raw)
            self.assertIn("<?xml version=", raw)


if __name__ == "__main__":
    unittest.main()
