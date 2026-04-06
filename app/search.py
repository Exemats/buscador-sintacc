"""Búsquedas sobre la tabla productos."""
from __future__ import annotations

import re
import sqlite3
from typing import Any

from . import db


def _row(r: sqlite3.Row) -> dict[str, Any]:
    return {k: r[k] for k in r.keys()}


def _fts_query(q: str) -> str:
    # Tokens alfanuméricos, prefijo en cada uno para autocompletado.
    tokens = re.findall(r"[\wáéíóúñÁÉÍÓÚÑ]+", q, flags=re.UNICODE)
    if not tokens:
        return ""
    return " AND ".join(f"{t}*" for t in tokens)


def search(q: str, limit: int = 20, db_path=None) -> list[dict]:
    q = (q or "").strip()
    if not q:
        return []
    with db.session(db_path) as conn:
        # 1) Si parece un RNPA (>=4 dígitos cuando se sacan separadores),
        #    intentamos match exacto contra rnpa o rnpa_norm.
        norm = db.normalize_rnpa(q)
        if len(norm) >= 4:
            exact = conn.execute(
                "SELECT * FROM productos WHERE rnpa = ? OR rnpa_norm = ? LIMIT 1",
                (q, norm),
            ).fetchone()
            if exact:
                return [_row(exact)]
            # Match por prefijo del rnpa_norm (envases que muestran solo
            # parte del registro).
            if len(norm) >= 6:
                rows = conn.execute(
                    "SELECT * FROM productos WHERE rnpa_norm LIKE ? || '%' LIMIT ?",
                    (norm, limit),
                ).fetchall()
                if rows:
                    return [_row(r) for r in rows]

        fts = _fts_query(q)
        if not fts:
            return []
        rows = conn.execute(
            """
            SELECT p.*
            FROM productos_fts f
            JOIN productos p ON p.rowid = f.rowid
            WHERE productos_fts MATCH ?
            ORDER BY bm25(productos_fts)
            LIMIT ?
            """,
            (fts, limit),
        ).fetchall()
        return [_row(r) for r in rows]


def get_by_rnpa(rnpa: str, db_path=None) -> dict | None:
    rnpa = (rnpa or "").strip()
    norm = db.normalize_rnpa(rnpa)
    with db.session(db_path) as conn:
        r = conn.execute(
            "SELECT * FROM productos WHERE rnpa = ? OR rnpa_norm = ? LIMIT 1",
            (rnpa, norm),
        ).fetchone()
        return _row(r) if r else None


def get_by_gtin(gtin: str, db_path=None) -> dict | None:
    with db.session(db_path) as conn:
        r = conn.execute(
            "SELECT * FROM productos WHERE gtin = ? AND gtin <> ''",
            (gtin.strip(),),
        ).fetchone()
        return _row(r) if r else None


def total(db_path=None) -> int:
    with db.session(db_path) as conn:
        return conn.execute("SELECT COUNT(*) FROM productos").fetchone()[0]
