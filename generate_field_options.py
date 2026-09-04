"""One-time (or re-run-anytime) seeder for field_options.json.

Walks resume_full.tex, and for every editable field/bullet, writes an
options list containing just the current value. Edit the resulting JSON
by hand to add alternatives (e.g. different graduation dates) -- the app
will then show them as dropdown choices.

Re-running this will NOT clobber options you've deliberately curated
(any key with more than one choice); it only adds missing keys and
fixes single-option keys that have drifted from the current .tex (e.g.
after reordering/moving entries between sections).
"""

from pathlib import Path

from resume_model import Resume, parse_resume
from options_store import field_key, bullet_key, raw_key, load_options, save_options

SOURCE = Path(__file__).parent / "resume_full.tex"
OPTIONS_PATH = Path(__file__).parent / "field_options.json"


def seed_missing(resume: Resume, options: dict[str, list[str]]) -> int:
    """Add an options entry (containing just the current value) for any
    field/bullet that isn't already in `options`, and fix single-option
    entries that have drifted out of sync with the current value.

    Keys are positional ("Section > #entryIndex > field"), so moving or
    reordering entries (e.g. between sections) shifts everyone after
    them onto different keys -- a key that used to belong to one entry
    can silently end up describing a different one. A key with a single
    option is assumed to be auto-seeded (not deliberately curated), so
    if it no longer matches the current value it's just replaced. A key
    with multiple options is assumed curated (e.g. graduation date
    alternatives) and is left alone except for appending the current
    value if missing.

    Mutates `options` in place. Returns the number of keys added or
    corrected."""
    changed = 0

    def option_value(opt) -> str:
        # An option is either a plain string, or {"label": ..., "value": ...}
        # for a labeled choice (shown with its label in the dropdown when a
        # field has multiple options) -- see options_store.py.
        return opt["value"] if isinstance(opt, dict) else opt

    def sync(key: str, current_value: str) -> None:
        nonlocal changed
        if key not in options:
            options[key] = [current_value]
            changed += 1
        elif current_value not in (option_value(o) for o in options[key]):
            if len(options[key]) == 1:
                options[key] = [current_value]
            else:
                options[key].append(current_value)
            changed += 1

    for section in resume.sections:
        if section.kind == "raw":
            sync(raw_key(section.title), section.raw_text)
            continue

        for e_idx, entry in enumerate(section.entries):
            for f_idx, fname in enumerate(entry.field_names):
                sync(field_key(section.title, e_idx, fname), entry.args[f_idx])
            for b_idx, bullet in enumerate(entry.bullets):
                sync(bullet_key(section.title, e_idx, b_idx), bullet.text)
    return changed


def main() -> None:
    resume = parse_resume(SOURCE)
    options = load_options(OPTIONS_PATH)
    changed = seed_missing(resume, options)

    # Seed the example alternatives mentioned for graduation date.
    grad_key = field_key("Education", 0, "Dates")
    if grad_key in options and len(options[grad_key]) == 1:
        options[grad_key] = [
            "Aug. 2024 -- May 2028 (expected)",
            "Aug. 2024 -- Dec. 2027 (expected)",
            "Aug. 2024 -- May 2027 (expected)",
        ]

    save_options(OPTIONS_PATH, options)
    print(f"{OPTIONS_PATH}: {len(options)} fields total ({changed} added or corrected)")


if __name__ == "__main__":
    main()
