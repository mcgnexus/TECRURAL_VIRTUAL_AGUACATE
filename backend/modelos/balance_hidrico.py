"""Balance hidrico diario para aguacate Hass, inspirado en FAO-56.

reserva(t+1) = min(capacidad, reserva(t) + lluvia + riego_efectivo - ETc)
riego_efectivo = riego_aplicado x eficiencia_aplicacion
drenaje(t) = exceso sobre capacidad de campo (estimacion de percolacion
profunda por saturacion; NO diagnostica asfixia radicular).

Definicion de eficiencia (para no contar dos veces las perdidas):
- INCLUYE: falta de uniformidad entre goteros, fugas, evaporacion directa
  durante la aplicacion. Son perdidas que nunca entran al suelo.
- EXCLUYE: percolacion profunda por exceso (se calcula aparte como
  drenaje) y escorrentia (despreciable en goteo bien manejado en llano).
Experimental, no validado en campo.
"""
from dataclasses import dataclass

KCC_ADULTO = 0.85  # Kc Hass adulto, orientativo
KCC_JOVEN = 0.65   # Kc Hass joven, orientativo

# Texturas: (capacidad de campo, punto de marchitez) en fraccion volumetrica.
# Valores tipicos FAO; la parcela real puede diferir: estimacion inicial.
TEXTURAS = {
    "arenoso": (0.10, 0.04),
    "franco": (0.27, 0.12),
    "arcilloso": (0.36, 0.20),
}

def capacidad_util_mm(textura: str = "franco", prof_raices_m: float = 0.6) -> float:
    cc, pmp = TEXTURAS.get(textura, TEXTURAS["franco"])
    return round((cc - pmp) * prof_raices_m * 1000, 1)

@dataclass
class SueloParams:
    capacidad_util_mm: float = 90.0  # franco, raices 0.6m: (0.27-0.12)*600
    umbral_preestres: float = 0.40   # fraccion agua util
    umbral_estres: float = 0.25
    kc_hass_adulto: float = KCC_ADULTO
    kc_hass_joven: float = KCC_JOVEN

@dataclass
class RiegoParams:
    # Goteo: solo una fraccion de la superficie queda mojada. Rango 0.30-0.55.
    # Se registra para interpretar el reparto; NO modifica el balance de
    # volumen (el modelo actual no simula el bulbo humedo 3D).
    fraccion_mojada: float = 0.45
    # Ver definicion en el docstring del modulo: excluye percolacion profunda.
    eficiencia_aplicacion: float = 0.90


def mm_a_litros_arbol(mm: float, marco_x_m: float, marco_y_m: float) -> float:
    """Equivalencia de volumen: 1 mm sobre 1 m2 = 1 litro.
    NO significa mojado uniforme ni que todo llegue a raices."""
    return round(mm * marco_x_m * marco_y_m, 1)


def litros_arbol_a_mm(litros: float, marco_x_m: float, marco_y_m: float) -> float:
    sup = marco_x_m * marco_y_m
    return round(litros / sup, 2) if sup > 0 else 0.0


def goteros_a_mm_dia(num_goteros: int, caudal_l_h: float, horas_dia: float,
                      marco_x_m: float, marco_y_m: float) -> dict:
    """Convierte dosificacion por goteros a lamina equivalente en mm/dia.
    litros_arbol_dia = num_goteros x caudal x horas; mm = litros / m2."""
    litros = num_goteros * caudal_l_h * horas_dia
    return {
        "litros_arbol_dia": round(litros, 1),
        "mm_dia": litros_arbol_a_mm(litros, marco_x_m, marco_y_m),
    }


def simular_balance(
    eto_diaria: list[float],
    lluvia_diaria: list[float],
    riego_diaria: list[float],
    reserva_inicial_mm: float,
    suelo: SueloParams | None = None,
    kc: float | None = None,
    riego: RiegoParams | None = None,
) -> dict:
    suelo = suelo or SueloParams()
    riego = riego or RiegoParams()
    n = len(eto_diaria)
    assert len(lluvia_diaria) == n and len(riego_diaria) == n, "series deben tener igual longitud"
    k = kc if kc is not None else suelo.kc_hass_adulto
    cap = suelo.capacidad_util_mm
    reserva = max(0.0, min(cap, reserva_inicial_mm))
    reservas, agotamiento, estados, drenaje = [], [], [], []
    riego_efectivo: list[float] = []
    for i in range(n):
        etc = eto_diaria[i] * k
        r_ef = round(riego_diaria[i] * riego.eficiencia_aplicacion, 2)
        riego_efectivo.append(r_ef)
        bruta = reserva + lluvia_diaria[i] + r_ef - etc
        dren = round(max(0.0, bruta - cap), 2)  # exceso: percolacion estimada
        drenaje.append(dren)
        reserva = max(0.0, min(cap, bruta))
        frac = reserva / cap if cap > 0 else 0
        estados.append("estres" if frac < suelo.umbral_estres
                       else "pre-estres" if frac < suelo.umbral_preestres else "normal")
        reservas.append(round(reserva, 2))
        agotamiento.append(round(cap - reserva, 2))
    return {
        "reservas_mm": reservas,
        "agotamiento_mm": agotamiento,
        "estados": estados,
        "drenaje_mm": drenaje,
        "drenaje_total_mm": round(sum(drenaje), 2),
        "dias_preestres": sum(1 for e in estados if e == "pre-estres"),
        "dias_estres": sum(1 for e in estados if e == "estres"),
        "reserva_final_mm": reservas[-1] if reservas else reserva,
        "riego_efectivo_mm": riego_efectivo,
        "fraccion_mojada": riego.fraccion_mojada,
        "eficiencia_aplicacion": riego.eficiencia_aplicacion,
        "nota_drenaje": "Drenaje = exceso sobre capacidad de campo. Solo fiable si reserva inicial, "
                        "capacidad y aportes son razonables. No diagnostica asfixia radicular.",
    }
