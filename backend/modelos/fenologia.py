"""Fenologia configurable y alertas climaticas ORIENTATIVAS (no diagnosticos)."""

FASES = [
    {"id": "reposo", "nombre": "Reposo vegetativo"},
    {"id": "brotacion", "nombre": "Brotación"},
    {"id": "floracion", "nombre": "Floración"},
    {"id": "cuajado", "nombre": "Cuajado"},
    {"id": "desarrollo", "nombre": "Desarrollo del fruto"},
    {"id": "maduracion", "nombre": "Maduración / cosecha"},
]

def grados_dia_acumulados(tmax: list[float], tmin: list[float], base: float = 10.0) -> float:
    return round(sum(max(0.0, (a + b) / 2 - base) for a, b in zip(tmax, tmin)), 1)


def alertas_climaticas(tmax: list[float] | None, tmin: list[float] | None,
                       lluvia: list[float], viento: list[float] | None = None) -> list:
    """Alertas orientativas dia a dia. La meteorologia por si sola no confirma
    ningun dano: son avisos para revisar, no diagnosticos."""
    n = len(lluvia)
    out = []
    for i in range(n):
        tx = (tmax or [None] * n)[i]
        tn = (tmin or [None] * n)[i]
        v = (viento or [None] * n)[i]
        if tn is not None and tn < 0:
            out.append({"dia": i, "codigo": "helada",
                        "mensaje": "Temperatura bajo cero: revisar brotes y frutos jovenes. Orientativo."})
        if tx is not None and tx > 35:
            out.append({"dia": i, "codigo": "calor",
                        "mensaje": "Calor extremo: vigilar estres y riego. Orientativo."})
        if lluvia[i] > 40:
            out.append({"dia": i, "codigo": "lluvia_intensa",
                        "mensaje": "Lluvia intensa: revisar encharcamiento y accesos. Orientativo."})
        if v is not None and v > 50:
            out.append({"dia": i, "codigo": "viento",
                        "mensaje": "Viento fuerte: revisar frutos caidos y goteros. Orientativo."})
    return out
