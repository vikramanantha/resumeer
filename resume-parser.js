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
//   \resumeSubheading
//     {University of Michigan}{Aug. 2024 -- May 2028 (expected)}
//     {B.S. ...}{3.94/4.00 GPA}
//     %ALT[Dates]{Dec 2027}{Aug. 2024 -- Dec. 2027 (expected)}
//
// A bare %ALT{label}{value} attaches to the \resumeItem above it; the
// %ALT[FieldName]{label}{value} form attaches to a named field of the entry
// it sits in.

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

// Collect every %ALT directive in `chunk`, with the offset it appears at so it
// can be attached to whichever bullet/entry it follows.
function parseAltDirectives(chunk) {
  const directives = [];
  let search = 0;
  for (;;) {
    const idx = chunk.indexOf("%ALT", search);
    if (idx === -1) break;
    let i = idx + "%ALT".length;
    let fieldName = null;
    try {
      if (chunk[i] === "[") {
        const close = chunk.indexOf("]", i);
        if (close === -1) throw new Error("unclosed [ in %ALT");
        fieldName = chunk.slice(i + 1, close).trim();
        i = close + 1;
      }
      const [[label, value], after] = readArgs(chunk, i, 2);
      directives.push({ offset: idx, field: fieldName, label: label.trim(), value: value.trim() });
      search = after;
    } catch (err) {
      console.warn(`[Resumeer] Skipping malformed %ALT at offset ${idx}:`, err.message);
      search = idx + 4;
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
    bullets.push({ text: args[0].trim(), enabled: true, options: [], _end: after });
    i = after;
  }
  return bullets;
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
    const directives = parseAltDirectives(chunk);
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
      for (const d of mine) {
        if (d.field) {
          (field_options[d.field] ||= []).push({ label: d.label, value: d.value });
        } else {
          // Bare %ALT belongs to the last bullet that ends before it.
          const owner = [...bullets].reverse().find((b) => b._end <= d.offset);
          if (owner) owner.options.push({ label: d.label, value: d.value });
          else console.warn(`[Resumeer] %ALT{${d.label}} has no \\resumeItem above it; ignored.`);
        }
      }

      bullets.forEach((b) => delete b._end);
      entries.push({ args, field_names: fieldNames, bullets, field_options, enabled: true });
      cursor = next;
    }

    return { title, kind: "heading-list", command, entries, raw_text: "", enabled: true };
  });

  return { preamble, tail: "\n\\end{document}\n", sections };
}
