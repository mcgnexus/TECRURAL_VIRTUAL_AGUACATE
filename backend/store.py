"""Guardado reproducible de simulaciones: Neon si hay DATABASE_URL y driver,
sqlite local como alternativa. Misma forma de registro en ambos casos."""
import json
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

SIM_TABLE_SQL = """
create table if not exists registro_simulacion (
  id text primary key,
  version_modelo text not null,
  entradas text not null,
  resultados text not null,
  created_at text not null
);
create table if not exists vinculo_recuperacion (
  token text primary key,
  email text not null,
  registro_id text not null,
  creado text not null,
  expira text not null,
  usado integer not null default 0
);
create table if not exists eventos (
  id integer primary key autoincrement,
  evento text not null,
  sesion text not null,
  creado text not null
);
"""

VINCULO_DIAS = 30
GUARDADOS_POR_HORA = 5

OBS_TABLE_SQL = """
create table if not exists registro_observacion (
  id integer primary key autoincrement,
  fecha text not null,
  tipo text not null,
  valor_num real,
  texto text,
  nota text,
  creado text not null
);
"""

_driver = None  # 'neon' | 'sqlite'


def _connect():
    global _driver
    url = os.environ.get("DATABASE_URL")
    if not url and os.environ.get("VERCEL"):
        # En Vercel el disco es efimero: sin DATABASE_URL no hay donde guardar.
        raise RuntimeError("DATABASE_URL no configurada")
    if url:
        try:
            import psycopg  # type: ignore
            _driver = "neon"
            con = psycopg.connect(url)
            con.execute("create table if not exists registro_simulacion "
                        "(id text primary key, version_modelo text not null, "
                        "entradas text not null, resultados text not null, created_at text not null)")
            con.execute("create table if not exists registro_observacion "
                        "(id text primary key, fecha text not null, tipo text not null, "
                        "valor_num real, texto text, nota text, creado text not null)")
            con.execute("create table if not exists vinculo_recuperacion "
                        "(token text primary key, email text not null, registro_id text not null, "
                        "creado text not null, expira text not null, usado integer not null default 0)")
            con.execute("create table if not exists eventos "
                        "(id integer generated always as identity primary key, "
                        "evento text not null, sesion text not null, creado text not null)")
            con.commit()
            return con
        except Exception:
            pass
    _driver = "sqlite"
    base = os.path.join(os.path.dirname(__file__), "..", "simulaciones.db")
    con = sqlite3.connect(os.path.normpath(base))
    con.executescript(SIM_TABLE_SQL + OBS_TABLE_SQL)
    return con


def guardar(entradas: dict, resultados: dict, version: str) -> dict:
    rid = uuid.uuid4().hex[:12]
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con = _connect()
    try:
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("create table if not exists registro_simulacion "
                            "(id text primary key, version_modelo text not null, "
                            "entradas text not null, resultados text not null, created_at text not null)")
                cur.execute("insert into registro_simulacion values (%s,%s,%s,%s,%s)",
                            (rid, version, json.dumps(entradas), json.dumps(resultados), ahora))
            con.commit()
        else:
            con.execute("insert into registro_simulacion values (?,?,?,?,?)",
                        (rid, version, json.dumps(entradas), json.dumps(resultados), ahora))
            con.commit()
    finally:
        con.close()
    return {"id": rid, "version_modelo": version, "created_at": ahora, "almacen": _driver}


def recuperar(rid: str) -> dict | None:
    con = _connect()
    try:
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("select id, version_modelo, entradas, resultados, created_at "
                            "from registro_simulacion where id=%s", (rid,))
                row = cur.fetchone()
        else:
            row = con.execute("select id, version_modelo, entradas, resultados, created_at "
                              "from registro_simulacion where id=?", (rid,)).fetchone()
    finally:
        con.close()
    if not row:
        return None
    return {"id": row[0], "version_modelo": row[1], "entradas": json.loads(row[2]),
            "resultados": json.loads(row[3]), "created_at": row[4], "almacen": _driver}


def _hora_limite() -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")


def guardados_ultima_hora(email: str) -> int:
    con = _connect()
    try:
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("select count(*) from vinculo_recuperacion where email=%s and creado>%s",
                            (email, _hora_limite()))
                return cur.fetchone()[0]
        return con.execute("select count(*) from vinculo_recuperacion where email=? and creado>?",
                           (email, _hora_limite())).fetchone()[0]
    finally:
        con.close()


def crear_vinculo(email: str, registro_id: str) -> dict:
    token = secrets.token_urlsafe(24)
    ahora = datetime.now(timezone.utc)
    con = _connect()
    try:
        creado = ahora.isoformat(timespec="seconds")
        expira = (ahora + timedelta(days=VINCULO_DIAS)).isoformat(timespec="seconds")
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("insert into vinculo_recuperacion values (%s,%s,%s,%s,%s,0)",
                            (token, email, registro_id, creado, expira))
            con.commit()
        else:
            con.execute("insert into vinculo_recuperacion values (?,?,?,?,?,0)",
                        (token, email, registro_id, creado, expira))
            con.commit()
    finally:
        con.close()
    return {"token": token, "expira": expira, "dias_validez": VINCULO_DIAS}


def obtener_vinculo(token: str) -> dict | None:
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con = _connect()
    try:
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("select token, email, registro_id, creado, expira, usado "
                            "from vinculo_recuperacion where token=%s", (token,))
                row = cur.fetchone()
        else:
            row = con.execute("select token, email, registro_id, creado, expira, usado "
                              "from vinculo_recuperacion where token=?", (token,)).fetchone()
    finally:
        con.close()
    if not row or row[5] or row[4] < ahora:
        return None
    return {"token": row[0], "registro_id": row[2], "creado": row[3], "expira": row[4]}


TIPOS_OBSERVACION = {
    "riego_real_mm", "lluvia_real_mm", "humedad_suelo_mm",
    "fase", "sintoma", "acaro", "fauna_auxiliar",
    "floracion", "frutos", "analisis", "abonado",
}


def guardar_observacion(fecha: str, tipo: str, valor_num: float | None,
                        texto: str | None, nota: str | None) -> dict:
    if tipo not in TIPOS_OBSERVACION:
        raise ValueError("tipo no permitido")
    oid = uuid.uuid4().hex[:12]
    con = _connect()
    try:
        ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("insert into registro_observacion (id, fecha, tipo, valor_num, texto, nota, creado) "
                            "values (%s,%s,%s,%s,%s,%s,%s)",
                            (oid, fecha, tipo, valor_num, texto, nota, ahora))
            con.commit()
        else:
            con.execute("insert into registro_observacion (id, fecha, tipo, valor_num, texto, nota, creado) "
                        "values (?,?,?,?,?,?,?)", (oid, fecha, tipo, valor_num, texto, nota, ahora))
            con.commit()
    finally:
        con.close()
    return {"id": oid}


def listar_observaciones(tipo: str | None = None, limite: int = 50) -> list:
    con = _connect()
    try:
        if _driver == "neon":
            with con.cursor() as cur:
                if tipo:
                    cur.execute("select id, fecha, tipo, valor_num, texto, nota from registro_observacion "
                                "where tipo=%s order by fecha desc limit %s", (tipo, limite))
                else:
                    cur.execute("select id, fecha, tipo, valor_num, texto, nota from registro_observacion "
                                "order by fecha desc limit %s", (limite,))
                rows = cur.fetchall()
        else:
            if tipo:
                rows = con.execute("select id, fecha, tipo, valor_num, texto, nota from registro_observacion "
                                   "where tipo=? order by fecha desc limit ?", (tipo, limite)).fetchall()
            else:
                rows = con.execute("select id, fecha, tipo, valor_num, texto, nota from registro_observacion "
                                   "order by fecha desc limit ?", (limite,)).fetchall()
    finally:
        con.close()
    return [{"id": r[0], "fecha": r[1], "tipo": r[2], "valor_num": r[3], "texto": r[4], "nota": r[5]} for r in rows]


EVENTOS_PERMITIDOS = {
    "visita", "visor_cargado", "visor_fallo", "primera_simulacion",
    "comparacion", "guardado_iniciado", "guardado_solicitado",
    "recuperacion_abierta", "interes_microestaciones", "seguir_sin_guardar",
    "meteo_cargada",
}


def registrar_evento(evento: str, sesion: str) -> bool:
    if evento not in EVENTOS_PERMITIDOS or not sesion or len(sesion) > 64:
        return False
    con = _connect()
    try:
        ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if _driver == "neon":
            with con.cursor() as cur:
                cur.execute("insert into eventos (evento, sesion, creado) values (%s,%s,%s)",
                            (evento, sesion, ahora))
            con.commit()
        else:
            con.execute("insert into eventos (evento, sesion, creado) values (?,?,?)",
                        (evento, sesion, ahora))
            con.commit()
    finally:
        con.close()
    return True
