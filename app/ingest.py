"""Descarga el listado de productos sin TACC desde ANMAT y lo carga en SQLite.

El sitio https://listadoalg.anmat.gob.ar/Home es una SPA dinámica, así
que no se puede scrapear con requests/BeautifulSoup: usamos Playwright
para abrir un navegador headless, esperar a que cargue, hacer click en
"Exportar a Excel" y capturar el archivo descargado.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
from pathlib import Path
from typing import Iterable

import pandas as pd

from . import db

log = logging.getLogger(__name__)

ANMAT_URL = "https://listadoalg.anmat.gob.ar/Home"

# Mapeo flexible: claves = lo que esperamos en la DB, valores = posibles
# nombres de columna en el Excel del ANMAT (case-insensitive, sin acentos).
COLUMN_ALIASES = {
    "rnpa": ["rnpa", "rnpasenasainv", "rnpa_senasa_inv", "registro", "rnpasenasa"],
    "nombre": ["nombrefantasia", "nombre de fantasia", "nombre", "nombre del producto",
               "producto"],
    "denominacion": ["denominacionventa", "denominacion de venta", "denominacion"],
    "marca": ["marca"],
    "empresa": ["empresa", "razon social", "elaborador", "establecimiento"],
    "categoria": ["tipoproducto", "tipo producto", "categoria", "rubro"],
    "estado": ["estado"],
    "activo": ["activo"],
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


def download_excel(
    dest: Path,
    *,
    headless: bool = True,
    timeout_ms: int = 90_000,
) -> Path:
    """Descarga el Excel oficial de ANMAT usando Playwright.

    Abre el navegador, espera a que cargue la página dinámica, busca el
    botón/link "Exportar a Excel", lo clickea y captura el archivo.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError(
            "Playwright no está instalado. Corré:\n"
            "    pip install -e .\n"
            "    playwright install chromium"
        ) from e

    dest.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            accept_downloads=True,
            locale="es-AR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.set_default_timeout(timeout_ms)

        log.info("Abriendo %s", ANMAT_URL)
        page.goto(ANMAT_URL, wait_until="networkidle")

        # Probamos varias formas de encontrar el botón "Exportar a Excel".
        candidatos = [
            "text=/exportar a excel/i",
            "text=/exportar/i",
            "role=button[name=/excel/i]",
            "role=link[name=/excel/i]",
            "[title*='Excel' i]",
            "[aria-label*='Excel' i]",
            "img[alt*='Excel' i]",
        ]
        boton = None
        for sel in candidatos:
            loc = page.locator(sel).first
            try:
                if loc.count() > 0:
                    loc.wait_for(state="visible", timeout=5_000)
                    boton = loc
                    log.info("Botón encontrado con selector: %s", sel)
                    break
            except Exception:
                continue

        if boton is None:
            html = page.content()[:2000]
            browser.close()
            raise RuntimeError(
                "No se encontró el botón 'Exportar a Excel' en la página. "
                "El sitio puede haber cambiado. Primeros 2KB del HTML:\n" + html
            )

        log.info("Clickeando el botón y esperando descarga…")
        with page.expect_download(timeout=timeout_ms) as dl_info:
            boton.click()
        download = dl_info.value
        download.save_as(dest)
        browser.close()

    log.info("Excel ANMAT descargado en %s (%d bytes)", dest, dest.stat().st_size)
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
    def _get(row, key):
        c = cols.get(key)
        return (row[c] or "").strip() if c else ""

    rows = []
    skipped_inactive = 0
    for _, r in df.iterrows():
        rnpa = _get(r, "rnpa")
        if not rnpa:
            continue
        estado = _get(r, "estado").lower()
        activo = _get(r, "activo").lower()
        if estado in {"baja", "inactivo", "0", "false"} or activo in {"0", "false", "no"}:
            skipped_inactive += 1
            continue
        nombre = _get(r, "nombre") or _get(r, "denominacion")
        denom = _get(r, "denominacion")
        # Si tenemos las dos, usamos nombre y guardamos denominacion en empresa-fallback.
        empresa = _get(r, "empresa")
        if not empresa and denom and denom != nombre:
            empresa = denom
        rows.append(
            (
                rnpa,
                nombre,
                _get(r, "marca"),
                empresa,
                _get(r, "categoria"),
                _get(r, "provincia"),
                _get(r, "vencimiento"),
                _get(r, "gtin"),
                now,
            )
        )
    if skipped_inactive:
        log.info("Filas inactivas/baja descartadas: %d", skipped_inactive)

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


def run(*, db_path: Path | str | None = None, headless: bool = True) -> int:
    """Descarga + carga. Si la descarga falla, lanza la excepción."""
    raw = Path("data/anmat_raw.xlsx")
    download_excel(raw, headless=headless)
    return load_excel(raw, db_path=db_path)
