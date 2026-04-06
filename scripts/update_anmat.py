"""Entry point para descargar/cargar el listado ANMAT.

Uso:
    python scripts/update_anmat.py                  # descarga y carga
    python scripts/update_anmat.py /ruta/local.xlsx # carga un Excel local
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from app import ingest

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main() -> int:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        if not path.exists():
            print(f"No existe: {path}", file=sys.stderr)
            return 2
        n = ingest.load_excel(path)
        print(f"Cargadas {n} filas desde {path}")
        return 0
    try:
        n = ingest.run()
    except Exception as e:
        print(f"Falló la descarga automática de ANMAT: {e}", file=sys.stderr)
        print(
            "Tip: descargá el Excel manualmente desde "
            "https://listadoalg.anmat.gob.ar/Home y volvé a correr "
            "este script con la ruta como argumento.",
            file=sys.stderr,
        )
        return 1
    print(f"Cargadas {n} filas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
