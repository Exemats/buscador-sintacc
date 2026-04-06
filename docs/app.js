// Sin TACC — buscador estático para GitHub Pages.
// Toda la lógica corre en el navegador. Los datos se cargan una vez desde
// ./data/productos.json y se indexan con MiniSearch.

const $ = (sel) => document.querySelector(sel);

const elQ = $("#q");
const elClear = $("#clear-btn");
const elResults = $("#results");
const elStatus = $("#status");
const elEmptyHint = $("#empty-hint");
const elMeta = $("#meta-info");

const elScanBtn = $("#scan-btn");
const elScanModal = $("#scan-modal");
const elScanClose = $("#scan-close");
const elScanStatus = $("#scan-status");
const elVideo = $("#video");
const elTorch = $("#torch-btn");
const elZoomWrap = $("#zoom-wrap");
const elZoom = $("#zoom");

const elOcrBtn = $("#ocr-btn");
const elOcrInput = $("#ocr-input");

const elInfoBtn = $("#info-btn");
const elInfoModal = $("#info-modal");
const elInfoClose = $("#info-close");
const elInfoUpdated = $("#info-updated");

let allProductos = [];
let mini = null;
let dataMeta = null;

// ---------- helpers ----------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function normalizeRnpa(s) {
  return String(s || "").replace(/\D/g, "");
}

function setStatus(msg, kind) {
  elStatus.textContent = msg || "";
  elStatus.className = "status" + (kind ? " " + kind : "");
}

function field(label, value, opts = {}) {
  if (!value) return "";
  const cls = opts.mono ? "value mono" : "value";
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><span class="${cls}">${escapeHtml(value)}</span></div>`;
}

function renderItem(p) {
  // Adapta tanto formato corto (json) como expandido.
  const obj = {
    rnpa: p.r ?? p.rnpa,
    nombre: p.n ?? p.nombre,
    marca: p.m ?? p.marca,
    empresa: p.e ?? p.empresa,
    categoria: p.c ?? p.categoria,
    provincia: p.p ?? p.provincia,
  };
  const titulo = obj.nombre || obj.empresa || obj.rnpa;
  return `
    <li class="result-card">
      <header class="result-header">
        <h3 class="title">${escapeHtml(titulo)}</h3>
        <span class="badge" aria-label="Producto sin TACC según ANMAT">SIN TACC</span>
      </header>
      <div class="fields">
        ${field("Marca", obj.marca)}
        ${field("Empresa", obj.empresa)}
        ${field("Categoría", obj.categoria)}
        ${field("Provincia", obj.provincia)}
        ${field("RNPA", obj.rnpa, { mono: true })}
      </div>
    </li>`;
}

function render(items, term) {
  elEmptyHint.hidden = true;
  if (!term) {
    elResults.innerHTML = "";
    elEmptyHint.hidden = false;
    setStatus("");
    return;
  }
  if (!items.length) {
    elResults.innerHTML = "";
    setStatus(`Sin coincidencias para "${term}". Esto NO significa que el producto tenga TACC — solo que no figura en el listado oficial de ANMAT.`);
    return;
  }
  setStatus(`${items.length} resultado${items.length === 1 ? "" : "s"}`, "ok");
  elResults.innerHTML = items.slice(0, 50).map(renderItem).join("");
}

// ---------- carga + index ----------

async function loadData() {
  setStatus("Cargando listado…");
  try {
    const res = await fetch("./data/productos.json", { cache: "force-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allProductos = data.productos || [];
    dataMeta = data;
    buildIndex();
    updateMetaUI();
    setStatus("");
    elEmptyHint.hidden = false;
  } catch (e) {
    setStatus(
      "No se pudieron cargar los datos: " + e.message +
      ". Probá refrescar la página.",
      "error"
    );
    elMeta.textContent = "Error al cargar datos.";
  }
}

function buildIndex() {
  // MiniSearch: índice fuzzy + prefijo sobre nombre, marca, empresa.
  // eslint-disable-next-line no-undef
  mini = new MiniSearch({
    idField: "r",
    fields: ["n", "m", "e"],
    storeFields: ["r", "rn", "n", "m", "e", "c", "p"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.15,
      boost: { n: 2, m: 1.5 },
      combineWith: "AND",
    },
    extractField: (doc, field) => doc[field] || "",
  });
  mini.addAll(allProductos);
}

function updateMetaUI() {
  if (!dataMeta) return;
  const updated = dataMeta.data_updated_at || dataMeta.generated_at;
  let pretty = "—";
  try {
    const d = new Date(updated);
    pretty = d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  } catch {}
  elMeta.textContent = `${dataMeta.total.toLocaleString("es-AR")} productos · actualizado ${pretty}`;
  if (elInfoUpdated) elInfoUpdated.textContent = pretty;
}

// ---------- búsqueda ----------

function searchProductos(term) {
  if (!mini || !term) return [];
  // 1) ¿Parece un RNPA o código numérico? (>=4 dígitos al normalizar)
  const norm = normalizeRnpa(term);
  if (norm.length >= 4) {
    const exact = allProductos.filter(p => p.rn === norm || p.r === term);
    if (exact.length) return exact;
    // Prefijo: matchea RNPAs cuyo número empieza con lo tipeado.
    if (norm.length >= 6) {
      const prefix = allProductos.filter(p => p.rn && p.rn.startsWith(norm));
      if (prefix.length) return prefix;
    }
  }
  // 2) Búsqueda fuzzy/text
  return mini.search(term).map(r => allProductos.find(p => p.r === r.id)).filter(Boolean);
}

let timer = null;
let lastSeq = 0;

function onSearchInput() {
  const term = elQ.value.trim();
  elClear.hidden = !term;
  clearTimeout(timer);
  if (!term) { render([], ""); return; }
  const seq = ++lastSeq;
  timer = setTimeout(() => {
    if (seq !== lastSeq) return;
    const results = searchProductos(term);
    render(results, term);
  }, 100);
}

elQ.addEventListener("input", onSearchInput);
elClear.addEventListener("click", () => { elQ.value = ""; elQ.focus(); onSearchInput(); });

// ---------- modales ----------

function openModal(modal) { modal.hidden = false; }
function closeModal(modal) { modal.hidden = true; }

elInfoBtn.addEventListener("click", () => openModal(elInfoModal));
elInfoClose.addEventListener("click", () => closeModal(elInfoModal));
elInfoModal.addEventListener("click", (e) => { if (e.target === elInfoModal) closeModal(elInfoModal); });

// ---------- scanner ----------

let zxingReader = null;
let scanControls = null;
let scanTrack = null;
let lastScanCode = null;
let lastScanAt = 0;

async function loadZxing() {
  if (window.ZXingBrowser) return window.ZXingBrowser;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.ZXingBrowser;
}

async function openScanner() {
  openModal(elScanModal);
  elScanStatus.textContent = "Iniciando cámara…";
  try {
    const useNative = "BarcodeDetector" in window;
    if (useNative) {
      await startNativeScanner();
    } else {
      await startZxingScanner();
    }
    enableTrackControls();
  } catch (e) {
    elScanStatus.textContent = "No se pudo abrir la cámara: " + e.message;
  }
}

async function startNativeScanner() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  elVideo.srcObject = stream;
  await elVideo.play();
  scanTrack = stream.getVideoTracks()[0];

  // eslint-disable-next-line no-undef
  const detector = new BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
  });
  let lastVal = null, lastCount = 0;
  const tick = async () => {
    if (elScanModal.hidden) return;
    try {
      const codes = await detector.detect(elVideo);
      if (codes.length) {
        const v = codes[0].rawValue;
        // voting: pedimos 2 lecturas iguales antes de confirmar
        if (v === lastVal) lastCount++;
        else { lastVal = v; lastCount = 1; }
        if (lastCount >= 2) {
          handleScannedCode(v);
          lastVal = null; lastCount = 0;
        }
      }
    } catch {}
    requestAnimationFrame(tick);
  };
  tick();
  elScanStatus.textContent = "Apuntá al código de barras (cámara nativa).";
}

async function startZxingScanner() {
  const ZXingBrowser = await loadZxing();
  zxingReader = new ZXingBrowser.BrowserMultiFormatReader();
  const devices = await ZXingBrowser.BrowserMultiFormatReader.listVideoInputDevices().catch(() => []);
  const back = devices.find(d => /back|rear|environment|trase/i.test(d.label));
  const deviceId = back ? back.deviceId : (devices[0] && devices[0].deviceId);

  scanControls = await zxingReader.decodeFromVideoDevice(deviceId, elVideo, (result) => {
    if (!result) return;
    handleScannedCode(result.getText());
  });
  scanTrack = elVideo.srcObject ? elVideo.srcObject.getVideoTracks()[0] : null;
  elScanStatus.textContent = "Apuntá al código de barras.";
}

function enableTrackControls() {
  if (!scanTrack) return;
  const caps = scanTrack.getCapabilities ? scanTrack.getCapabilities() : {};
  if (caps.torch) {
    elTorch.hidden = false;
    elTorch.onclick = async () => {
      const constraints = elTorch.dataset.on === "1"
        ? { advanced: [{ torch: false }] }
        : { advanced: [{ torch: true }] };
      try {
        await scanTrack.applyConstraints(constraints);
        elTorch.dataset.on = elTorch.dataset.on === "1" ? "0" : "1";
      } catch (e) { /* not supported */ }
    };
  }
  if (caps.zoom) {
    elZoomWrap.hidden = false;
    elZoom.min = caps.zoom.min;
    elZoom.max = caps.zoom.max;
    elZoom.step = caps.zoom.step || 0.1;
    elZoom.value = scanTrack.getSettings().zoom || caps.zoom.min;
    elZoom.oninput = async () => {
      try { await scanTrack.applyConstraints({ advanced: [{ zoom: parseFloat(elZoom.value) }] }); }
      catch {}
    };
  }
}

function handleScannedCode(code) {
  const now = Date.now();
  if (code === lastScanCode && now - lastScanAt < 3000) return;
  lastScanCode = code; lastScanAt = now;
  if (navigator.vibrate) navigator.vibrate(120);
  elScanStatus.textContent = `Código detectado: ${code}`;
  // 1) buscar en DB local por GTIN
  const byGtin = allProductos.filter(p => p.g === code);
  if (byGtin.length) {
    closeScanner();
    elQ.value = code;
    render(byGtin, code);
    return;
  }
  // 2) sino, intentamos OpenFoodFacts → nombre/marca → buscar
  closeScanner();
  elQ.value = code;
  setStatus(`Buscando "${code}" en OpenFoodFacts…`);
  fetchOpenFoodFacts(code);
}

async function fetchOpenFoodFacts(code) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const data = await r.json();
    if (data.status !== 1) {
      setStatus(`Código ${code}: no se encontró información de producto. Probá buscar por nombre.`, "error");
      return;
    }
    const p = data.product || {};
    const nombre = p.product_name || p.generic_name || "";
    const marca = (p.brands || "").split(",")[0].trim();
    const query = [marca, nombre].filter(Boolean).join(" ");
    if (!query) {
      setStatus(`Código ${code}: el producto existe en OpenFoodFacts pero sin nombre claro.`, "error");
      return;
    }
    elQ.value = query;
    const results = searchProductos(query);
    if (results.length) {
      setStatus(`OpenFoodFacts dice "${query}" — coincidencias en ANMAT:`, "ok");
      render(results, query);
    } else {
      setStatus(`OpenFoodFacts identificó "${query}" pero NO figura en ANMAT. Esto NO confirma que tenga TACC.`, "error");
      render([], query);
    }
  } catch (e) {
    setStatus("Error consultando OpenFoodFacts: " + e.message, "error");
  }
}

function closeScanner() {
  closeModal(elScanModal);
  if (scanControls) { try { scanControls.stop(); } catch {} scanControls = null; }
  if (elVideo.srcObject) {
    elVideo.srcObject.getTracks().forEach(t => t.stop());
    elVideo.srcObject = null;
  }
  scanTrack = null;
  elTorch.hidden = true; elZoomWrap.hidden = true;
}

elScanBtn.addEventListener("click", openScanner);
elScanClose.addEventListener("click", closeScanner);
elScanModal.addEventListener("click", (e) => { if (e.target === elScanModal) closeScanner(); });

// ---------- OCR (foto del envase) ----------

let tesseractWorker = null;

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

elOcrBtn.addEventListener("click", () => elOcrInput.click());

elOcrInput.addEventListener("change", async () => {
  const file = elOcrInput.files && elOcrInput.files[0];
  if (!file) return;
  setStatus("Cargando reconocimiento de texto (primera vez puede tardar)…");
  try {
    const Tesseract = await loadTesseract();
    if (!tesseractWorker) {
      tesseractWorker = await Tesseract.createWorker("spa");
    }
    setStatus("Leyendo el envase…");
    const { data: { text } } = await tesseractWorker.recognize(file);
    elOcrInput.value = "";

    // Buscar RNPA en el texto.
    const rnpaMatch = text.match(/R\.?\s*N\.?\s*P\.?\s*A\.?\s*(?:N[ºo°.]*)?\s*(\d{1,2}[\s\-./]?\d{4,7})/i);
    if (rnpaMatch) {
      const term = rnpaMatch[1];
      elQ.value = term;
      const results = searchProductos(term);
      if (results.length) {
        setStatus(`RNPA detectado: ${term}`, "ok");
        render(results, term);
        return;
      }
    }

    // Sino, intentar buscar por las líneas más prometedoras.
    const lines = text
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length >= 4 && /[a-záéíóúñ]/i.test(l))
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
    for (const line of lines) {
      const results = searchProductos(line);
      if (results.length) {
        elQ.value = line;
        setStatus(`Texto detectado en envase: "${line}"`, "ok");
        render(results, line);
        return;
      }
    }
    setStatus(`No encontré coincidencias en el envase. Texto detectado: "${(lines[0] || "").slice(0, 60)}…"`, "error");
  } catch (e) {
    setStatus("Error al leer la imagen: " + e.message, "error");
  }
});

// Cerrar modales con Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!elScanModal.hidden) closeScanner();
    if (!elInfoModal.hidden) closeModal(elInfoModal);
  }
});

loadData();
