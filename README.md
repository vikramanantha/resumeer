# Resuméer
Vikram Anantha
Aug 2026

Resumé her? I hardly know her!

I have to make like 17 different versions of my resume to apply to jobs and internships. It's always the same type of chnage too, so I figured I'd make it a big easier to make these changes

Edit a LaTeX resume through dropdown-based fields (dates, bullets, whole
entries) and export a recompiled PDF.

- `resume_full.tex` — the resume, using custom macros (`\resumeSubheading`,
  `\resumeItem`, ...) that make each field/bullet independently editable.
- `field_options.json` — the allowed values for each field/bullet.
- `resume_model.py`, `options_store.py` — parse the `.tex` into an editable
  structure and render it back.
- `app.py` — local Streamlit UI: `streamlit run app.py`. Compiles with
  `tectonic` (or `pdflatex`) and lets you preview/download the PDF.
- `generate_field_options.py` — (re)seed `field_options.json` from the
  current `.tex` structure.
