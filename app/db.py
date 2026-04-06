"""SQLite + FTS5 para el listado de productos sin TACC."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.environ.get("COLAB_DB", "data/productos.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS productos (
    rnpa            TEXT PRIMARY KEY,
    rnpa_norm       TEXT,
    nombre          TEXT,
    marca           TEXT,
    empresa         TEXT,
    categoria       TEXT,
    provincia       TEXT,
    vencimiento     TEXT,
    gtin            TEXT,
    actualizado_en  TEXT
);

CREATE INDEX IF NOT EXISTS idx_productos_rnpa_norm ON productos(rnpa_norm);
CREATE INDEX IF NOT EXISTS idx_productos_gtin ON productos(gtin);

CREATE VIRTUAL TABLE IF NOT EXISTS productos_fts USING fts5(
    rnpa, rnpa_norm, nombre, marca, empresa,
    content='productos', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS productos_ai AFTER INSERT ON productos BEGIN
    INSERT INTO productos_fts(rowid, rnpa, rnpa_norm, nombre, marca, empresa)
    VALUES (new.rowid, new.rnpa, new.rnpa_norm, new.nombre, new.marca, new.empresa);
END;

CREATE TRIGGER IF NOT EXISTS productos_ad AFTER DELETE ON productos BEGIN
    INSERT INTO productos_fts(productos_fts, rowid, rnpa, rnpa_norm, nombre, marca, empresa)
    VALUES ('delete', old.rowid, old.rnpa, old.rnpa_norm, old.nombre, old.marca, old.empresa);
END;

CREATE TRIGGER IF NOT EXISTS productos_au AFTER UPDATE ON productos BEGIN
    INSERT INTO productos_fts(productos_fts, rowid, rnpa, rnpa_norm, nombre, marca, empresa)
    VALUES ('delete', old.rowid, old.rnpa, old.rnpa_norm, old.nombre, old.marca, old.empresa);
    INSERT INTO productos_fts(rowid, rnpa, rnpa_norm, nombre, marca, empresa)
    VALUES (new.rowid, new.rnpa, new.rnpa_norm, new.nombre, new.marca, new.empresa);
END;
"""


def normalize_rnpa(s: str) -> str:
    """Devuelve solo dígitos, para matchear envases que omiten guiones."""
    if not s:
        return ""
    return "".join(ch for ch in s if ch.isdigit())


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    p = Path(path) if path else DB_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


@contextmanager
def session(path: Path | str | None = None):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
