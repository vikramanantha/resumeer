"""Dump resume_full.tex into a static JSON structure for the browser-based
(no-server) editor at index.html. Re-run whenever resume_full.tex changes.

The web preamble swaps the Roboto font for TeX Gyre Heros, since Roboto
isn't available in the offline BusyTeX package data used by the in-browser
compiler (see busytex-assets/). The local Python/Streamlit tool keeps using
Roboto via resume_full.tex directly, since a full TeX Live has it.
"""

import json
import re
from dataclasses import asdict
from pathlib import Path

from resume_model import parse_resume

SOURCE = Path(__file__).parent / "resume_full.tex"
OUT_PATH = Path(__file__).parent / "resume_structure.json"

ROBOTO_PATTERN = re.compile(r"\\usepackage\[sfdefault\]\{roboto\}")
WEB_FONT_REPLACEMENT = (
    "\\usepackage{tgheros}\n"
    "\\renewcommand{\\familydefault}{\\sfdefault}"
)


def web_preamble(preamble: str) -> str:
    return ROBOTO_PATTERN.sub(lambda _: WEB_FONT_REPLACEMENT, preamble)


def main() -> None:
    resume = parse_resume(SOURCE)
    data = {
        "preamble": web_preamble(resume.preamble),
        "tail": resume.tail,
        "sections": [asdict(s) for s in resume.sections],
    }
    OUT_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
