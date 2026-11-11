"""Cosecha: el modelo NO estima kilos.

No existe ningun rango bibliografico con fuente identificada en este
proyecto, asi que no se publica ningun numero. La app solo recoge la
hipotesis del agricultor (kg y precio introducidos por el) y calcula
ingresos brutos con esos valores. Son hipotesis suyas, no prediccion.
"""
from dataclasses import dataclass


@dataclass
class HipotesisCosecha:
    kg_min: float
    kg_max: float
    precio_min: float | None = None
    precio_max: float | None = None

    def ingresos_brutos(self) -> list[float] | None:
        if self.precio_min is None or self.precio_max is None:
            return None
        return [round(self.kg_min * self.precio_min, 2),
                round(self.kg_max * self.precio_max, 2)]


NOTA_MODELO = ("El modelo no estima la cosecha. El cuajado depende de procesos "
               "de floracion y polinizacion que aun no se simulan.")
