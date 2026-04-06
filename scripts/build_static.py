"""Exporta la DB a JSON estático para servirlo desde GitHub Pages.

Genera:
    docs/data/productos.json   ← listado completo (un objeto con array y meta)
    docs/data/meta.json        ← solo metadata (timestamp, total)

El frontend en docs/ carga estos archivos y hace todo en el navegador.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("build")

OUT_DIR = ROOT / "docs" / "data"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with db.session() as conn:
        rows = conn.execute(
            """SELECT rnpa, rnpa_norm, nombre, marca, empresa, categoria,
                      provincia, gtin
               FROM productos
               ORDER BY nombre"""
        ).fetchall()
        last_updated = conn.execute(
            "SELECT MAX(actualizado_en) FROM productos"
        ).fetchone()[0]

    productos = []
    for r in rows:
        # Claves cortas para ahorrar bytes en el JSON.
        item = {
            "r": r["rnpa"],
            "rn": r["rnpa_norm"] or "",
            "n": r["nombre"] or "",
            "m": r["marca"] or "",
            "e": r["empresa"] or "",
            "c": r["categoria"] or "",
            "p": r["provincia"] or "",
        }
        if r["gtin"]:
            item["g"] = r["gtin"]
        productos.append(item)

    generated_at = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    payload = {
        "generated_at": generated_at,
        "data_updated_at": last_updated,
        "total": len(productos),
        "source": "https://listadoalg.anmat.gob.ar/Home",
        "productos": productos,
    }

    out = OUT_DIR / "productos.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    size_kb = out.stat().st_size / 1024
    log.info("Escrito %s (%d productos, %.0f KB)", out, len(productos), size_kb)

    meta = OUT_DIR / "meta.json"
    meta.write_text(json.dumps({
        "generated_at": generated_at,
        "data_updated_at": last_updated,
        "total": len(productos),
    }, ensure_ascii=False, indent=2))
    log.info("Escrito %s", meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
