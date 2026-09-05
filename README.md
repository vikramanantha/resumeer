# Resuméer
Vikram Anantha
Aug 2026

Resumé her? I hardly know her!

I have to make like 17 different versions of my resume to apply to jobs and internships. It's always the same type of chnage too, so I figured I'd make it a big easier to make these changes

Edit a LaTeX resume through dropdown-based fields (dates, bullets, whole
entries) and export a recompiled PDF — all in the browser, no server.

## Editing

`resume_full.tex` is the only file you edit. There is nothing to
regenerate: change the `.tex`, reload the page.

**Structural changes** (header links, new entries, new sections) — just
edit the `.tex` normally.

**Alternative wordings** live in the `.tex` as `%ALT` comments. LaTeX
ignores them; the parser picks them up and offers them as dropdown
choices. The value written in the `.tex` is the default (shown as
"General"); each `%ALT` adds another choice with the label you give it.

Attach one to a bullet by putting it directly underneath:

```latex
\resumeItem{Benchmarked ... for AV training}
%ALT{Nuro perception}{Benchmarked ... for AV perception}
```

Or to a named field of an entry:

```latex
\resumeSubheading
  {University of Michigan}{Aug. 2024 -- May 2028 (expected)}
  {B.S. Computer Science \& Electrical Engineering}{3.94/4.00 GPA}
  %ALT[Dates]{Dec 2027 grad}{Aug. 2024 -- Dec. 2027 (expected)}
```

Field names are the labels shown in the UI: `Organization`, `Dates`,
`Title / Degree`, `Location / Detail` (or `Title`/`Dates` for
`\resumeProjectHeading` entries).

## Files

- `resume_full.tex` — the resume and its `%ALT` alternatives.
- `resume-parser.js` — parses the `.tex` (including `%ALT`) in the browser.
- `resume-renderer.js` — renders the edited structure back to LaTeX.
- `app.js` / `index.html` — the editor UI.
- `busytex-assets/` — WASM pdfTeX + TeX Live data, for compiling in-browser.
  `texlive-extra.data` is split into `.part-*` chunks (GitHub caps files at
  100MB) and reassembled at request time by `sw.js`.
