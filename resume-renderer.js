// Mirrors resume_model.py's render_section/render_document exactly, so the
// browser-compiled PDF matches what the local Python tool would produce.

export function renderSection(section) {
  const banner = `%-----------${section.title.toUpperCase()}-----------`;
  const lines = [banner, `\\section{${section.title}}`];

  if (section.kind === "raw") {
    lines.push(section.raw_text);
    return lines.join("\n");
  }

  lines.push("  \\resumeSubHeadingListStart");
  for (const entry of section.entries) {
    if (!entry.enabled) continue;
    const argStr = entry.args.map((a) => `{${a}}`).join("");

    if (section.command === "resumeProjectHeading") {
      lines.push(`      \\${section.command}`);
      lines.push(`          ${argStr}`);
    } else {
      lines.push(`    \\${section.command}`);
      const a = entry.args;
      if (section.command === "resumeSubheading") {
        lines.push(`      {${a[0]}}{${a[1]}}`);
        lines.push(`      {${a[2]}}{${a[3]}}`);
      } else {
        lines.push(`      ${argStr}`);
      }
    }

    // Every included variant becomes its own \resumeItem, so one bullet in
    // resume_full.tex can render as several here -- or as none, if all of its
    // variants are unchecked. Source order is preserved: a bullet's variants
    // stay together, in .tex order (the written wording first, then its %ALTs).
    const texts = [];
    for (const b of entry.bullets) {
      for (const v of b.variants) if (v.enabled) texts.push(v.value);
    }
    if (texts.length) {
      lines.push("      \\resumeItemListStart");
      for (const t of texts) {
        lines.push(`        \\resumeItem{${t}}`);
      }
      lines.push("      \\resumeItemListEnd");
    }
  }
  lines.push("  \\resumeSubHeadingListEnd");
  return lines.join("\n");
}

export function renderDocument(resume) {
  const parts = [resume.preamble, ""];
  for (const section of resume.sections) {
    if (!section.enabled) continue;
    parts.push(renderSection(section));
    parts.push("");
  }
  parts.push(resume.tail);
  return parts.join("\n");
}
