# Resuméer
Vikram Anantha
Aug 2026

Resumé her? I hardly know her!

I have to make like 17 different versions of my resume to apply to jobs and internships. It's always the same type of chnage too, so I figured I'd make it a big easier to make these changes

Edit a LaTeX resume by ticking the wordings you want (dates, bullets, whole
entries) and export a recompiled PDF — all in the browser, no server.

## Editing

`resume_full.tex` is the only file you edit. There is nothing to
regenerate: change the `.tex`, reload the page.

**Structural changes** (header links, new entries, new sections) — just
edit the `.tex` normally.

**Every candidate wording is a plain `\resumeItem`.** `%LABEL` gives it the
few-word description the editor shows — a description of what that wording
*says*, since that is what you are choosing between — and `%OFF` means it
starts unticked. So the `.tex` holds everything you might say, and the items
without `%OFF` are your base resume:

```latex
\resumeItem{Delivered prod. 3D segmentation pipeline ...}
%LABEL{Pipeline shipped, team led}
\resumeItem{Benchmarked Gaussian Grouping, LangSplat, and SAM ...}
%LABEL{Three models benchmarked}
%OFF
```

Each one is its own checkbox in the editor, and any number can be on — tick
three and you get three bullets. Adding a wording means adding a
`\resumeItem` + `%LABEL` + `%OFF`; nothing else to keep in sync. Because they
are real LaTeX, you can reorder them or move them between entries freely.

Compiling `resume_full.tex` directly gives you every wording at once — it is
a pool, not a resume. The editor is what turns it into one.

**`%ALT` still works** if you want a pick-one group instead: a bare
`%ALT{label}{value}` under a `\resumeItem` makes that bullet a menu, where the
row checkbox includes or drops the bullet and the menu picks which wordings
come with it.

Or to a named field of an entry:

```latex
\resumeSubheading
  {University of Michigan}{Aug. 2024 -- May 2028 (expected)}
  {B.S. Computer Science \& Electrical Engineering}{3.94/4.00 GPA}
  %ALT[Dates]{Dec 2027 grad}{Aug. 2024 -- Dec. 2027 (expected)}
```

A field holds one value, so unlike a bullet it stays a pick-one dropdown.
This is what `%ALT[Field]` is for.

Field names are the labels shown in the UI: `Organization`, `Dates`,
`Title / Degree`, `Location / Detail` (or `Title`/`Dates` for
`\resumeProjectHeading` entries).

## Files

- `resume_full.tex` — every wording, as `\resumeItem` + `%LABEL` (+ `%OFF`).
- `resume-parser.js` — parses the `.tex` (including `%LABEL` / `%OFF` / `%ALT`) in the browser.
- `resume-renderer.js` — renders the edited structure back to LaTeX.
- `app.js` / `index.html` — the editor UI.
- `session-state.js` — remembers your ticks across reloads, keyed by content.
- `busytex-assets/` — WASM pdfTeX + TeX Live data, for compiling in-browser.
  `texlive-extra.data` is split into `.part-*` chunks (GitHub caps files at
  100MB) and reassembled at request time by `sw.js`.
