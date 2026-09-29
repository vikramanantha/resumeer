// Parses resume_full.tex (the Jake Gutierrez / sb2nov style template) into the
// editable structure the app renders from. This is a targeted parser for the
// macros this template defines (\resumeSubheading, \resumeResearchHeading,
// \resumeProjectHeading, \resumeItem, ...) -- not general LaTeX.
//
// Alternative wordings live in the .tex itself as comments, so LaTeX ignores
// them but this parser picks them up:
//
//   \resumeItem{Benchmarked ... for AV training}
//   %ALT{Nuro perception}{Benchmarked ... for AV perception}
//
// Each of those becomes an independently includable *variant* of the bullet,
// so a single \resumeItem here can emit several in the rendered resume.
//
//   \resumeSubheading
//     {University of Michigan}{Aug. 2024 -- May 2028 (expected)}
//     {B.S. ...}{3.94/4.00 GPA}
//     %ALT[Dates]{Dec 2027}{Aug. 2024 -- Dec. 2027 (expected)}
//
// Every candidate wording is a plain \resumeItem. %LABEL{label} gives it the
// few-word description the editor shows, and %OFF means it starts unticked --
// so the .tex holds every wording you might use, and the ones without %OFF are
// your base resume:
//
//   \resumeItem{Benchmarked ... for AV training}
//   %LABEL{Model benchmarking}
//   \resumeItem{Led 3 engineers to ship ...}
//   %LABEL{Team leadership}
//   %OFF
//
// %ALT still works and is what fields use: %ALT[FieldName]{label}{value}
// attaches to a named field of the entry it sits in. A bare
// %ALT{label}{value} attaches to the \resumeItem above it, making that
// bullet a pick-one group rather than its own checkbox.

const HEADING_COMMANDS = {
  resumeSubheading: { nArgs: 4, fieldNames: ["Organization", "Dates", "Title / Degree", "Location / Detail"] },
  resumeResearchHeading: { nArgs: 2, fieldNames: ["Organization", "Dates"] },
  resumeProjectHeading: { nArgs: 2, fieldNames: ["Title", "Dates"] },
};

// Sections left untouched as a single editable text blob.
const RAW_SECTION_TITLES = new Set(["Technical Skills"]);

// The web build compiles with BusyTeX, whose bundled TeX Live has no Roboto.
const ROBOTO_RE = /\\usepackage\[sfdefault\]\{roboto\}/;
const WEB_FONT = "\\usepackage{tgheros}\n\\renewcommand{\\familydefault}{\\sfdefault}";

// Find `\name`, requiring a non-letter after it so `resumeItem` doesn't match
// inside `resumeItemListStart`.
function findCommand(text, name, start = 0) {
  const needle = "\\" + name;
  let idx = text.indexOf(needle, start);
  while (idx !== -1) {
    const next = text[idx + needle.length] || "";
    if (!/[a-zA-Z]/.test(next)) return idx;
    idx = text.indexOf(needle, idx + 1);
  }
  return -1;
}

// text[i] must be '{'. Returns [content, indexAfterClosingBrace].
function readBracedArg(text, i) {
  if (text[i] !== "{") {
    throw new Error(`expected '{' at ${i}, got ${JSON.stringify(text.slice(i, i + 20))}`);
  }
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return [text.slice(i + 1, j), j + 1];
    }
  }
  throw new Error(`unbalanced braces starting at ${i}`);
}

function readArgs(text, i, n) {
  const args = [];
  for (let k = 0; k < n; k++) {
    while (i < text.length && /\s/.test(text[i])) i++;
    const [content, next] = readBracedArg(text, i);
    args.push(content);
    i = next;
  }
  return [args, i];
}

// Collect every %ALT / %LABEL directive in `chunk`, with the offset it appears
// at so it can be attached to whichever bullet/entry it follows.
function parseDirectives(chunk) {
  const directives = [];
  const re = /%(ALT|LABEL|OFF)/g;
  let m;
  while ((m = re.exec(chunk)) !== null) {
    const idx = m.index;
    const kind = m[1];
    let i = idx + m[0].length;
    // Require a '[' or '{' straight after ALT/LABEL, and a non-letter after
    // OFF, so a prose comment starting with one of these words is left alone.
    if (kind === "OFF" ? /[a-zA-Z]/.test(chunk[i] || "") : !"[{".includes(chunk[i] || "")) continue;
    try {
      if (kind === "OFF") {
        directives.push({ kind, offset: idx });
        continue;
      }
      if (kind === "LABEL") {
        const [[label], after] = readArgs(chunk, i, 1);
        directives.push({ kind, offset: idx, label: label.trim() });
        re.lastIndex = after;
        continue;
      }
      let fieldName = null;
      if (chunk[i] === "[") {
        const close = chunk.indexOf("]", i);
        if (close === -1) throw new Error("unclosed [ in %ALT");
        fieldName = chunk.slice(i + 1, close).trim();
        i = close + 1;
      }
      const [[label, value], after] = readArgs(chunk, i, 2);
      directives.push({ kind, offset: idx, field: fieldName, label: label.trim(), value: value.trim() });
      re.lastIndex = after;
    } catch (err) {
      console.warn(`[Resumeer] Skipping malformed %${kind} at offset ${idx}:`, err.message);
      re.lastIndex = idx + m[0].length;
    }
  }
  return directives;
}

function parseBullets(chunk, start, end) {
  const bullets = [];
  let i = start;
  for (;;) {
    const idx = findCommand(chunk, "resumeItem", i);
    if (idx === -1 || idx >= end) break;
    const [args, after] = readArgs(chunk, idx + "\\resumeItem".length, 1);
    // `default_text` is the wording as written in the .tex. %ALT directives
    // found later in this entry get pushed onto `options`, and once the entry
    // is fully scanned the two are combined into `variants` (see
    // buildVariants) -- which is what the app and renderer actually use.
    bullets.push({ default_text: args[0].trim(), options: [], _end: after });
    i = after;
  }
  return bullets;
}

// A bullet's variants are the wording written in the .tex plus every %ALT
// attached to it, each independently includable. The .tex wording is on
// unless %OFF says otherwise; %ALT wordings are off.
// Duplicates collapse by value, so an %ALT that repeats the default (or an
// earlier %ALT) doesn't produce a second identical checkbox.
function buildVariants(defaultText, defaultLabel, defaultOff, options) {
  const byValue = new Map([[defaultText, { label: defaultLabel || null, value: defaultText, enabled: !defaultOff }]]);
  for (const alt of options) {
    if (byValue.has(alt.value)) continue;
    byValue.set(alt.value, { label: alt.label || null, value: alt.value, enabled: false });
  }
  return Array.from(byValue.values());
}

function detectHeadingCommand(chunk) {
  let bestIdx = null;
  let bestName = null;
  for (const name of Object.keys(HEADING_COMMANDS)) {
    const idx = findCommand(chunk, name);
    if (idx !== -1 && (bestIdx === null || idx < bestIdx)) {
      bestIdx = idx;
      bestName = name;
    }
  }
  return bestName;
}

export function parseResume(text, { webFont = true } = {}) {
  const centerEnd = text.indexOf("\\end{center}") + "\\end{center}".length;
  let preamble = text.slice(0, centerEnd);
  if (webFont) preamble = preamble.replace(ROBOTO_RE, () => WEB_FONT);

  const body = text.slice(centerEnd, text.lastIndexOf("\\end{document}"));

  // Split the body into per-\section{...} chunks.
  const sectionPositions = [];
  let i = 0;
  for (;;) {
    const idx = findCommand(body, "section", i);
    if (idx === -1) break;
    const [args, after] = readArgs(body, idx + "\\section".length, 1);
    sectionPositions.push({ title: args[0], start: after });
    i = after;
  }

  const sections = sectionPositions.map(({ title, start }, n) => {
    let end = body.length;
    if (n + 1 < sectionPositions.length) {
      const nextIdx = findCommand(body, "section", start);
      end = nextIdx === -1 ? body.length : nextIdx;
    }
    const chunk = body.slice(start, end);

    const command = RAW_SECTION_TITLES.has(title) ? null : detectHeadingCommand(chunk);
    if (!command) {
      return { title, kind: "raw", command: "", entries: [], raw_text: chunk.replace(/^\n+|\n+$/g, ""), enabled: true };
    }

    const { nArgs, fieldNames } = HEADING_COMMANDS[command];
    const directives = parseDirectives(chunk);
    const entries = [];
    let cursor = 0;

    for (;;) {
      const idx = findCommand(chunk, command, cursor);
      if (idx === -1) break;
      const [args, afterArgs] = readArgs(chunk, idx + command.length + 1, nArgs);

      const nextEntry = findCommand(chunk, command, afterArgs);
      const boundary = nextEntry === -1 ? chunk.length : nextEntry;

      let bullets = [];
      let next = afterArgs;
      const listStart = findCommand(chunk, "resumeItemListStart", afterArgs);
      if (listStart !== -1 && listStart < boundary) {
        const listEnd = findCommand(chunk, "resumeItemListEnd", listStart);
        bullets = parseBullets(chunk, listStart, listEnd);
        next = listEnd + "\\resumeItemListEnd".length;
      }

      // Attach the %ALT directives that fall inside this entry's span.
      const mine = directives.filter((d) => d.offset >= idx && d.offset < boundary);
      const field_options = {};
      const lastBulletBefore = (offset) => [...bullets].reverse().find((b) => b._end <= offset);
      for (const d of mine) {
        if (d.kind === "LABEL" || d.kind === "OFF") {
          const owner = lastBulletBefore(d.offset);
          if (!owner) {
            console.warn(`[Resumeer] %${d.kind} has no \\resumeItem above it; ignored.`);
          } else if (d.kind === "LABEL") {
            owner.default_label = d.label;
          } else {
            owner.default_off = true;
          }
        } else if (d.field) {
          (field_options[d.field] ||= []).push({ label: d.label, value: d.value });
        } else {
          // Bare %ALT belongs to the last bullet that ends before it.
          const owner = lastBulletBefore(d.offset);
          if (owner) owner.options.push({ label: d.label, value: d.value });
          else console.warn(`[Resumeer] %ALT{${d.label}} has no \\resumeItem above it; ignored.`);
        }
      }

      bullets.forEach((b) => {
        b.variants = buildVariants(b.default_text, b.default_label, b.default_off, b.options);
        delete b.options;
        delete b.default_label;
        delete b.default_off;
        delete b._end;
      });
      entries.push({
        args,
        default_args: [...args],
        field_names: fieldNames,
        bullets,
        field_options,
        enabled: true,
      });
      cursor = next;
    }

    return { title, kind: "heading-list", command, entries, raw_text: "", enabled: true };
  });

  return { preamble, tail: "\n\\end{document}\n", sections };
}
