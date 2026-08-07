import { renderDocument } from "./resume-renderer.js";
import { BusyTexRunner, PdfLatex, clearAllPackageCache } from "https://cdn.jsdelivr.net/npm/texlyre-busytex@1.2.3/dist/index.js";

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

// Small LaTeX-subset -> HTML converter, purely for display in the dropdown
// list: renders \textbf{...} and \emph{...}/\textit{...} (with nesting) as
// real bold/italic, unescapes common specials (\& \% \$ \# \_) and simple
// math-mode escapes ($<$, $>$, $|$, ...), and passes everything else
// through as literal (HTML-escaped) text. Generic by content, not tied to
// any section/field name -- it just renders whatever markup is present.
function texInlineToHtml(text) {
  let i = 0;
  const n = text.length;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function parseGroup() {
    i++; // consume '{'
    let html = "";
    while (i < n && text[i] !== "}") html += parseToken();
    if (i < n) i++; // consume '}'
    return html;
  }

  function parseToken() {
    if (text.startsWith("\\textbf{", i)) {
      i += 7;
      return `<strong>${parseGroup()}</strong>`;
    }
    if (text.startsWith("\\emph{", i)) {
      i += 5;
      return `<em>${parseGroup()}</em>`;
    }
    if (text.startsWith("\\textit{", i)) {
      i += 7;
      return `<em>${parseGroup()}</em>`;
    }
    if (text[i] === "\\" && "&%$#_{}".includes(text[i + 1] || "")) {
      const ch = text[i + 1];
      i += 2;
      return esc(ch);
    }
    if (text[i] === "$") {
      let j = i + 1;
      while (j < n && text[j] !== "$") j++;
      const inner = text.slice(i + 1, j);
      i = j + 1;
      return esc(inner);
    }
    if (text[i] === "{") return parseGroup();
    const ch = text[i];
    i++;
    return esc(ch);
  }

  let out = "";
  while (i < n) out += parseToken();
  return out;
}

function formatChoiceHtml(value, maxLen = 100) {
  const raw = value.replace(/\n/g, " / ");
  const truncated = raw.length <= maxLen ? raw : raw.slice(0, maxLen - 3) + "...";
  return texInlineToHtml(truncated);
}

function closeAllDropdowns() {
  document.querySelectorAll(".tex-select.open").forEach((el) => {
    el.classList.remove("open");
    const menu = el.querySelector(".tex-select-menu");
    if (menu) menu.hidden = true;
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".tex-select")) closeAllDropdowns();
});

function buildDropdown(labelText, currentValue, key, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "field-row";

  if (labelText) {
    const label = document.createElement("label");
    label.textContent = labelText;
    wrap.appendChild(label);
  }

  const combo = document.createElement("div");
  combo.className = "tex-select";
  combo.tabIndex = 0;

  const trigger = document.createElement("div");
  trigger.className = "tex-select-trigger";
  const currentEl = document.createElement("div");
  currentEl.className = "tex-select-current";
  currentEl.innerHTML = formatChoiceHtml(currentValue);
  const caret = document.createElement("i");
  caret.className = "fas fa-chevron-down tex-select-caret";
  trigger.appendChild(currentEl);
  trigger.appendChild(caret);
  combo.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "tex-select-menu";
  menu.hidden = true;
  combo.appendChild(menu);

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

  function selectValue(val) {
    currentValue = val;
    currentEl.innerHTML = formatChoiceHtml(val);
    onChange(val);
  }

  function renderMenu() {
    menu.innerHTML = "";
    for (const choice of optionsFor(key, currentValue)) {
      const opt = document.createElement("div");
      opt.className = "tex-select-option";
      opt.innerHTML = formatChoiceHtml(choice);
      if (choice === currentValue) opt.classList.add("selected");
      opt.addEventListener("click", () => {
        closeAllDropdowns();
        selectValue(choice);
      });
      menu.appendChild(opt);
    }
    const addOpt = document.createElement("div");
    addOpt.className = "tex-select-option tex-select-add-new";
    addOpt.textContent = "+ Add new option...";
    addOpt.addEventListener("click", () => {
      closeAllDropdowns();
      newRow.hidden = false;
      newInput.focus();
    });
    menu.appendChild(addOpt);
  }

  trigger.addEventListener("click", () => {
    if (menu.hidden) {
      closeAllDropdowns();
      renderMenu();
      menu.hidden = false;
      combo.classList.add("open");
    } else {
      closeAllDropdowns();
    }
  });

  combo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trigger.click();
    } else if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });

  addBtn.addEventListener("click", () => {
    const val = newInput.value.trim();
    if (!val) return;
    addLocalOption(key, val);
    selectValue(val);
    newRow.hidden = true;
    newInput.value = "";
  });

  wrap.appendChild(combo);
  wrap.appendChild(newRow);
  return wrap;
}

function buildForm(container) {
  container.innerHTML = "";

  resumeData.sections.forEach((section, sIdx) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "resumeer-section";

    const header = document.createElement("div");
    header.className = "resumeer-section-header";

    const sectionCb = document.createElement("input");
    sectionCb.type = "checkbox";
    sectionCb.checked = section.enabled;
    sectionCb.className = "section-enabled-checkbox";
    sectionCb.title = "Include this section";
    sectionCb.addEventListener("change", () => {
      section.enabled = sectionCb.checked;
      bodyWrap.hidden = !section.enabled;
    });
    header.appendChild(sectionCb);

    const h2 = document.createElement("h2");
    h2.textContent = section.title;
    header.appendChild(h2);

    sectionEl.appendChild(header);

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "resumeer-section-body";
    bodyWrap.hidden = !section.enabled;
    sectionEl.appendChild(bodyWrap);

    if (section.kind === "raw") {
      const key = rawKey(section.title);
      bodyWrap.appendChild(
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
      titleSpan.className = "resumeer-entry-title";
      titleSpan.innerHTML = formatChoiceHtml(entry.args[0] || "(entry)");
      summary.appendChild(titleSpan);

      entryEl.appendChild(summary);

      const fieldsWrap = document.createElement("div");
      fieldsWrap.hidden = !entry.enabled;

      entry.field_names.forEach((fname, fIdx) => {
        const key = fieldKey(section.title, eIdx, fname);
        fieldsWrap.appendChild(
          buildDropdown(fname, entry.args[fIdx], key, (val) => {
            entry.args[fIdx] = val;
            if (fIdx === 0) titleSpan.innerHTML = formatChoiceHtml(val);
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
      bodyWrap.appendChild(entryEl);
    });

    container.appendChild(sectionEl);
  });
}

// Best-effort: registers the Service Worker that reassembles the chunked
// texlive-extra.data. This must never block the compile forever -- if it
// doesn't confirm control within a few seconds, we proceed anyway. Worst
// case the chunked-file fetch itself fails later with a visible error
// (and if the unsplit texlive-extra.data happens to be present, e.g. in
// local dev, the SW isn't even needed for that fetch to succeed).
async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Resumeer] Service Workers not supported in this browser.");
    return;
  }
  try {
    console.info("[Resumeer] Registering service worker...");
    await navigator.serviceWorker.register("sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
    console.info("[Resumeer] Service worker ready. Controller present:", !!navigator.serviceWorker.controller);
  } catch (err) {
    console.warn("[Resumeer] Service worker registration failed:", err);
    return;
  }

  if (navigator.serviceWorker.controller) return;

  // First-ever visit: the page loaded before the SW could control it.
  // sw.js calls clients.claim() on activation, which claims this already-open
  // page without a reload -- wait for that, but don't block indefinitely.
  console.info("[Resumeer] Waiting for service worker to take control...");
  await Promise.race([
    new Promise((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  console.info("[Resumeer] Proceeding. Controller present:", !!navigator.serviceWorker.controller);
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

// Deterministic, non-reversible: same selections -> same hash, but the
// hash itself gives no hint which entries/bullets/values were picked.
async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  function clearExtraStatusElements() {
    document.querySelectorAll(".compile-log, .retry-actions").forEach((el) => el.remove());
    statusEl.classList.remove("error");
  }

  async function resetEngineState() {
    // Terminate the old runner's Worker first -- it holds its own open
    // IndexedDB connection, which can silently block deleteDatabase() below
    // from actually completing if left running.
    try {
      runner?.terminate();
      console.info("[Resumeer] Terminated previous engine instance.");
    } catch (err) {
      console.warn("[Resumeer] Failed to terminate previous engine:", err);
    }
    runner = null;
    pdflatex = null;
    try {
      await clearAllPackageCache();
      console.info("[Resumeer] Cleared BusyTeX package cache.");
    } catch (err) {
      console.warn("[Resumeer] Failed to clear package cache:", err);
    }
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        console.info("[Resumeer] Unregistered", regs.length, "service worker(s).");
      }
    } catch (err) {
      console.warn("[Resumeer] Failed to unregister service worker:", err);
    }
  }

  function showFailure(message, log) {
    statusEl.textContent = message;
    statusEl.classList.add("error");

    if (log) {
      const pre = document.createElement("pre");
      pre.className = "compile-log";
      pre.textContent = log;
      statusEl.after(pre);
    }

    const actions = document.createElement("div");
    actions.className = "retry-actions";
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Clear cache & retry";
    retryBtn.addEventListener("click", async () => {
      try {
        retryBtn.disabled = true;
        retryBtn.textContent = "Clearing cache...";
        await resetEngineState();
        console.info("[Resumeer] Retrying compile after cache clear.");
        compileBtn.click();
      } catch (err) {
        console.error("[Resumeer] Retry failed:", err);
        showFailure("Retry failed: " + err.message);
      }
    });
    actions.appendChild(retryBtn);
    (document.querySelector(".compile-log") || statusEl).after(actions);
  }

  compileBtn.addEventListener("click", async () => {
    compileBtn.disabled = true;
    clearExtraStatusElements();
    statusEl.hidden = false;
    statusEl.textContent = "Loading LaTeX engine (first time only, then cached)...";
    previewWrap.hidden = true;

    try {
      const result = await compileResume((progress) => {
        statusEl.textContent = `Downloading LaTeX engine data... ${progress.percent}%`;
      });
      texOutput.textContent = result.texSource;

      if (!result.success || !result.pdf) {
        showFailure("Compilation failed. See log below.", result.log || "(no log)");
        return;
      }

      statusEl.hidden = true;
      const blob = new Blob([result.pdf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const hash = (await hashText(result.texSource)).slice(0, 10);
      previewFrame.src = url;
      downloadLink.href = url;
      downloadLink.download = `resume_vikramanantha_${hash}.pdf`;
      previewWrap.hidden = false;
    } catch (err) {
      showFailure("Error: " + err.message);
    } finally {
      compileBtn.disabled = false;
    }
  });
}

init();
