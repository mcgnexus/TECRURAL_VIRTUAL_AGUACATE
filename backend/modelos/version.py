"""Version del motor y parametros efectivos. Cada simulacion guardada incluye
estos datos para poder reproducir resultados aunque el modelo cambie."""

MODEL_VERSION = "0.4.0"

PARAMETROS_EFECTIVOS = {
    "metodo": "balance diario inspirado en FAO-56",
    "kc_hass_adulto": 0.85,
    "kc_hass_joven": 0.65,
    "umbral_preestres": 0.40,
    "umbral_estres": 0.25,
    "nota_kc": "Valores orientativos, pendientes de contraste en campo.",
}
