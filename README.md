# Colab — Buscador de productos sin TACC

Webapp para buscar productos libres de gluten basado en el listado oficial
de ANMAT (https://listadoalg.anmat.gob.ar/Home), pensada para usar desde
el celular en el supermercado.

Características v1:

- Búsqueda full-text por nombre, marca, empresa o RNPA con autocompletado.
- Escaneo de código de barras desde la cámara del celular (ZXing) que
  cruza el GTIN contra OpenFoodFacts y luego matchea con el listado
  ANMAT.
- Ingesta automática del Excel oficial de ANMAT (job diario).

> ⚠️ Importante: la ausencia de un producto en este buscador **no
> significa que tenga TACC**. Solo refleja el listado oficial de ANMAT
> en su última actualización.

## Correrlo en VSCode (local)

1. Abrí la carpeta en VSCode (instalá la extensión **Python** de Microsoft).
2. Creá el venv y la dependencia (terminal de VSCode, `Ctrl+ñ`):
   ```bash
   python -m venv .venv
   # Linux/Mac
   source .venv/bin/activate
   # Windows
   .venv\Scripts\activate

   pip install -e ".[dev]"
   playwright install chromium
   ```
   (o corré la tarea **"Setup: install + playwright"** desde
   `Terminal → Run Task…`).
3. **Descargar los datos del ANMAT** (Playwright abre Chromium, hace
   click en "Exportar a Excel" y guarda el archivo):
   ```bash
   python scripts/update_anmat.py            # headless
   python scripts/update_anmat.py --headed   # ver el navegador
   ```
   Esto crea `data/productos.db`. La primera vez conviene usar
   `--headed` para verificar que encuentra el botón.
4. **Levantar la webapp**: en VSCode, panel **Run and Debug** (`Ctrl+Shift+D`),
   elegí **"Run webapp (uvicorn)"** y dale play. O por terminal:
   ```bash
   uvicorn app.main:app --reload
   ```
5. Abrí http://localhost:8000.

> El escáner de cámara solo funciona en `localhost` o HTTPS. Para
> probarlo desde el celular en la misma red, usá `ngrok http 8000`.

## Estructura

```
app/
  main.py       FastAPI + rutas
  db.py         SQLite + FTS5
  ingest.py     descarga y parseo del Excel ANMAT
  search.py     queries
  templates/    Jinja2 (index, scan)
  static/       JS, CSS
scripts/
  update_anmat.py
data/
  productos.db  (generado)
```

## Job de actualización

`.github/workflows/update-anmat.yml` corre `scripts/update_anmat.py`
diariamente y commitea `data/productos.db` actualizado.
