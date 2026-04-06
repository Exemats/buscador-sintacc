import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from "https://esm.sh/@zxing/library@0.21.3";

const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const switchBtn = document.getElementById("switch");
const video = document.getElementById("video");
const status = document.getElementById("status");
const results = document.getElementById("results");
const manualForm = document.getElementById("manual-form");
const manualInput = document.getElementById("manual-input");

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

const reader = new BrowserMultiFormatReader(hints, 300);

let controls = null;
let lastCode = null;
let lastCodeAt = 0;
let cameras = [];
let cameraIdx = 0;

function setStatus(msg) { status.textContent = msg || ""; }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function field(label, value, opts = {}) {
  if (!value) return "";
  const cls = opts.mono ? "value mono" : "value";
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><span class="${cls}">${escapeHtml(value)}</span></div>`;
}

function renderProducto(p) {
  const titulo = p.nombre || p.empresa || p.rnpa;
  return `
    <li class="result-card">
      <header class="result-header">
        <h2 class="title">${escapeHtml(titulo)}</h2>
        <span class="badge">SIN TACC</span>
      </header>
      <div class="fields">
        ${field("Marca", p.marca)}
        ${field("Empresa", p.empresa)}
        ${field("Categoría", p.categoria)}
        ${field("RNPA", p.rnpa, { mono: true })}
      </div>
    </li>`;
}

function vibrate(ms = 80) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

async function lookup(code) {
  setStatus(`Consultando código ${code}…`);
  results.innerHTML = "";
  try {
    const r = await fetch(`/api/lookup?barcode=${encodeURIComponent(code)}`);
    const data = await r.json();
    if (data.match && data.producto) {
      setStatus("✓ Match directo en ANMAT por código de barras:");
      results.innerHTML = renderProducto(data.producto);
      vibrate(150);
      return;
    }
    if (data.match && data.candidatos?.length) {
      const off = data.openfoodfacts || {};
      setStatus(`OpenFoodFacts identificó "${off.marca || ""} ${off.nombre || ""}" — posibles coincidencias en ANMAT:`);
      results.innerHTML = data.candidatos.map(renderProducto).join("");
      vibrate(150);
      return;
    }
    if (data.openfoodfacts?.nombre) {
      setStatus(`Encontrado en OpenFoodFacts (${data.openfoodfacts.marca || ""} ${data.openfoodfacts.nombre}) pero NO figura en el listado ANMAT. Esto NO confirma que tenga TACC.`);
    } else {
      setStatus(`Código ${code}: no encontrado en OpenFoodFacts. Probá buscarlo por nombre.`);
    }
  } catch (e) {
    setStatus("Error al consultar: " + e.message);
  }
}

async function listCameras() {
  try {
    cameras = await BrowserMultiFormatReader.listVideoInputDevices();
    if (cameras.length > 1) switchBtn.hidden = false;
  } catch (e) {
    cameras = [];
  }
}

async function startCamera() {
  try {
    setStatus("Iniciando cámara…");
    if (!cameras.length) await listCameras();
    // Preferir la trasera ("environment") si está disponible.
    const back = cameras.find(c => /back|rear|environment|trase/i.test(c.label));
    const target = back || cameras[cameraIdx] || null;
    const deviceId = target ? target.deviceId : undefined;

    controls = await reader.decodeFromVideoDevice(deviceId, video, (result) => {
      if (!result) return;
      const code = result.getText();
      const now = Date.now();
      // Evitamos reconsultar el mismo código en menos de 3 segundos.
      if (code === lastCode && now - lastCodeAt < 3000) return;
      lastCode = code;
      lastCodeAt = now;
      lookup(code);
    });
    startBtn.hidden = true;
    stopBtn.hidden = false;
    setStatus("Apuntá al código de barras. Mantenelo enfocado y centrado.");
  } catch (e) {
    setStatus("No se pudo abrir la cámara: " + e.message + ". Verificá los permisos del navegador.");
    startBtn.hidden = false;
    stopBtn.hidden = true;
  }
}

function stopCamera() {
  if (controls) {
    try { controls.stop(); } catch {}
    controls = null;
  }
  startBtn.hidden = false;
  stopBtn.hidden = true;
  setStatus("");
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
switchBtn.addEventListener("click", async () => {
  if (!cameras.length) return;
  cameraIdx = (cameraIdx + 1) % cameras.length;
  stopCamera();
  await startCamera();
});

manualForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = manualInput.value.trim();
  if (v) lookup(v);
});

// Pre-cargar lista de cámaras para mostrar/ocultar el botón switch.
listCameras();
