"""A small JSON-backed store mapping resume fields to their allowed values.

Keys are stable, human-readable strings like:
    "Education > #0 > Dates"
    "Industry Experience > #1 > bullet 0"
so the JSON file stays easy to hand-edit -- add more alternatives for any
field by just appending strings to its list.
"""

from __future__ import annotations

import json
from pathlib import Path


def field_key(section_title: str, entry_idx: int, field_name: str) -> str:
    return f"{section_title} > #{entry_idx} > {field_name}"


def bullet_key(section_title: str, entry_idx: int, bullet_idx: int) -> str:
    return f"{section_title} > #{entry_idx} > bullet {bullet_idx}"


def raw_key(section_title: str) -> str:
    return f"{section_title} > content"


def load_options(path: Path) -> dict[str, list[str]]:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_options(path: Path, options: dict[str, list[str]]) -> None:
    path.write_text(json.dumps(options, indent=2, ensure_ascii=False) + "\n")
