# Colab — Buscador de productos sin TACC

App web pública para buscar productos libres de gluten basada en el listado
oficial de ANMAT (https://listadoalg.anmat.gob.ar/Home), pensada para
usar desde el celular en el supermercado.

**Web pública (GitHub Pages):** https://exemats.github.io/colab/

Características:

- Búsqueda fuzzy/prefijo por nombre, marca, empresa o RNPA (con o sin guiones).
- Escáner de código de barras desde la cámara (`BarcodeDetector` nativo en
  Android, fallback a ZXing en iOS/desktop), con linterna y zoom cuando
  el dispositivo lo soporta.
- "Foto del envase": OCR en el navegador con Tesseract.js que extrae el
  RNPA o el nombre del envase y lo busca en la DB.
- Indicador visible de la fecha de la última actualización del listado.
- Funciona 100% en el navegador, sin servidor: los datos son un único
  JSON estático servido desde GitHub Pages.

> ⚠️ Importante: la ausencia de un producto en este buscador **no
> significa que tenga TACC**. Solo refleja el listado oficial de ANMAT
> al momento de la última actualización.

## Arquitectura

```
app/                Backend Python (solo se usa para la ingesta)
  db.py             SQLite + FTS5
  ingest.py         Descarga el Excel del ANMAT con Playwright
  search.py, main.py  (legacy del modo "uvicorn local", aún funcional)
scripts/
  update_anmat.py   Descarga el Excel y carga la DB
  build_static.py   Exporta la DB a docs/data/productos.json
docs/               Sitio estático servido por GitHub Pages
  index.html
  app.js            SPA: search + scanner + OCR
  styles.css
  data/
    productos.json  Generado por build_static.py
    meta.json
.github/workflows/
  update-anmat.yml  Cron semanal: descarga, build estático, deploy a Pages
```

## Cómo se actualiza el listado

Un workflow de GitHub Actions (`.github/workflows/update-anmat.yml`)
corre **una vez por semana** (lunes 06:00 UTC):

1. Levanta Chromium con Playwright.
2. Abre https://listadoalg.anmat.gob.ar/Home y clickea "Exportar a Excel".
3. Parsea el Excel y arma `data/productos.db`.
4. Genera `docs/data/productos.json` con `scripts/build_static.py`.
5. Commitea los cambios y publica `docs/` en GitHub Pages.

Para forzar una actualización manual: pestaña **Actions → "Update ANMAT
data + deploy" → Run workflow**.

## Desarrollo local

### Probar la web estática (lo que ven los usuarios)

```bash
# 1. Instalar deps Python (una sola vez)
pip install -e ".[dev]"
playwright install chromium

# 2. Descargar datos y generar el JSON estático
python scripts/update_anmat.py
python scripts/build_static.py

# 3. Servir docs/ con cualquier servidor estático
python -m http.server 8000 --directory docs
```

Abrí http://localhost:8000.

### Modo backend (legacy, opcional)

Sigue funcionando el server FastAPI:
```bash
python scripts/serve.py
# o desde VSCode: F5 → "▶ Run app (auto)"
```

## Uso desde el celular

Como es una web pública en HTTPS (GitHub Pages), abrís
https://exemats.github.io/colab/ en el celular y ya tenés:

- Búsqueda por texto.
- Cámara para escanear códigos de barras (requiere permiso de cámara).
- "Foto del envase" usa el `<input type=file capture>` que abre la
  cámara nativa del celular con macro/enfoque correcto, ideal para leer
  el RNPA del envase.

Tip: en Chrome Android, "Agregar a pantalla de inicio" la deja como una
app instalada.
