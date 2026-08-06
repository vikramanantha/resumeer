"""One-time (or re-run-anytime) seeder for field_options.json.

Walks resume_full.tex, and for every editable field/bullet, writes an
options list containing just the current value. Edit the resulting JSON
by hand to add alternatives (e.g. different graduation dates) -- the app
will then show them as dropdown choices.

Re-running this will NOT clobber options you've already added for fields
that still exist; it only adds keys that are missing.
"""

from pathlib import Path

from resume_model import Resume, parse_resume
from options_store import field_key, bullet_key, raw_key, load_options, save_options

SOURCE = Path(__file__).parent / "resume_full.tex"
OPTIONS_PATH = Path(__file__).parent / "field_options.json"


def seed_missing(resume: Resume, options: dict[str, list[str]]) -> int:
    """Add an options entry (containing just the current value) for any
    field/bullet that isn't already in `options`. Mutates `options` in
    place. Returns the number of keys added."""
    added = 0
    for section in resume.sections:
        if section.kind == "raw":
            key = raw_key(section.title)
            if key not in options:
                options[key] = [section.raw_text]
                added += 1
            continue

        for e_idx, entry in enumerate(section.entries):
            for f_idx, fname in enumerate(entry.field_names):
                key = field_key(section.title, e_idx, fname)
                if key not in options:
                    options[key] = [entry.args[f_idx]]
                    added += 1
            for b_idx, bullet in enumerate(entry.bullets):
                key = bullet_key(section.title, e_idx, b_idx)
                if key not in options:
                    options[key] = [bullet.text]
                    added += 1
    return added


def main() -> None:
    resume = parse_resume(SOURCE)
    options = load_options(OPTIONS_PATH)
    added = seed_missing(resume, options)

    # Seed the example alternatives mentioned for graduation date.
    grad_key = field_key("Education", 0, "Dates")
    if grad_key in options and len(options[grad_key]) == 1:
        options[grad_key] = [
            "Aug. 2024 -- May 2028 (expected)",
            "Aug. 2024 -- Dec. 2027 (expected)",
            "Aug. 2024 -- May 2027 (expected)",
        ]

    save_options(OPTIONS_PATH, options)
    print(f"{OPTIONS_PATH}: {len(options)} fields total ({added} newly added)")


if __name__ == "__main__":
    main()
