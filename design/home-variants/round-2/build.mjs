// Joins sections/*.html into index.html: one block per section, its variants switchable, the pick and a note saved in
// localStorage and copied as text. Run: node design/home-variants/build.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const theme = readFileSync(join(dir, "theme.css"), "utf8");
const files = readdirSync(join(dir, "sections")).filter((f) => f.endsWith(".html")).sort();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const blocks = files.map((file) => {
  const html = readFileSync(join(dir, "sections", file), "utf8");
  const head = html.match(/<!--\s*section:\s*([\w-]+)\s*\|\s*([^|]+?)\s*(?:\|\s*([\s\S]*?))?\s*-->/);
  if (!head) throw new Error(`${file}: missing <!-- section: id | Name | job --> header`);
  const [, id, name, job = ""] = head;
  const variants = [...html.matchAll(/<section[^>]*data-variant="([A-Z])"[^>]*>/g)].map((m) => {
    const tag = m[0];
    const attr = (a) => tag.match(new RegExp(`${a}="([^"]*)"`))?.[1] ?? "";
    return { key: m[1], name: attr("data-name"), idea: attr("data-idea") };
  });
  if (variants.length < 2) throw new Error(`${file}: expected 3 <section data-variant="A|B|C"> elements`);
  const tabs = variants
    .map((v) => `<button type="button" class="pick-tab" data-key="${v.key}" title="${v.idea}"><b>${v.key}</b> ${v.name}</button>`)
    .join("");
  const ideas = variants.map((v) => `<p class="pick-idea" data-key="${v.key}"><b>${v.key}: ${v.name}.</b> ${v.idea}</p>`).join("");
  return `
<div class="pick" data-section="${id}" data-title="${esc(name)}" id="s-${id}">
  <div class="pick-bar">
    <div class="pick-head"><span class="pick-name">${esc(name)}</span><span class="pick-job">${esc(job)}</span></div>
    <div class="pick-tabs" role="tablist">${tabs}</div>
    ${ideas}
    <div class="pick-actions">
      <button type="button" class="pick-choose">Wybieram ten wariant</button>
      <input class="pick-note" placeholder="Uwagi do tej sekcji (opcjonalnie)" />
    </div>
  </div>
  <div class="pick-stage">${html}</div>
</div>`;
});

const page = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Work Inbox: warianty strony głównej</title>
<link rel="preconnect" href="https://api.fontshare.com" crossorigin />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,601&display=swap" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11"></script>
<style type="text/tailwindcss">${theme}</style>
<style>
  .pick { border-top: 6px solid #111; }
  .pick-bar { position: sticky; top: 0; z-index: 60; background: #111; color: #eee; font: 13px/1.4 ui-sans-serif, system-ui; padding: 10px 16px; display: grid; gap: 6px; }
  .pick-head { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  .pick-name { font-weight: 700; font-size: 15px; }
  .pick-job { color: #aaa; }
  .pick-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .pick-tab { border: 1px solid #444; border-radius: 6px; padding: 4px 10px; color: #ddd; background: #1c1c1c; cursor: pointer; }
  .pick-tab[aria-selected="true"] { background: #fff; color: #111; border-color: #fff; }
  .pick-tab.chosen::after { content: " ✓"; color: #3c3; font-weight: 700; }
  .pick-idea { color: #bbb; display: none; } .pick-idea.on { display: block; }
  .pick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .pick-choose { background: #3a3; color: #fff; border-radius: 6px; padding: 4px 12px; font-weight: 600; cursor: pointer; }
  .pick-note { flex: 1; min-width: 200px; background: #1c1c1c; border: 1px solid #444; border-radius: 6px; padding: 4px 8px; color: #eee; }
  .pick-stage > section[hidden] { display: none !important; }
  #summary { position: fixed; right: 16px; bottom: 16px; z-index: 70; width: min(360px, calc(100vw - 32px)); background: #111; color: #eee; font: 13px/1.5 ui-sans-serif, system-ui; border-radius: 10px; padding: 12px; box-shadow: 0 10px 30px rgb(0 0 0 / .3); }
  #summary ol { margin: 6px 0 8px; padding-left: 18px; max-height: 40vh; overflow: auto; }
  #summary a { color: #eee; } #summary .none { color: #888; }
  #summary button { background: #fff; color: #111; border-radius: 6px; padding: 4px 10px; font-weight: 600; cursor: pointer; }
  #summary[data-min] ol, #summary[data-min] .s-btns { display: none; }
</style>
</head>
<body class="antialiased">
${blocks.join("\n")}
<aside id="summary">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Twój wybór</b><button type="button" id="s-min">–</button></div>
  <ol></ol>
  <div class="s-btns" style="display:flex;gap:6px"><button type="button" id="s-copy">Kopiuj wybór</button><button type="button" id="s-reset">Wyczyść</button></div>
</aside>
<script>
  const KEY = "workinbox-home-variants-r2";
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} render(); };
  const picks = [...document.querySelectorAll(".pick")];
  function show(pick, key) {
    for (const s of pick.querySelectorAll(":scope > .pick-stage > section[data-variant]")) s.hidden = s.dataset.variant !== key;
    for (const t of pick.querySelectorAll(".pick-tab")) t.setAttribute("aria-selected", String(t.dataset.key === key));
    for (const p of pick.querySelectorAll(".pick-idea")) p.classList.toggle("on", p.dataset.key === key);
    pick.dataset.showing = key;
  }
  for (const pick of picks) {
    const id = pick.dataset.section;
    const s = state[id] || {};
    show(pick, s.choice || "A");
    pick.querySelector(".pick-note").value = s.note || "";
    pick.querySelectorAll(".pick-tab").forEach((t) => t.addEventListener("click", () => show(pick, t.dataset.key)));
    pick.querySelector(".pick-choose").addEventListener("click", () => { state[id] = { ...state[id], choice: pick.dataset.showing }; save(); });
    pick.querySelector(".pick-note").addEventListener("input", (e) => { state[id] = { ...state[id], note: e.target.value }; save(); });
  }
  function render() {
    for (const pick of picks) for (const t of pick.querySelectorAll(".pick-tab")) t.classList.toggle("chosen", state[pick.dataset.section]?.choice === t.dataset.key);
    document.querySelector("#summary ol").innerHTML = picks.map((p) => {
      const s = state[p.dataset.section] || {};
      return '<li><a href="#s-' + p.dataset.section + '">' + p.dataset.title + "</a>: " + (s.choice ? "<b>" + s.choice + "</b>" : '<span class="none">–</span>') + (s.note ? " · " + s.note.replace(/</g, "&lt;") : "") + "</li>";
    }).join("");
  }
  render();
  document.getElementById("s-copy").addEventListener("click", (e) => {
    const text = picks.map((p) => { const s = state[p.dataset.section] || {}; return p.dataset.section + ": " + (s.choice || "-") + (s.note ? " (" + s.note + ")" : ""); }).join("\\n");
    navigator.clipboard.writeText(text).then(() => { e.target.textContent = "Skopiowane"; setTimeout(() => (e.target.textContent = "Kopiuj wybór"), 1500); });
  });
  document.getElementById("s-reset").addEventListener("click", () => { if (confirm("Wyczyścić wybór?")) { state = {}; save(); location.reload(); } });
  document.getElementById("s-min").addEventListener("click", () => document.getElementById("summary").toggleAttribute("data-min"));
</script>
</body>
</html>`;

writeFileSync(join(dir, "index.html"), page);
console.log(`index.html: ${files.length} sections`);
