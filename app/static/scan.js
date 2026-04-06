import { BrowserMultiFormatReader } from "https://esm.sh/@zxing/browser@0.1.5";

const startBtn = document.getElementById("start");
const video = document.getElementById("video");
const status = document.getElementById("status");
const results = document.getElementById("results");

const reader = new BrowserMultiFormatReader();
let active = false;
let lastCode = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderProducto(p) {
  return `
    <div class="result">
      <div class="name">${escapeHtml(p.nombre || "(sin nombre)")} <span class="badge">SIN TACC</span></div>
      <div class="meta">${escapeHtml(p.marca || "")} · ${escapeHtml(p.empresa || "")}</div>
      <div class="meta">RNPA: ${escapeHtml(p.rnpa)}</div>
    </div>`;
}

async function lookup(code) {
  status.textContent = `Consultando código ${code}…`;
  const r = await fetch(`/api/lookup?barcode=${encodeURIComponent(code)}`);
  const data = await r.json();
  if (data.match && data.producto) {
    status.textContent = "Match directo en ANMAT:";
    results.innerHTML = renderProducto(data.producto);
    return;
  }
  if (data.match && data.candidatos?.length) {
    const off = data.openfoodfacts || {};
    status.textContent = `OpenFoodFacts: ${off.marca || ""} ${off.nombre || ""} — candidatos en ANMAT:`;
    results.innerHTML = data.candidatos.map(renderProducto).join("");
    return;
  }
  if (data.openfoodfacts?.nombre) {
    status.textContent = `Producto encontrado en OpenFoodFacts (${data.openfoodfacts.marca || ""} ${data.openfoodfacts.nombre}) pero NO figura en el listado ANMAT.`;
  } else {
    status.textContent = "Código no encontrado en OpenFoodFacts. Probá buscarlo por nombre.";
  }
  results.innerHTML = "";
}

startBtn.addEventListener("click", async () => {
  if (active) return;
  active = true;
  startBtn.disabled = true;
  status.textContent = "Iniciando cámara…";
  try {
    await reader.decodeFromVideoDevice(undefined, video, (result) => {
      if (result) {
        const code = result.getText();
        if (code && code !== lastCode) {
          lastCode = code;
          lookup(code);
        }
      }
    });
  } catch (e) {
    status.textContent = "No se pudo abrir la cámara: " + e.message;
    active = false;
    startBtn.disabled = false;
  }
});
