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

    const enabledBullets = entry.bullets.filter((b) => b.enabled);
    if (enabledBullets.length) {
      lines.push("      \\resumeItemListStart");
      for (const b of enabledBullets) {
        lines.push(`        \\resumeItem{${b.text}}`);
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
