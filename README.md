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

## Desarrollo

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Cargar datos (intenta descargar de ANMAT, o pasale un Excel local):
python scripts/update_anmat.py
# o:
python scripts/update_anmat.py /ruta/a/listado.xlsx

# Levantar la app:
uvicorn app.main:app --reload
```

Luego abrir http://localhost:8000.

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
