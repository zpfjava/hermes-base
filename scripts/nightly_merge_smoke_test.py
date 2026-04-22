"""Nightly merge workflow smoke-test marker.

This file exists only to create a safe, low-risk real change on the dev branch
so the automated dev→master PR and merge workflow can be verified end to end.
"""

from datetime import datetime, timezone


def build_test_marker() -> dict:
    return {
        "name": "nightly-merge-smoke-test",
        "purpose": "verify automated dev-to-master workflow",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    print(build_test_marker())
