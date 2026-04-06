"""Entry point para descargar/cargar el listado ANMAT.

Uso:
    python scripts/update_anmat.py                  # descarga (Playwright) y carga
    python scripts/update_anmat.py --headed         # ver el navegador mientras descarga
    python scripts/update_anmat.py /ruta/local.xlsx # carga un Excel local ya bajado
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from app import ingest

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main() -> int:
    args = sys.argv[1:]
    headless = True
    if "--headed" in args:
        headless = False
        args.remove("--headed")

    if args:
        path = Path(args[0])
        if not path.exists():
            print(f"No existe: {path}", file=sys.stderr)
            return 2
        n = ingest.load_excel(path)
        print(f"Cargadas {n} filas desde {path}")
        return 0
    try:
        n = ingest.run(headless=headless)
    except Exception as e:
        print(f"Falló la descarga automática de ANMAT: {e}", file=sys.stderr)
        print(
            "Tip: probá con --headed para ver qué pasa, o descargá el Excel "
            "manualmente desde https://listadoalg.anmat.gob.ar/Home y pasá "
            "la ruta como argumento.",
            file=sys.stderr,
        )
        return 1
    print(f"Cargadas {n} filas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
