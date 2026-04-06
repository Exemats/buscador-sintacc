"""FastAPI app: rutas y API JSON."""
from __future__ import annotations

from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import search

BASE = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE / "templates"))

app = FastAPI(title="Sin TACC — Buscador ANMAT")
app.mount("/static", StaticFiles(directory=str(BASE / "static")), name="static")


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(
        "index.html", {"request": request, "total": search.total()}
    )


@app.get("/scan")
def scan(request: Request):
    return templates.TemplateResponse("scan.html", {"request": request})


@app.get("/api/search")
def api_search(q: str = Query("", min_length=0), limit: int = 20):
    return {"query": q, "results": search.search(q, limit=limit)}


@app.get("/api/producto/{rnpa}")
def api_producto(rnpa: str):
    p = search.get_by_rnpa(rnpa)
    if not p:
        raise HTTPException(status_code=404, detail="No encontrado")
    return p


@app.get("/api/lookup")
def api_lookup(barcode: str = Query(..., min_length=6)):
    """Resuelve un GTIN: primero busca match directo en DB; si no, consulta
    OpenFoodFacts para obtener nombre/marca y vuelve a buscar en la DB."""
    direct = search.get_by_gtin(barcode)
    if direct:
        return {"match": True, "via": "gtin", "producto": direct}

    off_name = off_brand = None
    try:
        with httpx.Client(timeout=8.0) as c:
            r = c.get(
                f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == 1:
                    p = data.get("product", {})
                    off_name = p.get("product_name") or p.get("generic_name")
                    off_brand = p.get("brands")
    except httpx.HTTPError:
        pass

    if not off_name and not off_brand:
        return JSONResponse(
            {"match": False, "reason": "barcode_not_found", "barcode": barcode}
        )

    query = " ".join(filter(None, [off_brand, off_name])).strip()
    candidatos = search.search(query, limit=10) if query else []
    return {
        "match": bool(candidatos),
        "via": "openfoodfacts",
        "barcode": barcode,
        "openfoodfacts": {"nombre": off_name, "marca": off_brand},
        "candidatos": candidatos,
    }
