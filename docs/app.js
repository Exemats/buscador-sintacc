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

const elChips = document.querySelectorAll(".chip[data-field]");
const elFieldInputsContainer = $("#field-inputs");
const elSearchRow = elQ.closest(".search-row");

let allProductos = [];
let mini = null;
let dataMeta = null;

const FIELD_LABELS = { "": "todos los campos", n: "nombre", m: "marca", e: "empresa" };

// Índice de marcas para detección en OCR/scanner.
let brandsSorted = []; // [{ lower, original }] ordenado por longitud desc

function buildBrandIndex() {
  const seen = new Set();
  brandsSorted = allProductos
    .map(p => (p.m || "").trim())
    .filter(b => b.length >= 3 && !seen.has(b.toLowerCase()) && seen.add(b.toLowerCase()))
    .map(b => ({ lower: b.toLowerCase(), original: b }))
    .sort((a, b) => b.lower.length - a.lower.length);
}

// Busca la primera marca conocida que aparezca en el texto OCR.
// Devuelve el valor original del dataset (p.ej. "NATURA") o null.
function detectBrand(text) {
  const lower = text.toLowerCase();
  for (const { lower: bl, original } of brandsSorted) {
    if (lower.includes(bl)) return original;
  }
  return null;
}

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
  // MiniSearch: índice tolerante a typos y palabras incompletas.
  // eslint-disable-next-line no-undef
  mini = new MiniSearch({
    idField: "r",
    fields: ["n", "m", "e"],
    storeFields: ["r", "rn", "n", "m", "e", "c", "p"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.25,
      boost: { n: 2, m: 1.6 },
      combineWith: "OR",
    },
    extractField: (doc, field) => doc[field] || "",
  });
  mini.addAll(allProductos);
  buildBrandIndex();
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

// field: "" = todos, "n" = nombre, "m" = marca, "e" = empresa
function searchProductos(term, field = "") {
  if (!mini || !term) return [];
  // 1) ¿Parece un RNPA o código numérico? (>=4 dígitos al normalizar)
  //    Se aplica siempre, sin importar el campo activo.
  const norm = normalizeRnpa(term);
  const isMostlyNumeric = term.replace(/\D/g, "").length / term.length > 0.6;
  if (isMostlyNumeric && norm.length >= 4) {
    const exact = allProductos.filter(p => p.rn === norm || p.r === term);
    if (exact.length) return exact;
    if (norm.length >= 6) {
      const prefix = allProductos.filter(p => p.rn && p.rn.startsWith(norm));
      if (prefix.length) return prefix;
    }
  }
  // 2) Búsqueda fuzzy/text. Si hay campo activo, busca solo en ese campo.
  const fieldOpts = field ? { fields: [field], boost: {} } : {};
  let hits = mini.search(term, { combineWith: "AND", ...fieldOpts });
  if (!hits.length) hits = mini.search(term, { combineWith: "OR", ...fieldOpts });
  return hits
    .map(r => allProductos.find(p => p.r === r.id))
    .filter(Boolean);
}

// Intersección de resultados por múltiples campos.
// fieldMap: e.g. { n: "mayonesa", m: "natura" }
function searchMultiField(fieldMap) {
  let resultSet = null;
  for (const [fld, term] of Object.entries(fieldMap)) {
    if (!term) continue;
    const hits = searchProductos(term, fld);
    const ids = new Set(hits.map(p => p.r));
    resultSet = resultSet === null ? ids : new Set([...resultSet].filter(id => ids.has(id)));
  }
  if (resultSet === null) return [];
  return allProductos.filter(p => resultSet.has(p.r));
}

function isMultiFieldMode() {
  return [...elChips].some(c => c.dataset.field && c.getAttribute("aria-pressed") === "true");
}

function getActiveFieldMap() {
  const fieldMap = {};
  document.querySelectorAll('.chip[data-field]:not([data-field=""])[aria-pressed="true"]').forEach(chip => {
    const inp = document.getElementById(`q-${chip.dataset.field}`);
    if (inp) fieldMap[chip.dataset.field] = inp.value.trim();
  });
  return fieldMap;
}

let timer = null;
let lastSeq = 0;

function onSearchInput() {
  clearTimeout(timer);
  if (isMultiFieldMode()) {
    const fieldMap = getActiveFieldMap();
    const hasAny = Object.values(fieldMap).some(v => v);
    elClear.hidden = true;
    if (!hasAny) { render([], ""); return; }
    const seq = ++lastSeq;
    timer = setTimeout(() => {
      if (seq !== lastSeq) return;
      const results = searchMultiField(fieldMap);
      const termStr = Object.entries(fieldMap)
        .filter(([, v]) => v)
        .map(([k, v]) => `${FIELD_LABELS[k]}: "${v}"`)
        .join(" + ");
      render(results, termStr);
    }, 100);
  } else {
    const term = elQ.value.trim();
    elClear.hidden = !term;
    if (!term) { render([], ""); return; }
    const seq = ++lastSeq;
    timer = setTimeout(() => {
      if (seq !== lastSeq) return;
      render(searchProductos(term, ""), term);
    }, 100);
  }
}

// Chips: "Todos" resetea, los demás son multi-seleccionables
elChips.forEach(chip => {
  chip.addEventListener("click", () => {
    const field = chip.dataset.field;
    if (field === "") {
      // Resetear a modo general
      elChips.forEach(c => c.setAttribute("aria-pressed", c === chip ? "true" : "false"));
      document.querySelectorAll(".field-input").forEach(inp => { inp.value = ""; });
      elFieldInputsContainer.hidden = true;
      elSearchRow.hidden = false;
      elQ.focus();
      onSearchInput();
      return;
    }
    // Toggle este campo
    const isActive = chip.getAttribute("aria-pressed") === "true";
    chip.setAttribute("aria-pressed", isActive ? "false" : "true");
    // Desactivar "Todos"
    document.querySelector('.chip[data-field=""]').setAttribute("aria-pressed", "false");
    // Mostrar/ocultar la fila del input para este campo
    const row = document.getElementById(`fi-${field}`);
    if (row) {
      row.hidden = isActive;
      if (!isActive) {
        const inp = document.getElementById(`q-${field}`);
        if (inp) { inp.value = ""; inp.focus(); }
      }
    }
    // Mostrar/ocultar el contenedor de inputs y la barra de búsqueda general
    const anyActive = [...elChips].some(c => c.dataset.field && c.getAttribute("aria-pressed") === "true");
    elFieldInputsContainer.hidden = !anyActive;
    elSearchRow.hidden = anyActive;
    onSearchInput();
  });
});

document.querySelectorAll(".field-input").forEach(inp => {
  inp.addEventListener("input", onSearchInput);
});

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
    const offNombre = (p.product_name || p.generic_name || "").trim();
    const offMarca = (p.brands || "").split(",")[0].trim();

    let results = [];
    let matchDesc = "";

    // 1) Buscar por marca Y nombre simultáneamente (intersección)
    if (offMarca && offNombre) {
      results = searchMultiField({ m: offMarca, n: offNombre });
      if (results.length) matchDesc = `marca "${offMarca}" y nombre "${offNombre}"`;
    }
    // 2) Solo marca
    if (!results.length && offMarca) {
      results = searchProductos(offMarca, "m");
      if (results.length) matchDesc = `marca "${offMarca}"`;
    }
    // 3) Solo nombre
    if (!results.length && offNombre) {
      results = searchProductos(offNombre, "n");
      if (results.length) matchDesc = `nombre "${offNombre}"`;
    }
    // 4) Fallback: búsqueda combinada genérica
    if (!results.length) {
      const query = [offMarca, offNombre].filter(Boolean).join(" ");
      if (!query) {
        setStatus(`Código ${code}: el producto existe en OpenFoodFacts pero sin nombre claro.`, "error");
        return;
      }
      results = searchProductos(query);
      matchDesc = `"${query}"`;
      elQ.value = query;
    } else {
      elQ.value = [offMarca, offNombre].filter(Boolean).join(" ");
    }

    if (results.length) {
      setStatus(`OpenFoodFacts identificó ${matchDesc} — coincidencias en ANMAT:`, "ok");
      render(results, elQ.value);
    } else {
      setStatus(`OpenFoodFacts identificó ${matchDesc || `"${code}"`} pero NO figura en ANMAT. Esto NO confirma que tenga TACC.`, "error");
      render([], elQ.value);
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

// Pre-procesa la imagen para mejorar OCR: la escala a un ancho mínimo
// de 1600 px, la pasa a escala de grises y aumenta contraste.
async function preprocessImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const targetW = Math.max(1600, img.naturalWidth);
    const scale = targetW / img.naturalWidth;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    // Grayscale + contraste fuerte centrado en 128.
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Aumento de contraste (factor ~1.6).
      const c = Math.min(255, Math.max(0, (g - 128) * 1.6 + 128));
      d[i] = d[i + 1] = d[i + 2] = c;
    }
    ctx.putImageData(data, 0, 0);
    return await new Promise(res => canvas.toBlob(res, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extractRnpa(text) {
  // Intenta varias variantes: con/sin puntos, "Nº", "No", etc.
  const patterns = [
    /R\.?\s*N\.?\s*P\.?\s*A\.?[\s:]*(?:N[ºo°.]*)?\s*([0-9][0-9\s.\-/]{5,15})/i,
    /R\s*N\s*P\s*A[\s:]*([0-9][0-9\s.\-/]{5,15})/i,
    /\b(\d{2}[\s.\-/]\d{5,7})\b/, // 02-123456 patrón típico
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/[^\d]/g, "");
  }
  return null;
}

elOcrInput.addEventListener("change", async () => {
  const file = elOcrInput.files && elOcrInput.files[0];
  if (!file) return;
  setStatus("Procesando imagen…");
  try {
    const Tesseract = await loadTesseract();
    if (!tesseractWorker) {
      setStatus("Cargando modelo OCR (primera vez ~3 MB)…");
      tesseractWorker = await Tesseract.createWorker("spa", 1, {
        // logger: m => console.log(m),
      });
      await tesseractWorker.setParameters({
        // PSM 6 = bloque uniforme de texto. Funciona mejor para envases
        // que el modo "auto" cuando hay fondos coloridos.
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      });
    }

    setStatus("Mejorando imagen…");
    const blob = await preprocessImage(file);

    setStatus("Leyendo el envase (puede tardar 5-10 segundos)…");
    const { data: { text } } = await tesseractWorker.recognize(blob);
    elOcrInput.value = "";
    console.log("[OCR] texto detectado:\n", text);

    const cleaned = (text || "").replace(/[ \t]+/g, " ").trim();
    if (!cleaned) {
      setStatus("No se pudo leer texto en la foto. Probá con mejor luz, más cerca y bien enfocado.", "error");
      return;
    }

    // 1) Intentar RNPA.
    const rnpa = extractRnpa(cleaned);
    if (rnpa) {
      elQ.value = rnpa;
      const results = searchProductos(rnpa);
      if (results.length) {
        setStatus(`RNPA detectado en el envase: ${rnpa}`, "ok");
        render(results, rnpa);
        return;
      }
    }

    // 2) Detectar marca conocida del dataset en el texto del envase.
    //    Si hay marca, buscar específicamente en campo "m"; si también hay
    //    texto de nombre, tratar de afinar los resultados.
    const detectedBrand = detectBrand(cleaned);
    if (detectedBrand) {
      const porMarca = searchProductos(detectedBrand, "m");
      if (porMarca.length) {
        // Intentar afinar con las líneas del texto (campo nombre)
        const lines = cleaned
          .split(/\n+/)
          .map(l => l.trim().replace(/[^\wáéíóúñÁÉÍÓÚÑ\s]/g, " ").replace(/\s+/g, " "))
          .filter(l => l.length >= 4 && /[a-záéíóúñ]/i.test(l));
        let best = null;
        for (const line of lines.sort((a, b) => b.length - a.length).slice(0, 4)) {
          const porNombre = searchProductos(line, "n");
          // cruzar con porMarca
          const cruzados = porMarca.filter(prod => porNombre.some(q => q.r === prod.r));
          if (cruzados.length) { best = { results: cruzados, term: line }; break; }
        }
        if (best) {
          elQ.value = best.term;
          setStatus(`Marca detectada: "${detectedBrand}" · Producto: "${best.term}"`, "ok");
          render(best.results, best.term);
          return;
        }
        // Sin cruce: mostrar todos los productos de esa marca
        elQ.value = detectedBrand;
        setStatus(`Marca detectada en el envase: "${detectedBrand}"`, "ok");
        render(porMarca, detectedBrand);
        return;
      }
    }

    // 3) Intentar con cada línea larga del envase (búsqueda general).
    const lines = cleaned
      .split(/\n+/)
      .map(l => l.trim().replace(/[^\wáéíóúñÁÉÍÓÚÑ\s]/g, " ").replace(/\s+/g, " "))
      .filter(l => l.length >= 4 && /[a-záéíóúñ]/i.test(l));

    // Probar primero la línea más larga, después combinaciones.
    const candidates = [...new Set([
      ...lines.sort((a, b) => b.length - a.length).slice(0, 5),
      lines.join(" ").slice(0, 80),
    ])];

    for (const term of candidates) {
      if (!term) continue;
      const results = searchProductos(term);
      if (results.length) {
        elQ.value = term;
        setStatus(`Texto detectado: "${term}" — coincidencias en ANMAT:`, "ok");
        render(results, term);
        return;
      }
    }

    const preview = lines.slice(0, 3).join(" / ").slice(0, 120);
    setStatus(
      `No encontré coincidencias. Texto detectado: "${preview}…". ` +
      `Probá sacar la foto más cerca del nombre o del RNPA, con buena luz.`,
      "error"
    );
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
