#!/usr/bin/env bash
# Regenerates resume_structure.json and field_options.json from resume_full.tex.
# Run this after editing resume_full.tex so the web editor picks up the change.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

python3 generate_web_structure.py
python3 generate_field_options.py
