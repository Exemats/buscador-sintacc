"""Comando único para levantar la app.

Si la base de datos no existe o está vacía, descarga el listado de ANMAT
automáticamente y después levanta uvicorn. Pensado para correr con F5
desde VSCode (ver .vscode/launch.json → "▶ Run app").

Uso:
    python scripts/serve.py                 # auto: descarga si hace falta + serve
    python scripts/serve.py --refresh       # fuerza descarga del Excel
    python scripts/serve.py --no-download   # no descargar nunca, solo servir
    python scripts/serve.py --port 9000
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import db, ingest, search  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("serve")


def ensure_data(force: bool, allow_download: bool) -> None:
    n = 0
    try:
        n = search.total()
    except Exception as e:
        log.warning("No se pudo leer la DB: %s", e)
    if n > 0 and not force:
        log.info("DB OK: %d productos cargados.", n)
        return
    if not allow_download:
        log.warning("DB vacía y --no-download activo. La búsqueda no devolverá nada.")
        return
    log.info("DB vacía o refresh forzado. Descargando listado de ANMAT…")
    try:
        n = ingest.run()
        log.info("Descarga completa: %d productos cargados.", n)
    except Exception as e:
        log.error("Falló la descarga automática: %s", e)
        log.error(
            "Podés bajar el Excel a mano desde https://listadoalg.anmat.gob.ar/Home "
            "y correr: python scripts/update_anmat.py <archivo.xlsx>"
        )
        log.error("La app va a arrancar igual, pero con la DB vacía.")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--refresh", action="store_true", help="Fuerza la descarga del Excel")
    p.add_argument("--no-download", action="store_true", help="No descargar de ANMAT")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--no-reload", action="store_true")
    args = p.parse_args()

    # Asegura que la carpeta data/ y el esquema existan.
    db.connect().close()

    ensure_data(force=args.refresh, allow_download=not args.no_download)

    import uvicorn

    log.info("Levantando uvicorn en http://%s:%d", args.host, args.port)
    log.info("Abrí el navegador en http://%s:%d", args.host, args.port)
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=not args.no_reload,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
