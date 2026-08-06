import { renderDocument } from "./resume-renderer.js";
import { BusyTexRunner, PdfLatex } from "https://cdn.jsdelivr.net/npm/texlyre-busytex@1.2.3/dist/index.js";

const ADD_NEW = "__add_new__";
const LOCAL_OPTIONS_KEY = "resumeer_local_options_v1";
const BUSYTEX_BASE = new URL("busytex-assets/", import.meta.url).href.replace(/\/$/, "");

let resumeData = null;
let baseOptions = {};
let localOptions = {};
let runner = null;
let pdflatex = null;

function fieldKey(sectionTitle, entryIdx, fieldName) {
  return `${sectionTitle} > #${entryIdx} > ${fieldName}`;
}
function bulletKey(sectionTitle, entryIdx, bulletIdx) {
  return `${sectionTitle} > #${entryIdx} > bullet ${bulletIdx}`;
}
function rawKey(sectionTitle) {
  return `${sectionTitle} > content`;
}

function loadLocalOptions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_OPTIONS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveLocalOptions() {
  localStorage.setItem(LOCAL_OPTIONS_KEY, JSON.stringify(localOptions));
}
function addLocalOption(key, value) {
  if (!localOptions[key]) localOptions[key] = [];
  if (!localOptions[key].includes(value)) {
    localOptions[key].push(value);
    saveLocalOptions();
  }
}
function optionsFor(key, currentValue) {
  const shipped = baseOptions[key] || [];
  const local = localOptions[key] || [];
  return Array.from(new Set([...shipped, ...local, currentValue]));
}

function truncate(value, n = 90) {
  const s = value.replace(/\n/g, " / ");
  return s.length <= n ? s : s.slice(0, n - 3) + "...";
}

function buildDropdown(labelText, currentValue, key, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "field-row";

  if (labelText) {
    const label = document.createElement("label");
    label.textContent = labelText;
    wrap.appendChild(label);
  }

  const select = document.createElement("select");
  for (const choice of optionsFor(key, currentValue)) {
    const opt = document.createElement("option");
    opt.value = choice;
    opt.textContent = truncate(choice);
    if (choice === currentValue) opt.selected = true;
    select.appendChild(opt);
  }
  const addOpt = document.createElement("option");
  addOpt.value = ADD_NEW;
  addOpt.textContent = "+ Add new option...";
  select.appendChild(addOpt);
  wrap.appendChild(select);

  const newRow = document.createElement("div");
  newRow.className = "new-value-row";
  newRow.hidden = true;
  const newInput = document.createElement("input");
  newInput.type = "text";
  newInput.placeholder = `New value for '${labelText || "field"}'`;
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add";
  newRow.appendChild(newInput);
  newRow.appendChild(addBtn);
  wrap.appendChild(newRow);

  select.addEventListener("change", () => {
    if (select.value === ADD_NEW) {
      newRow.hidden = false;
      newInput.focus();
    } else {
      newRow.hidden = true;
      onChange(select.value);
    }
  });

  addBtn.addEventListener("click", () => {
    const val = newInput.value.trim();
    if (!val) return;
    addLocalOption(key, val);
    onChange(val);
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = truncate(val);
    opt.selected = true;
    select.insertBefore(opt, select.lastElementChild);
    newRow.hidden = true;
    newInput.value = "";
  });

  return wrap;
}

function buildForm(container) {
  container.innerHTML = "";

  resumeData.sections.forEach((section, sIdx) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "resumeer-section";
    const h2 = document.createElement("h2");
    h2.textContent = section.title;
    sectionEl.appendChild(h2);

    if (section.kind === "raw") {
      const key = rawKey(section.title);
      sectionEl.appendChild(
        buildDropdown("", section.raw_text, key, (val) => {
          section.raw_text = val;
        })
      );
      container.appendChild(sectionEl);
      return;
    }

    section.entries.forEach((entry, eIdx) => {
      const entryEl = document.createElement("details");
      entryEl.className = "resumeer-entry";

      const summary = document.createElement("summary");

      const caret = document.createElement("i");
      caret.className = "fas fa-chevron-right resumeer-caret";
      summary.appendChild(caret);

      const enabledCb = document.createElement("input");
      enabledCb.type = "checkbox";
      enabledCb.checked = entry.enabled;
      enabledCb.className = "entry-enabled-checkbox";
      enabledCb.title = "Include this entry";
      // Clicking the checkbox shouldn't also toggle the <details> open/closed.
      enabledCb.addEventListener("click", (e) => e.stopPropagation());
      enabledCb.addEventListener("change", () => {
        entry.enabled = enabledCb.checked;
        fieldsWrap.hidden = !entry.enabled;
      });
      summary.appendChild(enabledCb);

      const titleSpan = document.createElement("span");
      titleSpan.textContent = entry.args[0] || "(entry)";
      summary.appendChild(titleSpan);

      entryEl.appendChild(summary);

      const fieldsWrap = document.createElement("div");
      fieldsWrap.hidden = !entry.enabled;

      entry.field_names.forEach((fname, fIdx) => {
        const key = fieldKey(section.title, eIdx, fname);
        fieldsWrap.appendChild(
          buildDropdown(fname, entry.args[fIdx], key, (val) => {
            entry.args[fIdx] = val;
            if (fIdx === 0) titleSpan.textContent = val;
          })
        );
      });

      entry.bullets.forEach((bullet, bIdx) => {
        const row = document.createElement("div");
        row.className = "bullet-row";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = bullet.enabled;
        cb.addEventListener("change", () => {
          bullet.enabled = cb.checked;
        });
        row.appendChild(cb);

        const key = bulletKey(section.title, eIdx, bIdx);
        const dd = buildDropdown("", bullet.text, key, (val) => {
          bullet.text = val;
        });
        dd.classList.add("bullet-dropdown");
        row.appendChild(dd);
        fieldsWrap.appendChild(row);
      });

      entryEl.appendChild(fieldsWrap);
      sectionEl.appendChild(entryEl);
    });

    container.appendChild(sectionEl);
  });
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Workers aren't supported in this browser, so the split texlive-extra.data can't be reassembled.");
  }
  await navigator.serviceWorker.register("sw.js", { scope: "./" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    // First-ever visit: the page loaded before the SW could control it.
    // sw.js calls clients.claim() on activation, which claims this already-open
    // page without a reload -- just wait for that to take effect.
    await new Promise((resolve) => {
      if (navigator.serviceWorker.controller) {
        resolve();
        return;
      }
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    });
  }
}

async function ensureEngine(onProgress) {
  if (pdflatex) return;
  await ensureServiceWorker();
  runner = new BusyTexRunner({
    busytexBasePath: BUSYTEX_BASE,
    preloadDataPackages: [`${BUSYTEX_BASE}/texlive-basic.js`, `${BUSYTEX_BASE}/texlive-extra.js`],
    onDownloadProgress: onProgress,
  });
  await runner.initialize(true);
  pdflatex = new PdfLatex(runner);
}

async function compileResume(onProgress) {
  await ensureEngine(onProgress);
  const texSource = renderDocument(resumeData);
  const result = await pdflatex.compile({ input: texSource, verbose: "info" });
  return { ...result, texSource };
}

async function init() {
  const [structureRes, optionsRes] = await Promise.all([
    fetch("resume_structure.json"),
    fetch("field_options.json"),
  ]);
  resumeData = await structureRes.json();
  baseOptions = await optionsRes.json();
  localOptions = loadLocalOptions();

  buildForm(document.getElementById("resumeer-form"));

  const compileBtn = document.getElementById("compile-btn");
  const statusEl = document.getElementById("compile-status");
  const previewWrap = document.getElementById("preview-wrap");
  const previewFrame = document.getElementById("preview-frame");
  const downloadLink = document.getElementById("download-link");
  const texOutput = document.getElementById("tex-output");

  compileBtn.addEventListener("click", async () => {
    compileBtn.disabled = true;
    statusEl.hidden = false;
    statusEl.textContent = "Loading LaTeX engine (first time only, then cached)...";
    previewWrap.hidden = true;

    try {
      const result = await compileResume((progress) => {
        statusEl.textContent = `Downloading LaTeX engine data... ${progress.percent}%`;
      });
      texOutput.textContent = result.texSource;

      if (!result.success || !result.pdf) {
        statusEl.textContent = "Compilation failed. See log below.";
        statusEl.classList.add("error");
        const pre = document.createElement("pre");
        pre.className = "compile-log";
        pre.textContent = result.log || "(no log)";
        statusEl.after(pre);
        return;
      }

      statusEl.hidden = true;
      const blob = new Blob([result.pdf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      previewFrame.src = url;
      downloadLink.href = url;
      downloadLink.download = "resume.pdf";
      previewWrap.hidden = false;
    } catch (err) {
      statusEl.textContent = "Error: " + err.message;
      statusEl.classList.add("error");
    } finally {
      compileBtn.disabled = false;
    }
  });
}

init();
