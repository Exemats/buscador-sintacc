const q = document.getElementById("q");
const results = document.getElementById("results");

let timer = null;
let lastSeq = 0;

function render(items) {
  if (!items.length) {
    results.innerHTML = '<div class="empty">No figura en el listado ANMAT.</div>';
    return;
  }
  results.innerHTML = items.map(p => `
    <div class="result">
      <div class="name">${escapeHtml(p.nombre || "(sin nombre)")} <span class="badge">SIN TACC</span></div>
      <div class="meta">
        ${escapeHtml(p.marca || "")}${p.marca && p.empresa ? " · " : ""}${escapeHtml(p.empresa || "")}
      </div>
      <div class="meta">RNPA: ${escapeHtml(p.rnpa)}</div>
    </div>
  `).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function doSearch() {
  const term = q.value.trim();
  if (!term) { results.innerHTML = ""; return; }
  const seq = ++lastSeq;
  const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
  if (seq !== lastSeq) return;
  const data = await r.json();
  render(data.results || []);
}

q.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(doSearch, 150);
});
