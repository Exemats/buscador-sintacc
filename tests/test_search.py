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
               (rnpa, rnpa_norm, nombre, marca, empresa, categoria, provincia,
                vencimiento, gtin, actualizado_en)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            [
                ("01-12345", "0112345", "Mermelada de frutilla", "Arcor", "Arcor SA",
                 "dulces", "BA", "", "7790001234567", "now"),
                ("02-67890", "0267890", "Galletitas de arroz", "Gallo", "Molinos",
                 "snacks", "BA", "", "", "now"),
                ("03-99999", "0399999", "Yogur natural", "Sancor", "Sancor",
                 "lacteos", "SF", "", "", "now"),
            ],
        )
    return p


def test_search_rnpa_with_dashes(tmp_db):
    r = search.search("01-12345", db_path=tmp_db)
    assert len(r) == 1 and r[0]["rnpa"] == "01-12345"


def test_search_rnpa_without_dashes(tmp_db):
    """Envases que muestran el RNPA sin guiones deben matchear igual."""
    r = search.search("0112345", db_path=tmp_db)
    assert len(r) == 1 and r[0]["rnpa"] == "01-12345"


def test_search_by_name(tmp_db):
    r = search.search("arcor", db_path=tmp_db)
    assert len(r) == 1
    assert r[0]["rnpa"] == "01-12345"


def test_search_prefix(tmp_db):
    r = search.search("mermel", db_path=tmp_db)
    assert any(p["rnpa"] == "01-12345" for p in r)


def test_get_by_gtin(tmp_db):
    p = search.get_by_gtin("7790001234567", db_path=tmp_db)
    assert p and p["rnpa"] == "01-12345"


def test_search_empty(tmp_db):
    assert search.search("", db_path=tmp_db) == []
