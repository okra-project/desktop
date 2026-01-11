#!/usr/bin/env python3
"""
Query FinePDFs dataset for SEC 10-K filings without downloading everything.
Uses HuggingFace datasets streaming with text content filtering.
"""

from datasets import load_dataset
import re

def is_10k_filing(doc):
    """Check if document is likely a 10-K annual report."""
    url = (doc.get('url') or '').lower()
    text = (doc.get('text') or '')[:5000]  # Check first 5k chars

    # URL patterns for SEC EDGAR
    url_patterns = [
        'sec.gov/archives/edgar',
        '/10-k',
        '/10k',
    ]

    # Text patterns indicating 10-K
    text_patterns = [
        r'form\s+10-?k',
        r'annual\s+report.*form\s+10',
        r'securities\s+and\s+exchange\s+commission.*10-?k',
        r'pursuant\s+to\s+section\s+13',
    ]

    # Check URL
    if any(p in url for p in url_patterns):
        return True

    # Check text content (case insensitive)
    text_lower = text.lower()
    for pattern in text_patterns:
        if re.search(pattern, text_lower):
            return True

    return False


def main():
    print("Loading FinePDFs eng_Latn in streaming mode...")

    ds = load_dataset(
        "HuggingFaceFW/finepdfs",
        "eng_Latn",
        streaming=True,
        split="train"
    )

    found = []
    scanned = 0
    max_scan = 50000  # Scan up to 50k docs
    max_results = 20

    print(f"Scanning up to {max_scan:,} documents for 10-K filings...\n")

    for doc in ds:
        scanned += 1

        if scanned % 5000 == 0:
            print(f"  Scanned {scanned:,} docs, found {len(found)} 10-Ks...")

        if is_10k_filing(doc):
            found.append(doc)
            url = doc.get('url', 'N/A')
            tokens = doc.get('token_count', 0)
            text_preview = (doc.get('text') or '')[:200].replace('\n', ' ')

            print(f"\n[{len(found)}] {url}")
            print(f"    Tokens: {tokens:,}")
            print(f"    Preview: {text_preview}...")

            if len(found) >= max_results:
                break

        if scanned >= max_scan:
            break

    print(f"\n{'='*60}")
    print(f"Scanned: {scanned:,} documents")
    print(f"Found: {len(found)} potential 10-K filings")

    if found:
        import json
        from pathlib import Path

        # Save full results
        output_path = Path(__file__).parent / "finepdfs-10k-results.json"

        # Convert to serializable format (remove non-JSON types)
        results = []
        for doc in found:
            results.append({
                'url': doc.get('url'),
                'token_count': doc.get('token_count'),
                'date': doc.get('date'),
                'extractor': doc.get('extractor'),
                'text': doc.get('text'),  # Full text
                'id': doc.get('id'),
                'language': doc.get('language'),
                'dump': doc.get('dump'),
            })

        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\nSaved to: {output_path}")
        print("\nURLs:")
        for doc in found:
            print(f"  - {doc.get('url', 'N/A')}")


if __name__ == "__main__":
    main()
