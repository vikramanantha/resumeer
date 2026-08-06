"""Local resume editor.

Run with:
    streamlit run app.py

Every field and bullet is a dropdown of pre-approved values (stored in
field_options.json), not a free text box -- pick "+ Add new option..."
to type a new value once; it's saved for next time. Toggle whole entries
or individual bullets on/off, preview the recompiled PDF, and download it.
"""

import base64
import tempfile
from pathlib import Path

import streamlit as st

from resume_model import parse_resume, render_document, compile_tex, CompileError
from options_store import field_key, bullet_key, raw_key, load_options, save_options
from generate_field_options import seed_missing

SOURCE_PATH = Path(__file__).parent / "resume_full.tex"
OPTIONS_PATH = Path(__file__).parent / "field_options.json"

ADD_NEW = "+ Add new option..."

st.set_page_config(page_title="Resume Editor", layout="wide")

if "resume" not in st.session_state:
    st.session_state.resume = parse_resume(SOURCE_PATH)

resume = st.session_state.resume
options = load_options(OPTIONS_PATH)


def _format_choice(v: str) -> str:
    if v == ADD_NEW:
        return v
    v = v.replace("\n", " / ")
    return v if len(v) <= 90 else v[:87] + "..."


def dropdown_field(label: str, key_prefix: str, current_value: str,
                    options_key: str, label_visibility: str = "visible") -> str:
    """Renders a selectbox for one field, backed by options[options_key].
    Includes an inline "add new option" flow. Returns the current value."""
    choices = list(dict.fromkeys(options.get(options_key, []) + [current_value]))
    select_key = f"{key_prefix}_select"

    if select_key not in st.session_state:
        st.session_state[select_key] = current_value

    selection = st.selectbox(
        label, choices + [ADD_NEW], key=select_key,
        format_func=_format_choice, label_visibility=label_visibility,
    )

    if selection != ADD_NEW:
        return selection

    new_val = st.text_input(f"New value for '{label}'", key=f"{key_prefix}_newval")
    if st.button("Add option", key=f"{key_prefix}_addbtn") and new_val.strip():
        opts = options.setdefault(options_key, choices.copy())
        if new_val not in opts:
            opts.append(new_val)
        save_options(OPTIONS_PATH, options)
        st.session_state[select_key] = new_val
        st.rerun()
    return current_value


st.title("Resume Editor")

with st.sidebar:
    st.caption(f"Options file: `{OPTIONS_PATH.name}`")
    if st.button("Pick up new fields from resume_full.tex"):
        added = seed_missing(resume, options)
        save_options(OPTIONS_PATH, options)
        st.success(f"Added {added} new field(s).")

left, right = st.columns([1, 1])

with left:
    for s_idx, section in enumerate(resume.sections):
        st.subheader(section.title)

        if section.kind == "raw":
            key = raw_key(section.title)
            section.raw_text = dropdown_field(
                "Content", f"raw_{s_idx}", section.raw_text, key,
            )
            continue

        for e_idx, entry in enumerate(section.entries):
            label = f"{'✅' if entry.enabled else '⬜'} {entry.title()}"
            with st.expander(label, expanded=False):
                entry.enabled = st.checkbox(
                    "Include this entry", value=entry.enabled,
                    key=f"entry_{s_idx}_{e_idx}_enabled",
                )
                if not entry.enabled:
                    continue

                for f_idx, fname in enumerate(entry.field_names):
                    key = field_key(section.title, e_idx, fname)
                    entry.args[f_idx] = dropdown_field(
                        fname, f"entry_{s_idx}_{e_idx}_field_{f_idx}",
                        entry.args[f_idx], key,
                    )

                for b_idx, bullet in enumerate(entry.bullets):
                    c1, c2 = st.columns([0.08, 0.92])
                    bullet.enabled = c1.checkbox(
                        "on", value=bullet.enabled,
                        key=f"bullet_{s_idx}_{e_idx}_{b_idx}_enabled",
                        label_visibility="collapsed",
                    )
                    key = bullet_key(section.title, e_idx, b_idx)
                    with c2:
                        bullet.text = dropdown_field(
                            "bullet", f"bullet_{s_idx}_{e_idx}_{b_idx}",
                            bullet.text, key, label_visibility="collapsed",
                        )

with right:
    st.subheader("Preview")

    if st.button("Render PDF", type="primary"):
        tex_source = render_document(resume)
        st.session_state.last_tex = tex_source
        try:
            with tempfile.TemporaryDirectory() as td:
                pdf_bytes = compile_tex(tex_source, Path(td))
            st.session_state.pdf_bytes = pdf_bytes
            st.session_state.compile_error = None
        except CompileError as e:
            st.session_state.compile_error = str(e)

    if st.session_state.get("compile_error"):
        st.error(st.session_state.compile_error)

    if st.session_state.get("pdf_bytes"):
        b64 = base64.b64encode(st.session_state.pdf_bytes).decode()
        st.markdown(
            f'<iframe src="data:application/pdf;base64,{b64}" '
            f'width="100%" height="900"></iframe>',
            unsafe_allow_html=True,
        )
        st.download_button(
            "Download PDF",
            st.session_state.pdf_bytes,
            file_name="resume.pdf",
            mime="application/pdf",
        )

    with st.expander("View generated .tex"):
        st.code(st.session_state.get("last_tex", ""), language="latex")
