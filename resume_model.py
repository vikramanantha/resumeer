"""Parse resume_full.tex (the Jake Gutierrez / sb2nov style template) into an
editable data model, and re-render + compile it back to a PDF.

This is a targeted parser for the specific macros this template defines
(\\resumeSubheading, \\resumeResearchHeading, \\resumeProjectHeading,
\\resumeItem, ...) -- it does not attempt to parse arbitrary LaTeX.
"""

from __future__ import annotations

import subprocess
import shutil
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Low-level brace-aware tokenizing helpers
# ---------------------------------------------------------------------------

def find_command(text: str, name: str, start: int = 0) -> int:
    """Find `\\name` in text, requiring a word boundary after it (so
    `resumeItem` doesn't match inside `resumeItemListStart`)."""
    needle = "\\" + name
    idx = text.find(needle, start)
    while idx != -1:
        end = idx + len(needle)
        nxt = text[end:end + 1]
        if not nxt.isalpha():
            return idx
        idx = text.find(needle, idx + 1)
    return -1


def read_braced_arg(text: str, i: int) -> tuple[str, int]:
    """text[i] must be '{'. Returns (content, index_after_closing_brace)."""
    assert text[i] == "{", f"expected '{{' at {i}, got {text[i:i + 20]!r}"
    depth = 0
    j = i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j], j + 1
        j += 1
    raise ValueError("unbalanced braces starting at " + str(i))


def read_args(text: str, i: int, n: int) -> tuple[list[str], int]:
    args = []
    for _ in range(n):
        while text[i].isspace():
            i += 1
        content, i = read_braced_arg(text, i)
        args.append(content)
    return args, i


def parse_bullets(text: str, start: int, end: int) -> list["Bullet"]:
    bullets = []
    i = start
    while True:
        idx = find_command(text, "resumeItem", i)
        if idx == -1 or idx >= end:
            break
        cmd_end = idx + len("\\resumeItem")
        args, i = read_args(text, cmd_end, 1)
        bullets.append(Bullet(text=args[0].strip()))
    return bullets


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Bullet:
    text: str
    enabled: bool = True


@dataclass
class Entry:
    args: list[str]
    field_names: list[str]
    bullets: list[Bullet] = field(default_factory=list)
    enabled: bool = True

    def title(self) -> str:
        return self.args[0] if self.args else "(entry)"


@dataclass
class Section:
    title: str
    kind: str  # "heading-list" (subheading/research/project) or "raw"
    command: str = ""  # which \resume...Heading macro this section uses
    entries: list[Entry] = field(default_factory=list)
    raw_text: str = ""


@dataclass
class Resume:
    preamble: str
    sections: list[Section]
    tail: str = "\n\\end{document}\n"


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

# (section title in the .tex -> (command name, arg count, field labels))
_HEADING_COMMANDS = {
    "resumeSubheading": (4, ["Organization", "Dates", "Title / Degree", "Location / Detail"]),
    "resumeResearchHeading": (2, ["Organization", "Dates"]),
    "resumeProjectHeading": (2, ["Title", "Dates"]),
}

# sections we leave untouched as a single editable text blob
_RAW_SECTION_TITLES = {"Technical Skills"}


def _detect_heading_command(chunk: str) -> str | None:
    best_idx, best_name = None, None
    for name in _HEADING_COMMANDS:
        idx = find_command(chunk, name)
        if idx != -1 and (best_idx is None or idx < best_idx):
            best_idx, best_name = idx, name
    return best_name


def parse_resume(path: str | Path) -> Resume:
    text = Path(path).read_text()

    doc_start = text.index("\\begin{document}")
    center_end = text.index("\\end{center}") + len("\\end{center}")
    preamble = text[: center_end]

    body_start = center_end
    doc_end = text.rindex("\\end{document}")
    body = text[body_start:doc_end]

    # Split body into per-\section{...} chunks.
    section_positions = []
    i = 0
    while True:
        idx = find_command(body, "section", i)
        if idx == -1:
            break
        args, after = read_args(body, idx + len("\\section"), 1)
        section_positions.append((args[0], after))
        i = after

    sections = []
    for n, (title, start) in enumerate(section_positions):
        end = section_positions[n + 1][1] if n + 1 < len(section_positions) else len(body)
        # back up `end` to before the next section's marker/comment so we
        # don't include it; find_command for "section" gives us a safe cut,
        # trim to just before the next "\section" occurrence instead.
        if n + 1 < len(section_positions):
            next_idx = find_command(body, "section", start)
            end = next_idx if next_idx != -1 else len(body)
        chunk = body[start:end]

        if title in _RAW_SECTION_TITLES:
            sections.append(Section(title=title, kind="raw", raw_text=chunk.strip("\n")))
            continue

        cmd = _detect_heading_command(chunk)
        if cmd is None:
            sections.append(Section(title=title, kind="raw", raw_text=chunk.strip("\n")))
            continue

        n_args, field_names = _HEADING_COMMANDS[cmd]
        entries = []
        i2 = 0
        while True:
            idx = find_command(chunk, cmd, i2)
            if idx == -1:
                break
            args, after_args = read_args(chunk, idx + len(cmd) + 1, n_args)

            next_entry = find_command(chunk, cmd, after_args)
            boundary = next_entry if next_entry != -1 else len(chunk)

            bullets: list[Bullet] = []
            list_start = find_command(chunk, "resumeItemListStart", after_args)
            cursor = after_args
            if list_start != -1 and list_start < boundary:
                list_end = find_command(chunk, "resumeItemListEnd", list_start)
                bullets = parse_bullets(chunk, list_start, list_end)
                cursor = list_end + len("\\resumeItemListEnd")

            entries.append(Entry(args=args, field_names=field_names, bullets=bullets))
            i2 = cursor

        sections.append(Section(title=title, kind="heading-list", command=cmd, entries=entries))

    return Resume(preamble=preamble, sections=sections)


# ---------------------------------------------------------------------------
# Rendering back to LaTeX
# ---------------------------------------------------------------------------

def render_section(section: Section) -> str:
    banner = f"%-----------{section.title.upper()}-----------"
    lines = [banner, f"\\section{{{section.title}}}"]

    if section.kind == "raw":
        lines.append(section.raw_text)
        return "\n".join(lines)

    lines.append("  \\resumeSubHeadingListStart")
    for entry in section.entries:
        if not entry.enabled:
            continue
        arg_str = "".join(f"{{{a}}}" for a in entry.args)
        if section.command == "resumeProjectHeading":
            lines.append(f"      \\{section.command}")
            lines.append(f"          {arg_str}")
        else:
            lines.append(f"    \\{section.command}")
            a = entry.args
            if section.command == "resumeSubheading":
                lines.append(f"      {{{a[0]}}}{{{a[1]}}}")
                lines.append(f"      {{{a[2]}}}{{{a[3]}}}")
            else:
                lines.append(f"      {arg_str}")

        enabled_bullets = [b for b in entry.bullets if b.enabled]
        if enabled_bullets:
            lines.append("      \\resumeItemListStart")
            for b in enabled_bullets:
                lines.append(f"        \\resumeItem{{{b.text}}}")
            lines.append("      \\resumeItemListEnd")
    lines.append("  \\resumeSubHeadingListEnd")
    return "\n".join(lines)


def render_document(resume: Resume) -> str:
    parts = [resume.preamble, ""]
    for section in resume.sections:
        parts.append(render_section(section))
        parts.append("")
    parts.append(resume.tail)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Compiling to PDF
# ---------------------------------------------------------------------------

class CompileError(RuntimeError):
    pass


def compile_tex(tex_source: str, workdir: Path, jobname: str = "resume_edited") -> bytes:
    workdir.mkdir(parents=True, exist_ok=True)
    tex_path = workdir / f"{jobname}.tex"
    tex_path.write_text(tex_source)

    if shutil.which("tectonic"):
        cmd = ["tectonic", "--outdir", str(workdir), str(tex_path)]
    elif shutil.which("pdflatex"):
        cmd = [
            "pdflatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={workdir}",
            str(tex_path),
        ]
    else:
        raise CompileError(
            "No LaTeX engine found. Install one with:\n"
            "  brew install tectonic\n"
            "or\n"
            "  brew install --cask basictex"
        )

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=workdir)
    pdf_path = workdir / f"{jobname}.pdf"
    if result.returncode != 0 or not pdf_path.exists():
        raise CompileError(
            f"Compilation failed (exit {result.returncode}):\n"
            f"--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}"
        )
    return pdf_path.read_bytes()
