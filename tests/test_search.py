import sqlite3
from pathlib import Path

import pytest

from app import db, search


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    p = tmp_path / "t.db"
    monkeypatch.setattr(db, "DB_PATH", p)
    with db.session(p) as conn:
        conn.executemany(
            """INSERT INTO productos
               (rnpa, nombre, marca, empresa, categoria, provincia,
                vencimiento, gtin, actualizado_en)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            [
                ("1234567", "Mermelada de frutilla", "Arcor", "Arcor SA",
                 "dulces", "BA", "", "7790001234567", "now"),
                ("7654321", "Galletitas de arroz", "Gallo", "Molinos",
                 "snacks", "BA", "", "", "now"),
                ("9999999", "Yogur natural", "Sancor", "Sancor",
                 "lacteos", "SF", "", "", "now"),
            ],
        )
    return p


def test_search_by_name(tmp_db):
    r = search.search("arcor", db_path=tmp_db)
    assert len(r) == 1
    assert r[0]["rnpa"] == "1234567"


def test_search_prefix(tmp_db):
    r = search.search("mermel", db_path=tmp_db)
    assert any(p["rnpa"] == "1234567" for p in r)


def test_search_by_rnpa_exact(tmp_db):
    r = search.search("9999999", db_path=tmp_db)
    assert len(r) == 1
    assert r[0]["nombre"] == "Yogur natural"


def test_get_by_gtin(tmp_db):
    p = search.get_by_gtin("7790001234567", db_path=tmp_db)
    assert p and p["rnpa"] == "1234567"


def test_search_empty(tmp_db):
    assert search.search("", db_path=tmp_db) == []
