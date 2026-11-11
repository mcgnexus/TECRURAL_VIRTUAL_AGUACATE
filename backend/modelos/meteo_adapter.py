"""Adaptador meteo dual: AEMET (oficial ES) + Open-Meteo (fallback/ETo).
Cada dato devuelve fuente y fecha para trazabilidad en UI.
Sin API key AEMET funciona en modo mock/demo + Open-Meteo real.
"""
import httpx
from datetime import datetime, timezone

AEMET_BASE = "https://opendata.aemet.es/opendata/api"

async def fetch_open_meteo(lat: float, lon: float, dias: int = 14) -> dict:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&daily=et0_fao_evapotranspiration,precipitation_sum"
        "&forecast_days=16&timezone=auto"
    )
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(url)
        r.raise_for_status()
        j = r.json()
    d = j.get("daily", {})
    eto = d.get("et0_fao_evapotranspiration") or [4.5] * dias
    lluvia = d.get("precipitation_sum") or [0.0] * dias
    return {
        "eto": [float(x or 0) for x in eto[:dias]],
        "lluvia": [float(x or 0) for x in lluvia[:dias]],
        "fuente_eto": "Open-Meteo",
        "fuente_lluvia": "Open-Meteo",
        "proveedor": "Open-Meteo",
        "ubicacion": f"{lat},{lon}",
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

async def fetch_aemet_prediccion(municipio_id: str, api_key: str) -> dict:
    """Devuelve prediccion AEMET por codigo INE (ej. Almunecar 18001). Requiere api_key."""
    headers = {"api_key": api_key, "accept": "application/json"}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{AEMET_BASE}/prediccion/especifica/municipio/diaria/{municipio_id}", headers=headers)
        r.raise_for_status()
        meta = r.json()
        datos_url = meta.get("datos")
        if not datos_url:
            return {"disponible": False, "motivo": "sin URL de datos"}
        r2 = await c.get(datos_url)
        r2.raise_for_status()
        return {"disponible": True, "fuente": "AEMET", "datos": r2.json()[:1]}

async def meteo_combinada(lat: float, lon: float, municipio_id: str | None = None, aemet_key: str | None = None, dias: int = 14) -> dict:
    """Estrategia: intenta AEMET si hay key+municipio, siempre completa con Open-Meteo."""
    base = await fetch_open_meteo(lat, lon, dias)
    resultado = {
        "eto_diaria": base["eto"],
        "lluvia_diaria": base["lluvia"],
        "fuentes": {"eto": base["fuente_eto"], "lluvia": base["fuente_lluvia"]},
        "proveedor": base["proveedor"],
        "ubicacion": base["ubicacion"],
        "actualizado": base["actualizado"],
        "aemet": {"usada": False},
    }
    if municipio_id and aemet_key:
        try:
            a = await fetch_aemet_prediccion(municipio_id, aemet_key)
            resultado["aemet"] = {"usada": a.get("disponible", False), "detalle": "prediccion diaria municipio"}
            if a.get("disponible"):
                resultado["fuentes"]["prediccion_texto"] = "AEMET"
        except Exception as e:
            resultado["aemet"] = {"usada": False, "error": str(e)[:200]}
    return resultado
