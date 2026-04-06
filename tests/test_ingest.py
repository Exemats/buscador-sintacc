import pandas as pd

from app import db, ingest


def test_load_excel_roundtrip(tmp_path, monkeypatch):
    xlsx = tmp_path / "anmat.xlsx"
    pd.DataFrame(
        [
            {
                "RNPA": "01-12345",
                "Nombre del producto": "Pan rallado",
                "Marca": "Preferido",
                "Razon Social": "Molinos SA",
                "Categoria": "panificados",
                "Provincia": "BA",
                "Vencimiento": "2026-01-01",
            },
            {
                "RNPA": "02-67890",
                "Nombre del producto": "Fideos",
                "Marca": "Lucchetti",
                "Razon Social": "Molinos SA",
                "Categoria": "pastas",
                "Provincia": "BA",
                "Vencimiento": "2026-06-01",
            },
        ]
    ).to_excel(xlsx, index=False)

    target = tmp_path / "t.db"
    monkeypatch.setattr(db, "DB_PATH", target)
    n = ingest.load_excel(xlsx, db_path=target)
    assert n == 2

    with db.session(target) as conn:
        rows = conn.execute("SELECT rnpa, nombre, marca FROM productos ORDER BY rnpa").fetchall()
    assert [r["rnpa"] for r in rows] == ["01-12345", "02-67890"]
    assert rows[0]["nombre"] == "Pan rallado"
    assert rows[1]["marca"] == "Lucchetti"
