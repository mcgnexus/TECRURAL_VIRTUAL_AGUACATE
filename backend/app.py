from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from modelos.balance_hidrico import (
    simular_balance, SueloParams, RiegoParams,
    mm_a_litros_arbol, goteros_a_mm_dia, capacidad_util_mm,
)
from modelos.rendimiento import HipotesisCosecha, NOTA_MODELO
from modelos.fenologia import FASES, grados_dia_acumulados, alertas_climaticas
from modelos.version import MODEL_VERSION, PARAMETROS_EFECTIVOS
from modelos.meteo_adapter import meteo_combinada
import store
import email_provider
import re

app = FastAPI(title="TecRural · Mi aguacate virtual (MVP)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Motor unico de calculo: el frontend debe llamar a /simular. El espejo local
# del navegador NO es equivalente: no esta comprobado contra este motor.

CATEGORIAS = ("medido", "introducido", "estimado", "externo")

EMOJI = {"medido": "🟢", "introducido": "🔵", "estimado": "🟡", "externo": "🌐"}


class EscenarioIn(BaseModel):
    # Riego: o lamina directa, o dosificacion por goteros (si usar_goteros).
    riego_mm_dia: list[float] = Field(default_factory=list, description="Lamina aplicada por dia (mm)")
    usar_goteros: bool = False
    num_goteros: int = 4
    caudal_l_h: float = 4.0
    horas_riego_dia: float = 2.0
    eto_diaria: list[float] | None = None
    lluvia_diaria: list[float] | None = None
    tmax_diaria: list[float] | None = None
    tmin_diaria: list[float] | None = None
    viento_diaria: list[float] | None = None
    reserva_inicial_mm: float = 60.0
    edad_anios: float = 8.0
    suelo_util_mm: float | None = None  # si None, se calcula de textura+raices
    textura: str = "franco"
    prof_raices_m: float = 0.6
    kc_opcion: str = "adulto"  # adulto | joven | manual
    kc_manual: float | None = None
    marco_x_m: float = 5.0
    marco_y_m: float = 5.0
    fraccion_mojada: float = 0.45
    eficiencia_aplicacion: float = 0.90
    # Origen de cada dato: medido | introducido | estimado | externo.
    # Lo que no se declare, estimado.
    origen: dict[str, str] = Field(default_factory=dict)
    # Metadatos: identifican sensor, proveedor, ubicacion y fecha.
    sensor_reserva_id: str | None = None
    sensor_reserva_fecha: str | None = None
    meteo_proveedor: str | None = None
    meteo_ubicacion: str | None = None
    meteo_fecha: str | None = None
    # Hipotesis del agricultor (NO prediccion del modelo).
    hipotesis_kg_min: float | None = None
    hipotesis_kg_max: float | None = None
    hipotesis_precio_min: float | None = None
    hipotesis_precio_max: float | None = None
    hipotesis_coste_min: float | None = None
    hipotesis_coste_max: float | None = None

@app.get("/salud")
def salud():
    return {"ok": True, "servicio": "aguacate-virtual-mvp"}

class SectorIn(BaseModel):
    nombre: str = "Sector 1"
    n_arboles: int = 1
    escenario: EscenarioIn

class ParcelaIn(BaseModel):
    nombre: str = "Mi parcela"
    eto_diaria: list[float] | None = None
    lluvia_diaria: list[float] | None = None
    tmax_diaria: list[float] | None = None
    tmin_diaria: list[float] | None = None
    sectores: list[SectorIn] = Field(min_length=1)

@app.post("/parcela/simular")
def simular_parcela(p: ParcelaIn):
    """Del arbol a la parcela: cada sector tiene su suelo, riego y arboles.
    La meteo comun se aplica a todos salvo que el sector traiga la suya.
    El JSON devuelto es el formato de intercambio con el simulador general
    (formato: tec-rural-parcela/1)."""
    res = []
    for s in p.sectores:
        ent = s.escenario.model_copy(update={
            "eto_diaria": s.escenario.eto_diaria or p.eto_diaria,
            "lluvia_diaria": s.escenario.lluvia_diaria or p.lluvia_diaria,
            "tmax_diaria": s.escenario.tmax_diaria or p.tmax_diaria,
            "tmin_diaria": s.escenario.tmin_diaria or p.tmin_diaria,
        })
        r = simular(ent)
        n = len(r["riego_mm_dia"])
        agua_total_l = round(r["equivalencia"]["riego_medio_litros_arbol_dia"] * n * s.n_arboles, 0)
        res.append({"sector": s.nombre, "n_arboles": s.n_arboles,
                    "reserva_final_mm": r["reserva_final_mm"],
                    "dias_estres": r["dias_estres"], "dias_preestres": r["dias_preestres"],
                    "drenaje_total_mm": r["drenaje_total_mm"],
                    "agua_aplicada_total_l": agua_total_l,
                    "suelo": r["suelo"], "estado": r["estado"]["nivel"]})
    return {"formato": "tec-rural-parcela/1",
            "parcela": p.nombre,
            "modelo": {"version": MODEL_VERSION, "parametros": PARAMETROS_EFECTIVOS},
            "sectores": res,
            "agua_total_l": round(sum(s["agua_aplicada_total_l"] for s in res), 0),
            "nota": "Sectores independientes con la misma meteo salvo indicacion. "
                    "Enviar este JSON al simulador general para continuar el analisis."}

@app.get("/meteo")
async def meteo(lat: float = 36.733, lon: float = -3.69, municipio_id: str | None = "18001",
                dias: int = 14, aemet_key: str | None = None):
    """Almunecar por defecto: lat 36.733, lon -3.69, INE 18001."""
    return await meteo_combinada(lat, lon, municipio_id, aemet_key, dias)

def _cat(o: dict, clave: str, por_defecto: str = "estimado") -> str:
    c = o.get(clave, por_defecto)
    return c if c in CATEGORIAS else por_defecto

def _fuente(dato: str, categoria: str, detalle: str) -> dict:
    return {"dato": dato, "categoria": categoria, "detalle": detalle}

@app.post("/simular")
def simular(e: EscenarioIn):
    if e.usar_goteros:
        conv = goteros_a_mm_dia(e.num_goteros, e.caudal_l_h, e.horas_riego_dia, e.marco_x_m, e.marco_y_m)
        n = len(e.eto_diaria) if e.eto_diaria else (len(e.lluvia_diaria) if e.lluvia_diaria else 14)
        riego_mm = [conv["mm_dia"]] * n
        litros_aplicados = conv["litros_arbol_dia"]
    else:
        riego_mm = e.riego_mm_dia
        n = len(riego_mm)
        litros_aplicados = mm_a_litros_arbol(sum(riego_mm) / n, e.marco_x_m, e.marco_y_m) if n else 0.0
    eto = e.eto_diaria or [4.5] * n
    lluvia = e.lluvia_diaria or [0.0] * n
    cap = e.suelo_util_mm if e.suelo_util_mm else capacidad_util_mm(e.textura, e.prof_raices_m)
    suelo = SueloParams(capacidad_util_mm=cap)
    kc_val = None if e.kc_opcion == "adulto" else (SueloParams().kc_hass_joven if e.kc_opcion == "joven" else e.kc_manual)
    riego_p = RiegoParams(fraccion_mojada=e.fraccion_mojada, eficiencia_aplicacion=e.eficiencia_aplicacion)
    bal = simular_balance(eto, lluvia, riego_mm, e.reserva_inicial_mm, suelo, kc=kc_val, riego=riego_p)
    dias_sat = sum(1 for r in bal["reservas_mm"] if r >= cap * 0.9)
    riesgo_humedad = (None if dias_sat == 0 else
        "Suelo casi saturado %d dia(s): condiciones favorables a problemas de raiz. "
        "No afirma presencia de Phytophthora ni diagnostica asfixia; revisar drenaje." % dias_sat)
    clima = None
    if e.tmax_diaria or e.tmin_diaria:
        clima = {"gdd_base10": grados_dia_acumulados(e.tmax_diaria or [0] * n, e.tmin_diaria or [0] * n),
                 "alertas": alertas_climaticas(e.tmax_diaria, e.tmin_diaria, lluvia, e.viento_diaria)}
    sup_m2 = round(e.marco_x_m * e.marco_y_m, 1)
    equiv = {
        "marco_m": [e.marco_x_m, e.marco_y_m],
        "superficie_por_arbol_m2": sup_m2,
        "riego_medio_mm_dia": round(sum(riego_mm) / n, 2) if n else 0.0,
        "riego_medio_litros_arbol_dia": mm_a_litros_arbol(sum(riego_mm) / n, e.marco_x_m, e.marco_y_m) if n else 0.0,
        "litros_arbol_dia_goteros": litros_aplicados if e.usar_goteros else None,
        "riego_efectivo_medio_mm_dia": round(sum(bal["riego_efectivo_mm"]) / n, 2) if n else 0.0,
        "advertencia": "Equivalencia de volumen (1 mm x 1 m2 = 1 L). No significa mojado uniforme ni que todo llegue a raices.",
    }
    o = e.origen
    c_res, c_eto, c_llu = _cat(o, "reserva_inicial"), _cat(o, "eto"), _cat(o, "lluvia")
    det_res = ("Sensor %s, lectura %s" % (e.sensor_reserva_id or "sin identificar",
                                          e.sensor_reserva_fecha or "sin fecha")
               if c_res == "medido" else
               "Valor supuesto; no hay lectura de sensor." if c_res == "estimado" else
               "Valor aportado por el agricultor; no es una medicion con sensor.")
    if c_eto == "externo" or c_llu == "externo":
        det_met = "Proveedor %s, ubicacion %s, actualizacion %s." % (
            e.meteo_proveedor or "sin identificar",
            e.meteo_ubicacion or "sin ubicar",
            e.meteo_fecha or "sin fecha")
    elif c_eto == "medido" or c_llu == "medido":
        det_met = ("Estacion local: comprobar que mide todas las variables del metodo "
                   "y revisar ubicacion y calibracion; dato local no significa dato exacto.")
    elif c_eto == "introducido" or c_llu == "introducido":
        det_met = "Valores aportados por el agricultor."
    else:
        det_met = "Valores de demostracion; no representan ninguna ubicacion ni fecha."
    c_riego = "introducido" if e.usar_goteros else _cat(o, "riego")
    det_riego = ("Caudal y duracion aportados por el agricultor: "
                 "%dx%.1f L/h x %.1fh. No equivale a agua medida aplicada." %
                 (e.num_goteros, e.caudal_l_h, e.horas_riego_dia) if e.usar_goteros else
                 "Lamina aportada por el agricultor." if c_riego == "introducido" else
                 "Valor supuesto.")
    fuentes = [
        _fuente("reserva_inicial", c_res, det_res),
        _fuente("eto", c_eto, det_met),
        _fuente("lluvia", c_llu, det_met),
        _fuente("riego", c_riego, det_riego),
        _fuente("suelo", _cat(o, "suelo"),
                "Textura %s y raices %.1f m elegidas en pantalla (capacidad %.1f mm); sin analisis de esta parcela." % (e.textura, e.prof_raices_m, cap)),
        _fuente("marco", _cat(o, "marco", "introducido"), "Dimensiones aportadas por el agricultor."),
        _fuente("fraccion_mojada", "estimado",
                "Valor tipico de goteo 0.30-0.55; no modifica el balance, el bulbo 3D no se simula."),
        _fuente("eficiencia", "estimado",
                "Valor tipico 0.80-0.95; excluye percolacion, el drenaje se calcula aparte."),
    ]
    motivos = []
    if c_res != "medido":
        motivos.append("la humedad inicial del suelo no se ha medido en esta parcela")
    if _cat(o, "suelo") != "medido":
        motivos.append("la capacidad de retencion se ha estimado (textura sin analizar)")
    if c_eto == "estimado" or c_llu == "estimado":
        motivos.append("la meteorologia usa valores de demostracion, no datos de lugar ni fecha")
    if c_eto == "medido" or c_llu == "medido":
        motivos.append("los datos locales aun no pasan controles de calidad ni tienen fecha identificada")
    motivos.append("el metodo esta pendiente de documentacion y revision completa")
    motivos.append("ningun resultado se ha contrastado con observaciones de esta parcela")
    estado = {
        "variable": "reserva hidrica",
        "nivel": "demostración",
        "motivos": motivos,
        "nota": ("Sirve para explorar relaciones y comparar escenarios. No es una prediccion "
                 "validada para esta parcela."),
    }
    hipotesis = None
    if e.hipotesis_kg_min is not None and e.hipotesis_kg_max is not None:
        h = HipotesisCosecha(e.hipotesis_kg_min, e.hipotesis_kg_max,
                             e.hipotesis_precio_min, e.hipotesis_precio_max)
        margen = None
        if h.ingresos_brutos() and e.hipotesis_coste_min is not None and e.hipotesis_coste_max is not None:
            ing = h.ingresos_brutos()
            margen = [round(ing[0] - e.hipotesis_coste_max, 2),
                      round(ing[1] - e.hipotesis_coste_min, 2)]
        hipotesis = {"kg": [h.kg_min, h.kg_max],
                     "ingresos_brutos_eur": h.ingresos_brutos(),
                     "costes_eur": ([e.hipotesis_coste_min, e.hipotesis_coste_max]
                                    if e.hipotesis_coste_min is not None else None),
                     "margen_bruto_eur": margen,
                     "nota": "Hipotesis del agricultor, no prediccion del modelo."}
    return {**bal, "riego_mm_dia": riego_mm, "equivalencia": equiv,
            "dias_saturacion": dias_sat, "riesgo_humedad": riesgo_humedad,
            "clima": clima, "fases_disponibles": [f["id"] for f in FASES],
            "suelo": {"textura": e.textura, "prof_raices_m": e.prof_raices_m,
                      "capacidad_util_mm": cap, "kc_usado": kc_val or SueloParams().kc_hass_adulto},
            "cosecha": {"nota": NOTA_MODELO},
            "hipotesis_agricultor": hipotesis, "fuentes": fuentes,
            "estado": estado,
            "modelo": {"version": MODEL_VERSION, "parametros": PARAMETROS_EFECTIVOS},
            "entradas": e.model_dump()}

@app.post("/simulaciones")
def crear_simulacion(e: EscenarioIn):
    """Ejecuta y guarda el registro reproducible (version + entradas + resultados)."""
    res = simular(e)
    meta = store.guardar(e.model_dump(), res, MODEL_VERSION)
    return {"registro": meta, **res}

@app.get("/simulaciones/{rid}")
def obtener_simulacion(rid: str):
    reg = store.recuperar(rid)
    if not reg:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="registro no encontrado")
    return reg

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class GuardarIn(BaseModel):
    email: str
    escenario: EscenarioIn
    consent_comercial: bool = False

@app.post("/guardar")
def guardar_arbol(g: GuardarIn):
    """Guarda el escenario y crea un enlace de recuperacion (valido 30 dias,
    5 solicitudes/hora por correo). En modo local NO se envia correo."""
    from fastapi import HTTPException
    email = g.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="correo no valido")
    if store.guardados_ultima_hora(email) >= store.GUARDADOS_POR_HORA:
        raise HTTPException(status_code=429, detail="demasiadas solicitudes, intentalo mas tarde")
    res = simular(g.escenario)
    meta = store.guardar({**g.escenario.model_dump(),
                          "consent_comercial": g.consent_comercial}, res, MODEL_VERSION)
    vinc = store.crear_vinculo(email, meta["id"])
    enlace = f"/recuperar/{vinc['token']}"
    envio = email_provider.enviar_enlace(email, enlace)
    return {"registro": meta, "enlace": enlace, "expira": vinc["expira"],
            "envio": envio,
            "nota": ("Enlace valido %d dias. Texto y base juridica de comunicaciones "
                     "comerciales pendientes de revision antes de publicar." % vinc["dias_validez"])}

@app.get("/recuperar/{token}")
def recuperar_arbol(token: str):
    from fastapi import HTTPException
    vinc = store.obtener_vinculo(token)
    if not vinc:
        raise HTTPException(status_code=404, detail="enlace no valido o caducado")
    reg = store.recuperar(vinc["registro_id"])
    if not reg:
        raise HTTPException(status_code=404, detail="registro no encontrado")
    return {"vinculo": {"expira": vinc["expira"]}, **reg}

class EventoIn(BaseModel):
    evento: str
    sesion: str

@app.post("/eventos")
def registrar(e: EventoIn):
    """Eventos minimos de uso (sin emails ni datos de finca)."""
    if not store.registrar_evento(e.evento, e.sesion):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="evento no permitido")
    return {"ok": True}

class ObservacionIn(BaseModel):
    fecha: str = Field(description="AAAA-MM-DD")
    tipo: str = Field(description="riego_real_mm | lluvia_real_mm | humedad_suelo_mm | fase | sintoma")
    valor_num: float | None = None
    texto: str | None = None
    nota: str | None = None

@app.post("/observaciones")
def crear_observacion(o: ObservacionIn):
    """Registro de eventos reales: riego, lluvia, humedad (futura sonda),
    fase observada y sintomas. Los sensores de suelo usaran esta misma tabla."""
    try:
        return store.guardar_observacion(o.fecha, o.tipo, o.valor_num, o.texto, o.nota)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="tipo no permitido")

@app.get("/observaciones")
def ver_observaciones(tipo: str | None = None, limite: int = 50):
    return {"observaciones": store.listar_observaciones(tipo, min(limite, 200))}

class ContrasteIn(BaseModel):
    escenario: EscenarioIn
    riego_obs_mm_dia: list[float] | None = None
    lluvia_obs_mm_dia: list[float] | None = None
    reserva_medida_mm: float | None = None

@app.post("/contraste")
def contraste(c: ContrasteIn):
    """Compara lo planificado con lo realizado y, si hay humedad medida,
    con lo observado. Primer paso hacia la calibracion."""
    plan = simular(c.escenario)
    n = len(plan["riego_mm_dia"])
    ent = c.escenario.model_copy(update={
        "riego_mm_dia": c.riego_obs_mm_dia or c.escenario.riego_mm_dia,
        "lluvia_diaria": c.lluvia_obs_mm_dia or c.escenario.lluvia_diaria,
    })
    real = simular(ent)
    dif_plan_real = round(real["reserva_final_mm"] - plan["reserva_final_mm"], 1)
    out = {"planificado_final_mm": plan["reserva_final_mm"],
           "realizado_final_mm": real["reserva_final_mm"],
           "diferencia_plan_realizado_mm": dif_plan_real,
           "interpretacion": ("Aplicaste %s mm %s de lo planificado al final del periodo." %
                              (abs(dif_plan_real), "menos" if dif_plan_real < 0 else "mas"))}
    if c.reserva_medida_mm is not None:
        dif = round(c.reserva_medida_mm - real["reserva_final_mm"], 1)
        if abs(dif) <= 5:
            inter = "Coherente con el calculo (±5 mm). Sigue registrando para calibrar."
        elif dif < 0:
            inter = ("El suelo esta mas seco de lo calculado. Revisa eficiencia de aplicacion, "
                     "ETo usada o profundidad de raices antes de fiarte del modelo.")
        else:
            inter = ("El suelo esta mas humedo de lo calculado. Revisa aportes no registrados "
                     "(lluvia local, escorrentia) o el drenaje estimado.")
        out["medido_mm"] = c.reserva_medida_mm
        out["diferencia_realizado_medido_mm"] = dif
        out["interpretacion_medido"] = inter
    return out

@app.get("/fases")
def fases():
    """Fases fenologicas configurables para registrar lo observado."""
    return {"fases": FASES,
            "nota": "El agricultor indica la fase que observa; el modelo no la predice."}

@app.get("/diagnostico")
def diagnostico():
    """Conexion con la herramienta de diagnostico visual (opcional).
    Sus resultados son posibles causas que requieren comprobacion en campo,
    nunca una confirmacion automatica."""
    import os
    url = os.environ.get("DIAG_URL")
    if not url:
        from fastapi import HTTPException
        raise HTTPException(status_code=501, detail="diagnostico visual no configurado (DIAG_URL)")
    return {"url": url,
            "nota": "Posibles causas a comprobar en campo; no es una confirmacion automatica."}

@app.get("/microestaciones")
def microestaciones():
    """Integracion inicial TecRural: lee TECRURAL_API_URL si esta configurada.
    Sin configurar, responde 501 con instrucciones (no se finge ningun dato)."""
    import os
    base = os.environ.get("TECRURAL_API_URL")
    if not base:
        from fastapi import HTTPException
        raise HTTPException(status_code=501, detail="microestaciones no configuradas (TECRURAL_API_URL)")
    import urllib.request, json
    try:
        with urllib.request.urlopen(base.rstrip("/") + "/lecturas", timeout=15) as r:
            datos = json.loads(r.read())
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail="no se pudo leer la microestacion: %s" % str(e)[:120])
    return {"estacion": "tec-rural", "lecturas": datos,
            "nota": "Datos iniciales sin controles de calidad: revisar ubicacion y calibracion."}
