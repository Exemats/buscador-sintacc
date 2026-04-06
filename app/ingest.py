"""Descarga el listado de productos sin TACC desde ANMAT y lo carga en SQLite.

El sitio https://listadoalg.anmat.gob.ar/Home es un WebForms ASP.NET. El
botón "Exportar a Excel" hace un postback con los campos `__VIEWSTATE`,
`__VIEWSTATEGENERATOR` y `__EVENTVALIDATION`. La función `download_excel`
intenta replicar ese postback. Si ANMAT bloquea o cambia el flujo, se
puede usar `load_excel(path)` con un .xlsx descargado a mano.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
from pathlib import Path
from typing import Iterable

import httpx
import pandas as pd
from bs4 import BeautifulSoup

from . import db

log = logging.getLogger(__name__)

ANMAT_URL = "https://listadoalg.anmat.gob.ar/Home"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Mapeo flexible: claves = lo que esperamos en la DB, valores = posibles
# nombres de columna en el Excel del ANMAT (case-insensitive, sin acentos).
COLUMN_ALIASES = {
    "rnpa": ["rnpa", "rnpasenasainv", "rnpa_senasa_inv", "registro"],
    "nombre": ["nombre", "nombre del producto", "producto", "nombre de fantasia"],
    "marca": ["marca"],
    "empresa": ["empresa", "razon social", "elaborador"],
    "categoria": ["categoria", "rubro"],
    "provincia": ["provincia"],
    "vencimiento": ["vencimiento", "vto", "fecha vencimiento"],
    "gtin": ["gtin", "ean", "codigo de barras"],
}


def _normalize(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[áàä]", "a", s)
    s = re.sub(r"[éèë]", "e", s)
    s = re.sub(r"[íìï]", "i", s)
    s = re.sub(r"[óòö]", "o", s)
    s = re.sub(r"[úùü]", "u", s)
    return re.sub(r"[^a-z0-9 ]+", "", s)


def _resolve_columns(df_columns: Iterable[str]) -> dict[str, str | None]:
    norm_to_orig = {_normalize(c): c for c in df_columns}
    out: dict[str, str | None] = {}
    for key, aliases in COLUMN_ALIASES.items():
        out[key] = None
        for alias in aliases:
            n = _normalize(alias)
            if n in norm_to_orig:
                out[key] = norm_to_orig[n]
                break
    return out


def download_excel(dest: Path, *, timeout: float = 60.0) -> Path:
    """Descarga el Excel oficial de ANMAT replicando el postback ASP.NET."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    }
    with httpx.Client(headers=headers, timeout=timeout, follow_redirects=True) as c:
        r = c.get(ANMAT_URL)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")

        def _v(name: str) -> str:
            tag = soup.find("input", {"name": name})
            return tag["value"] if tag and tag.has_attr("value") else ""

        # Buscar el botón/control de exportación. Probamos varios nombres.
        export_candidates = [
            "ctl00$ContentPlaceHolder1$btnExportar",
            "ctl00$ContentPlaceHolder1$btnExcel",
            "ctl00$MainContent$btnExportar",
        ]
        export_name = None
        for name in export_candidates:
            if soup.find("input", {"name": name}) or soup.find(
                "a", {"id": name.replace("$", "_")}
            ):
                export_name = name
                break
        if export_name is None:
            # Fallback: primer input cuyo id contenga "xport" o "xcel".
            tag = soup.find(
                "input",
                {"name": re.compile(r"(xport|xcel)", re.I)},
            )
            if tag:
                export_name = tag["name"]
        if export_name is None:
            raise RuntimeError(
                "No se encontró el control de 'Exportar a Excel' en la página ANMAT."
                " Descargá el .xlsx manualmente y pasalo a load_excel()."
            )

        data = {
            "__VIEWSTATE": _v("__VIEWSTATE"),
            "__VIEWSTATEGENERATOR": _v("__VIEWSTATEGENERATOR"),
            "__EVENTVALIDATION": _v("__EVENTVALIDATION"),
            "__EVENTTARGET": "",
            "__EVENTARGUMENT": "",
            export_name: "Exportar",
        }
        r2 = c.post(ANMAT_URL, data=data)
        r2.raise_for_status()
        ct = r2.headers.get("content-type", "")
        if "sheet" not in ct and "excel" not in ct and not r2.content[:2] == b"PK":
            raise RuntimeError(
                f"Respuesta inesperada de ANMAT (content-type={ct!r}); "
                "probablemente cambió el flujo de exportación."
            )
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r2.content)
        log.info("Excel ANMAT descargado en %s (%d bytes)", dest, len(r2.content))
        return dest


def load_excel(path: Path | str, *, db_path: Path | str | None = None) -> int:
    """Carga el Excel a la DB. Devuelve la cantidad de filas insertadas."""
    df = pd.read_excel(path, dtype=str).fillna("")
    cols = _resolve_columns(df.columns)
    if not cols["rnpa"] or not cols["nombre"]:
        raise RuntimeError(
            f"No se pudieron mapear las columnas obligatorias (rnpa, nombre). "
            f"Columnas vistas: {list(df.columns)}"
        )
    now = dt.datetime.utcnow().isoformat(timespec="seconds")
    rows = []
    for _, r in df.iterrows():
        rnpa = (r[cols["rnpa"]] or "").strip()
        if not rnpa:
            continue
        rows.append(
            (
                rnpa,
                (r[cols["nombre"]] or "").strip() if cols["nombre"] else "",
                (r[cols["marca"]] or "").strip() if cols["marca"] else "",
                (r[cols["empresa"]] or "").strip() if cols["empresa"] else "",
                (r[cols["categoria"]] or "").strip() if cols["categoria"] else "",
                (r[cols["provincia"]] or "").strip() if cols["provincia"] else "",
                (r[cols["vencimiento"]] or "").strip() if cols["vencimiento"] else "",
                (r[cols["gtin"]] or "").strip() if cols["gtin"] else "",
                now,
            )
        )

    with db.session(db_path) as conn:
        conn.execute("DELETE FROM productos")
        conn.executemany(
            """INSERT INTO productos
               (rnpa, nombre, marca, empresa, categoria, provincia,
                vencimiento, gtin, actualizado_en)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            rows,
        )
    log.info("Cargadas %d filas en %s", len(rows), db_path or db.DB_PATH)
    return len(rows)


def run(*, db_path: Path | str | None = None) -> int:
    """Descarga + carga. Si la descarga falla, lanza la excepción."""
    raw = Path("data/anmat_raw.xlsx")
    download_excel(raw)
    return load_excel(raw, db_path=db_path)
