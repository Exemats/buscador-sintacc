const q = document.getElementById("q");
const results = document.getElementById("results");
const status = document.getElementById("status");
const clearBtn = document.getElementById("clear");

const chips = document.querySelectorAll(".chip");

let timer = null;
let lastSeq = 0;
let currentField = "";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function field(label, value, opts = {}) {
  if (!value) return "";
  const cls = opts.mono ? "value mono" : "value";
  return `
    <div class="field">
      <span class="label">${escapeHtml(label)}</span>
      <span class="${cls}">${escapeHtml(value)}</span>
    </div>`;
}

function renderItem(p) {
  const titulo = p.nombre || p.marca || p.empresa || p.rnpa;
  const subt = p.nombre && p.marca ? p.marca : "";
  return `
    <li class="result-card">
      <header class="result-header">
        <div class="result-heading">
          <h2 class="title">${escapeHtml(titulo)}</h2>
          ${subt ? `<p class="subtitle">${escapeHtml(subt)}</p>` : ""}
        </div>
        <span class="badge" aria-label="Producto sin TACC según ANMAT">SIN TACC</span>
      </header>
      <div class="fields">
        ${!subt ? field("Marca", p.marca) : ""}
        ${field("Empresa", p.empresa)}
        ${field("Categoría", p.categoria)}
        ${field("Provincia", p.provincia)}
        ${field("RNPA", p.rnpa, { mono: true })}
        ${field("Vencimiento", p.vencimiento)}
      </div>
    </li>`;
}

function setStatus(msg) {
  status.textContent = msg || "";
}

function render(items, term) {
  if (!term) {
    results.innerHTML = "";
    setStatus("");
    return;
  }
  if (!items.length) {
    results.innerHTML = "";
    setStatus(`Sin coincidencias para "${term}". Esto NO significa que el producto tenga TACC — solo que no figura en el listado ANMAT.`);
    return;
  }
  setStatus(`${items.length} resultado${items.length === 1 ? "" : "s"}`);
  results.innerHTML = items.map(renderItem).join("");
}

async function doSearch() {
  const term = q.value.trim();
  clearBtn.hidden = !term;
  if (!term) {
    render([], "");
    return;
  }
  const seq = ++lastSeq;
  setStatus("Buscando…");
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(term)}&field=${encodeURIComponent(currentField)}`);
    if (seq !== lastSeq) return;
    const data = await r.json();
    render(data.results || [], term);
  } catch (e) {
    if (seq !== lastSeq) return;
    setStatus("Error al buscar: " + e.message);
  }
}

q.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(doSearch, 150);
});

chips.forEach(c => c.addEventListener("click", () => {
  chips.forEach(x => x.classList.remove("is-active"));
  c.classList.add("is-active");
  currentField = c.dataset.field || "";
  doSearch();
  q.focus();
}));

clearBtn.addEventListener("click", () => {
  q.value = "";
  q.focus();
  doSearch();
});
