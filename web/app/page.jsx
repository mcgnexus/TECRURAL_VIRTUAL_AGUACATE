"use client";
import { useEffect, useRef, useState } from "react";
import Viewer from "../components/Viewer";
import Guardar from "../components/Guardar";
import Fase3 from "../components/Fase3";
import { simular, balanceLocal, EMOJI, evento, cargarMeteo } from "../lib/api";

const BORRADOR_DIAS = 7;

const serie = (n, v) => Array(n).fill(v);
const COLORS = { pre: "#6f8f2f", est: "#9a8a2e" };

export default function Page() {
  const [f, setF] = useState({ reserva: 35, edad: 8, ngot: 4, caudal: 4, horasA: 2, marcoX: 5, marcoY: 5, fmoj: 0.45, efi: 0.9, redB: 25, eto: 4.5, lluvia: 0, textura: "franco", profR: 0.6, kcOp: "adulto", kcMan: 0.85, oRes: "estimado", oEto: "estimado", oLlu: "estimado", sensor: "", sensorFecha: "", metProv: "", metUbi: "", metFecha: "", kgmin: 25, kgmax: 40, pmin: 1.2, pmax: 1.8, goteros: true });
  const [R, setR] = useState(null);
  const [motor, setMotor] = useState("");
  const [payloadB, setPayloadB] = useState(null);
  const [guardarVer, setGuardarVer] = useState(false);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [micro, setMicro] = useState(false);
  const [dia, setDia] = useState(13);
  const [play, setPlay] = useState(false);
  const [vel, setVel] = useState(1); // pasos por segundo: 1x, 2x, 4x
  const [meteo, setMeteo] = useState(null); // {eto:[], lluvia:[], proveedor, ubicacion, actualizado}
  const [meteoMsg, setMeteoMsg] = useState("");
  const nComp = useRef(0);
  const graf = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    if (!play || !R) return;
    const id = setInterval(() => setDia((d) => (d >= 13 ? 0 : d + 1)), 1000 / vel);
    return () => clearInterval(id);
  }, [play, vel, R]);

  useEffect(() => {
    evento("visita");
    try {
      const d = JSON.parse(localStorage.getItem("tec_rural_borrador") || "null");
      if (d && Date.now() - d.cuando < BORRADOR_DIAS * 864e5) setF((p) => ({ ...p, ...d.form }));
    } catch { /* sin borrador */ }
  }, []);

  async function usarMeteo() {
    setMeteoMsg("Cargando meteo…");
    try {
      const m = await cargarMeteo();
      setMeteo({ eto: m.eto_diaria, lluvia: m.lluvia_diaria, proveedor: m.aemet?.usada ? "AEMET+Open-Meteo" : (m.proveedor || "Open-Meteo"), ubicacion: m.ubicacion || "36.733,-3.69", actualizado: (m.actualizado || "").slice(0, 10) });
      setF((p) => ({ ...p, oEto: "externo", oLlu: "externo", metProv: m.aemet?.usada ? "AEMET" : "Open-Meteo", metUbi: m.ubicacion || "36.733,-3.69", metFecha: (m.actualizado || "").slice(0, 10) }));
      setMeteoMsg("");
      evento("meteo_cargada");
    } catch { setMeteoMsg("No se pudo cargar la meteo; se mantienen los valores manuales."); }
  }

  async function comparar() {
    const n = 14;
    const eto = meteo ? meteo.eto.slice(0, n) : serie(n, +f.eto || 0);
    const lluvia = meteo ? meteo.lluvia.slice(0, n) : serie(n, +f.lluvia || 0);
    const r0 = +f.reserva, mx = +f.marcoX || 5, my = +f.marcoY || 5, sup = mx * my;
    const efic = +f.efi || 0.9, red = +f.redB, ng = +f.ngot || 4, q = +f.caudal || 4, hA = +f.horasA || 2;
    const a = f.goteros ? +((ng * q * hA) / sup).toFixed(2) : 3.5;
    const b = f.goteros ? +((ng * q * hA * (1 - red / 100)) / sup).toFixed(2) : +(a * (1 - red / 100)).toFixed(2);
    const mm2l = (mm) => +(mm * sup).toFixed(1);
    const origen = { reserva_inicial: f.oRes, eto: f.oEto, lluvia: f.oLlu, suelo: "introducido", marco: "introducido", riego: "introducido" };
    let A, B, via = "API (motor único)", payB = null;
    try {
      const base = { eto_diaria: eto, lluvia_diaria: lluvia, reserva_inicial_mm: r0, edad_anios: +f.edad, textura: f.textura, prof_raices_m: +f.profR || 0.6, kc_opcion: f.kcOp, kc_manual: +f.kcMan || null, marco_x_m: mx, marco_y_m: my, fraccion_mojada: +f.fmoj, eficiencia_aplicacion: efic, origen, sensor_reserva_id: f.sensor || null, sensor_reserva_fecha: f.sensorFecha || null, meteo_proveedor: f.metProv || null, meteo_ubicacion: f.metUbi || null, meteo_fecha: f.metFecha || null };
      if (f.goteros) {
        A = await simular({ ...base, usar_goteros: true, num_goteros: ng, caudal_l_h: q, horas_riego_dia: hA });
        B = await simular({ ...base, usar_goteros: true, num_goteros: ng, caudal_l_h: q, horas_riego_dia: +(hA * (1 - red / 100)).toFixed(2) });
        payB = { ...base, usar_goteros: true, num_goteros: ng, caudal_l_h: q, horas_riego_dia: +(hA * (1 - red / 100)).toFixed(2) };
      } else {
        A = await simular({ ...base, riego_mm_dia: serie(n, a) });
        B = await simular({ ...base, riego_mm_dia: serie(n, b) });
        payB = { ...base, riego_mm_dia: serie(n, b) };
      }
    } catch {
      via = "cálculo local NO equivalente (API inalcanzable; sin comprobar contra el motor oficial)";
      const mk = (mm) => { const bl = balanceLocal(eto, lluvia, serie(n, mm), r0, 90, efic); return { reservas_mm: bl.out, agotamiento_mm: bl.agot, estados: bl.est, drenaje_total_mm: bl.drenTotal, reserva_final_mm: bl.out[13], dias_preestres: bl.est.filter((x) => x === "pre-estres").length, dias_estres: bl.est.filter((x) => x === "estres").length, estado: { variable: "reserva hídrica", nivel: "demostración (cálculo local no comprobado)", motivos: ["la API es inalcanzable; este cálculo no equivale al motor oficial"] }, fuentes: ["reserva_inicial", "eto", "lluvia", "riego"].map((d) => ({ dato: d, categoria: origen[d] || "estimado", detalle: "Sin comprobar: cálculo local." })) }; };
      A = mk(a); B = mk(b);
    }
    setMotor(via);
    setR({ A, B, a, b, mm2l, sup });
    nComp.current += 1;
    evento(nComp.current === 1 ? "primera_simulacion" : "comparacion");
    try { localStorage.setItem("tec_rural_borrador", JSON.stringify({ cuando: Date.now(), form: f })); } catch { /* sin almacenamiento */ }
    if (payB) setPayloadB(payB);
    setDia(13); setPlay(false);
    requestAnimationFrame(() => dibujar(graf.current, A.reservas_mm, B.reservas_mm, a, b, mm2l(a)));
  }

  const estB = R ? R.B.estados : [];
  const diaTxt = R ? `Día ${dia + 1}/14 — estado: ${estB[dia] || "—"} — reserva B: ${R.B.reservas_mm[dia]} mm` : "Ejecuta una comparación para ver la evolución.";
  return (
    <main style={{ display: "grid", gap: 12, padding: 12, maxWidth: 900, margin: "auto" }}>
      <header style={{ background: "#143d16", color: "#fff", padding: "12px 16px", borderRadius: 12 }}>
        <h1 style={{ margin: 0 }}>🥑 TecRural · Mi aguacate virtual <small>(Next.js)</small></h1>
        <p><span style={badge}>Simulación orientativa — NO es gemelo digital validado</span></p>
      </header>
      <section style={panel}>
        <h2>Mi árbol — Almuñécar Hass adulto</h2>
        <div style={grid}>
          <Campo label="Reserva inicial (mm)" v={f.reserva} set={set("reserva")} />
          <Origen v={f.oRes} set={set("oRes")} />
          <Campo label="Edad (años)" v={f.edad} set={set("edad")} />
          <label><input type="checkbox" checked={f.goteros} onChange={set("goteros")} /> Riego por goteros</label>
          {f.goteros ? (<>
            <Campo label="Nº goteros" v={f.ngot} set={set("ngot")} />
            <Campo label="Caudal L/h" v={f.caudal} set={set("caudal")} />
            <Campo label="Horas/día (A)" v={f.horasA} set={set("horasA")} />
          </>) : null}
          <Campo label="Marco X (m)" v={f.marcoX} set={set("marcoX")} />
          <Campo label="Marco Y (m)" v={f.marcoY} set={set("marcoY")} />
          <Campo label="Fracción mojada" v={f.fmoj} set={set("fmoj")} />
          <Campo label="Eficiencia" v={f.efi} set={set("efi")} />
          <details>
            <summary style={{ cursor: "pointer", fontSize: 16 }}>Parámetros avanzados de suelo</summary>
            <div style={grid}>
              <label>Textura <select value={f.textura} onChange={set("textura")} style={{ fontSize: 16 }}>
                <option value="arenoso">Arenoso</option><option value="franco">Franco</option><option value="arcilloso">Arcilloso</option>
              </select></label>
              <Campo label="Raíces (m)" v={f.profR} set={set("profR")} />
              <label>Kc <select value={f.kcOp} onChange={set("kcOp")} style={{ fontSize: 16 }}>
                <option value="adulto">Adulto (0.85)</option><option value="joven">Joven (0.65)</option><option value="manual">Manual</option>
              </select></label>
              {f.kcOp === "manual" && <Campo label="Kc manual" v={f.kcMan} set={set("kcMan")} />}
            </div>
            <p style={hint}>La textura y las raíces definen la capacidad útil. Valores típicos sin analizar tu parcela.</p>
          </details>
          <Campo label="Reducción B %" v={f.redB} set={set("redB")} />
          <Campo label="ETo mm/d" v={f.eto} set={set("eto")} />
          <Origen v={f.oEto} set={set("oEto")} />
          <Campo label="Lluvia mm/d" v={f.lluvia} set={set("lluvia")} />
          <Origen v={f.oLlu} set={set("oLlu")} />
        </div>
        {(f.oRes === "medido") && (<div style={grid}><Campo label="Sensor id" v={f.sensor} set={set("sensor")} /><Campo label="Fecha lectura" v={f.sensorFecha} set={set("sensorFecha")} type="date" /></div>)}
        {(f.oEto === "externo" || f.oLlu === "externo") && (<div style={grid}><Campo label="Proveedor" v={f.metProv} set={set("metProv")} /><Campo label="Ubicación" v={f.metUbi} set={set("metUbi")} /><Campo label="Actualización" v={f.metFecha} set={set("metFecha")} type="date" /></div>)}
        <button style={btn} onClick={comparar}>Comparar 14 días</button>{" "}
        <button style={btn2} onClick={usarMeteo}>Cargar meteo Almuñécar (14 días)</button>
        {meteo && <p style={hint}>Meteo: {meteo.proveedor} · {meteo.ubicacion} · {meteo.actualizado} <button style={btn2} onClick={() => { setMeteo(null); setMeteoMsg(""); }}>Usar valores manuales</button></p>}
        {meteoMsg && !meteo && <p style={hint}>{meteoMsg}</p>}
        {motor && <p style={hint}>Motor: {motor}</p>}
      </section>
      <Viewer estados={estB} dia={dia} onModo={(m) => evento(m === "3d" ? "visor_cargado" : "visor_fallo")} />
      {R && (
        <section style={panel}>
          <h3>Evolución del escenario B</h3>
          <p>{diaTxt}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button style={btn} onClick={() => setPlay((p) => !p)}>{play ? "Pausar" : "Reproducir 14 días"}</button>
            <label>Velocidad <select value={vel} onChange={(e) => setVel(+e.target.value)} style={{ fontSize: 16 }}>
              <option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
            </select></label>
            <label style={{ flex: 1, minWidth: 180 }}>Día <input type="range" min={0} max={13} value={dia} onChange={(e) => { setDia(+e.target.value); setPlay(false); }} style={{ width: "100%" }} /></label>
          </div>
          <p style={hint}>Controles de riego y clima en el formulario; la velocidad solo cambia el ritmo de visualización, no el cálculo.</p>
        </section>
      )}
      <section style={panel}>
        <h2>Reserva hídrica {R && <span style={badge}>{R.B.estado?.variable}: {R.B.estado?.nivel}</span>}</h2>
        <canvas ref={graf} width={640} height={220} style={{ width: "100%", background: "#fafafa", border: "1px solid #ddd", borderRadius: 8 }} />
        {R && (<>
          <p><b>A:</b> final {R.A.reserva_final_mm} mm · <b>B:</b> final {R.B.reserva_final_mm} mm · estrés en B: {R.B.dias_preestres} pre + {R.B.dias_estres} severo.</p>
          <p>Agua: A {R.a} mm/d = {R.mm2l(R.a)} L/árbol/día · B {R.b} mm/d = {R.mm2l(R.b)} L/árbol/día.
          {R.B.drenaje_total_mm > 0 ? ` Drenaje B: ${R.B.drenaje_total_mm} mm (no diagnostica asfixia).` : " Sin drenaje estimado."}
          {R.B.suelo && ` Suelo: ${R.B.suelo.textura}, raíces ${R.B.suelo.prof_raices_m} m → capacidad ${R.B.suelo.capacidad_util_mm} mm, Kc ${R.B.suelo.kc_usado}.`}</p>
          <ul>{(R.B.estado?.motivos || []).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>)}
      </section>
      <section style={panel}>
        <h2>Guardar mi árbol</h2>
        {!guardarVer && !sinGuardar && (
          <div>
            <button style={btn} onClick={() => { setGuardarVer(true); evento("guardado_iniciado"); }}>Guardar mi árbol</button>{" "}
            <button style={btn2} onClick={() => { setSinGuardar(true); evento("seguir_sin_guardar"); }}>Seguir probando sin guardar</button>
          </div>
        )}
        {guardarVer && <Guardar escenario={payloadB} onGuardado={() => {}} />}
        {sinGuardar && <p style={hint}>Sigues probando sin guardar. Tu progreso no se conserva al cerrar o recargar la página; el borrador de este dispositivo se guarda 7 días.</p>}
        <p style={{ marginTop: 12 }}>
          <button style={btn2} onClick={() => { setMicro(true); evento("interes_microestaciones"); }}>Quiero conocer las microestaciones</button>
        </p>
        {micro && <p style={hint}>Anotado tu interés. Te contactaremos cuando haya novedades para tu zona.</p>}
      </section>
      <Fase3 escenario={payloadB} />
      <section style={panel}>
        <h2>Hipótesis de cosecha (tuya, no del modelo)</h2>
        <div style={grid}>
          <Campo label="Kg mín" v={f.kgmin} set={set("kgmin")} />
          <Campo label="Kg máx" v={f.kgmax} set={set("kgmax")} />
          <Campo label="Precio mín" v={f.pmin} set={set("pmin")} />
          <Campo label="Precio máx" v={f.pmax} set={set("pmax")} />
        </div>
        <p><b>Tu hipótesis:</b> {f.kgmin}–{f.kgmax} kg/árbol · {Math.round(f.kgmin * f.pmin)}–{Math.round(f.kgmax * f.pmax)} €/árbol.</p>
        <p style={hint}>El modelo no estima la cosecha. El cuajado depende de floración y polinización, aún no simulados.</p>
      </section>
      <section style={panel}>
        <h2>Datos utilizados {R?.modelo && <span style={hint}>· motor v{R.modelo.version}</span>}</h2>
        <ul>{(R?.B.fuentes || []).map((s, i) => <li key={i}>{EMOJI[s.categoria]} <b>{s.dato}</b> ({s.categoria}): {s.detalle}</li>)}</ul>
        {R?.modelo && <p style={hint}>Motor v{R.modelo.version} · Kc adulto {R.modelo.parametros.kc_hass_adulto} · umbrales {R.modelo.parametros.umbral_preestres}/{R.modelo.parametros.umbral_estres} · {R.modelo.parametros.metodo}.</p>}
        <p style={hint}>🟢 Medido: sensor identificado · 🔵 Introducido: aportado por ti · 🟡 Estimado: supuesto · 🌐 Externo: proveedor con fecha y ubicación.</p>
      </section>
    </main>
  );
}

function dibujar(cv, RA, RB, a, b, la) {
  if (!cv) return;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, 640, 220); g.strokeStyle = "#ccc";
  for (let y = 0; y <= 90; y += 15) { g.beginPath(); g.moveTo(40, 200 - y * 2); g.lineTo(630, 200 - y * 2); g.stroke(); }
  const draw = (s, col) => { g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); s.forEach((v, i) => { const x = 40 + i * (590 / 13), y = 200 - v * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  draw(RA, "#2d6a2e"); draw(RB, "#c0392b");
  g.fillStyle = "#000"; g.fillText(`— A ${a} mm/d (${la} L/árb/d)`, 45, 18);
  g.fillStyle = "#c0392b"; g.fillText(`— B ${b} mm/d`, 250, 18);
}

function Campo({ label, v, set, type }) {
  return <label style={{ display: "block", margin: "6px 0" }}>{label} <input type={type || "number"} value={v} onChange={set} style={{ width: 90, marginLeft: 8, fontSize: 16 }} /></label>;
}
function Origen({ v, set }) {
  return <select value={v} onChange={set} style={{ fontSize: 16 }}><option value="estimado">🟡 Estimado</option><option value="introducido">🔵 Introducido</option><option value="medido">🟢 Medido</option><option value="externo">🌐 Externo</option></select>;
}
const panel = { background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 4px #0002" };
const hint = { fontSize: 13, color: "#555" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 4 };
const btn = { background: "#2d6a2e", color: "#fff", border: 0, borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
const btn2 = { background: "#fff", color: "#2d6a2e", border: "1px solid #2d6a2e", borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
const badge = { display: "inline-block", background: "#b7791f", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 13 };
