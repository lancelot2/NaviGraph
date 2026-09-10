#!/usr/bin/env python3
"""End-to-end offline example: load a bundle and generate navigation context.

Runs with no network, no model, and no OpenAI key — the zero-vision path.

    pip install navigraph        # or: pip install -e ../sdk/python
    python quickstart.py
"""

from pathlib import Path

from navigraph import OfflineBackend

BUNDLE = Path(__file__).parent / "sample_building.navigraph.json"


def main() -> None:
    ng = OfflineBackend.from_file(BUNDLE)

    # The robot already knows its room (e.g. from Nav2/AMCL): pass it directly.
    result = ng.context(
        "take me to the supply room",
        current_location="lobby",
    )

    print(f"current_location: {result.current_location}")
    print(f"destination:      {result.destination}")
    print(f"path:             {' -> '.join(result.path)}")
    print(f"landmarks:        {', '.join(result.landmarks) or '(none)'}")
    print("\n--- context ---")
    print(result.context)


if __name__ == "__main__":
    main()
