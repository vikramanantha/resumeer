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

**Alternative wordings** live in the `.tex` as `%ALT` comments. LaTeX
ignores them; the parser picks them up and offers them in the editor.

For a bullet, each wording is its own checkbox and any number can be on at
once — so one `\resumeItem` here can come out as several bullets in the PDF,
or as none if you untick them all. Add as many `%ALT`s as you like. `%LABEL`
names the wording written in the `.tex` itself, which otherwise has nothing
describing it. Labels are a few words saying what that wording *says*, since
that is what you are choosing between:

```latex
\resumeItem{Benchmarked ... for AV training}
%LABEL{Three models benchmarked}
%ALT{Roadmap and team lead}{Set technical roadmap ...; led 3 engineers ...}
%ALT{Test plans and triage}{Wrote test plans comparing model renders ...}
```

The checkbox next to the row is a shortcut for the whole bullet: untick it to
drop the bullet entirely, tick it to bring back the `.tex` wording.

Or to a named field of an entry:

```latex
\resumeSubheading
  {University of Michigan}{Aug. 2024 -- May 2028 (expected)}
  {B.S. Computer Science \& Electrical Engineering}{3.94/4.00 GPA}
  %ALT[Dates]{Dec 2027 grad}{Aug. 2024 -- Dec. 2027 (expected)}
```

A field holds one value, so unlike a bullet it stays a pick-one dropdown.

Field names are the labels shown in the UI: `Organization`, `Dates`,
`Title / Degree`, `Location / Detail` (or `Title`/`Dates` for
`\resumeProjectHeading` entries).

## Files

- `resume_full.tex` — the resume and its `%ALT` / `%LABEL` alternatives.
- `resume-parser.js` — parses the `.tex` (including `%ALT` / `%LABEL`) in the browser.
- `resume-renderer.js` — renders the edited structure back to LaTeX.
- `app.js` / `index.html` — the editor UI.
- `session-state.js` — remembers your ticks across reloads, keyed by content.
- `busytex-assets/` — WASM pdfTeX + TeX Live data, for compiling in-browser.
  `texlive-extra.data` is split into `.part-*` chunks (GitHub caps files at
  100MB) and reassembled at request time by `sw.js`.
