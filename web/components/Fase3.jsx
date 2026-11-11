"use client";
import { useEffect, useState } from "react";
import { guardarObservacion, listarObservaciones, contrastar, leerMicroestacion } from "../lib/api";

const TIPOS = ["riego_real_mm", "lluvia_real_mm", "humedad_suelo_mm", "fase", "sintoma"];

// Fase 3: observaciones reales, contraste simulado vs observado y microestación.
// Los sensores de suelo futuros escriben en la misma tabla (humedad_suelo_mm).
export default function Fase3({ escenario }) {
  const [obs, setObs] = useState({ fecha: new Date().toISOString().slice(0, 10), tipo: "riego_real_mm", valor: "", texto: "", nota: "" });
  const [lista, setLista] = useState([]);
  const [msg, setMsg] = useState("");
  const [c, setC] = useState({ riego: "", lluvia: "", medida: "" });
  const [resC, setResC] = useState(null);
  const [micro, setMicro] = useState(null);
  const [microMsg, setMicroMsg] = useState("");

  const cargar = () => listarObservaciones("", 20).then((j) => setLista(j.observaciones)).catch(() => {});
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    setMsg("Guardando…");
    try {
      await guardarObservacion({ fecha: obs.fecha, tipo: obs.tipo, valor_num: obs.valor === "" ? null : +obs.valor, texto: obs.texto || null, nota: obs.nota || null });
      setMsg("Observación registrada."); cargar();
    } catch (e) { setMsg("Error: " + (e.message || e)); }
  }

  async function verContraste() {
    setResC(null);
    try {
      const n = 14;
      const r = await contrastar({
        escenario,
        riego_obs_mm_dia: c.riego === "" ? null : Array(n).fill(+c.riego),
        lluvia_obs_mm_dia: c.lluvia === "" ? null : Array(n).fill(+c.lluvia),
        reserva_medida_mm: c.medida === "" ? null : +c.medida,
      });
      setResC(r);
    } catch (e) { setResC({ error: String(e.message || e) }); }
  }

  async function leerMicro() {
    setMicroMsg("Leyendo…"); setMicro(null);
    try { setMicro(await leerMicroestacion()); setMicroMsg(""); }
    catch (e) { setMicroMsg(String(e.message || e)); }
  }

  const inp = { fontSize: 16 };
  return (
    <section style={panel}>
      <h2>Mi finca: observaciones y contraste</h2>
      <p style={hint}>Registra lo que ocurre de verdad (riego, lluvia, humedad, fase, síntomas) y compáralo con la simulación. Así empieza la calibración.</p>
      <h3>Registrar observación</h3>
      <div style={grid}>
        <label>Fecha <input type="date" value={obs.fecha} onChange={(e) => setObs({ ...obs, fecha: e.target.value })} style={inp} /></label>
        <label>Tipo <select value={obs.tipo} onChange={(e) => setObs({ ...obs, tipo: e.target.value })} style={inp}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Valor (mm) <input type="number" step="0.1" value={obs.valor} onChange={(e) => setObs({ ...obs, valor: e.target.value })} style={inp} placeholder="solo tipos en mm" /></label>
        <label>Texto (fase/síntoma) <input value={obs.texto} onChange={(e) => setObs({ ...obs, texto: e.target.value })} style={inp} placeholder="ej. floración, envés con puntos" /></label>
      </div>
      <label>Nota <input value={obs.nota} onChange={(e) => setObs({ ...obs, nota: e.target.value })} style={{ ...inp, width: "90%" }} /></label>
      <div><button style={btn} onClick={guardar}>Registrar</button> <span style={hint}>{msg}</span></div>
      <ul>{lista.map((o) => <li key={o.id}>{o.fecha} · <b>{o.tipo}</b> {o.valor_num ?? ""} {o.texto ?? ""} {o.nota ? `(${o.nota})` : ""}</li>)}</ul>

      <h3>Contraste: planificado vs realizado vs medido</h3>
      {!escenario && <p style={hint}>Ejecuta primero una comparación para contrastarla.</p>}
      {escenario && (
        <div>
          <div style={grid}>
            <label>Riego medio aplicado (mm/d) <input type="number" step="0.1" value={c.riego} onChange={(e) => setC({ ...c, riego: e.target.value })} style={inp} /></label>
            <label>Lluvia media real (mm/d) <input type="number" step="0.1" value={c.lluvia} onChange={(e) => setC({ ...c, lluvia: e.target.value })} style={inp} /></label>
            <label>Humedad medida final (mm, sonda) <input type="number" step="0.1" value={c.medida} onChange={(e) => setC({ ...c, medida: e.target.value })} style={inp} /></label>
          </div>
          <button style={btn} onClick={verContraste}>Contrastar</button>
          {resC && !resC.error && (
            <div>
              <p>Planificado: {resC.planificado_final_mm} mm · Realizado: {resC.realizado_final_mm} mm ({resC.diferencia_plan_realizado_mm} mm). {resC.interpretacion}</p>
              {resC.medido_mm != null && <p>Medido: {resC.medido_mm} mm (dif. {resC.diferencia_realizado_medido_mm} mm). {resC.interpretacion_medido}</p>}
            </div>
          )}
          {resC?.error && <p>Error: {resC.error}</p>}
        </div>
      )}

      <h3>Microestación TecRural</h3>
      <button style={btn2} onClick={leerMicro}>Leer microestación</button>
      {microMsg && <p style={hint}>{microMsg}</p>}
      {micro && <p>Lecturas: {JSON.stringify(micro.lecturas)} <span style={hint}>{micro.nota}</span></p>}
      <p style={hint}>Los sensores de suelo, cuando existan, registrarán aquí como humedad_suelo_mm.</p>
    </section>
  );
}

const panel = { background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 4px #0002" };
const hint = { fontSize: 13, color: "#555" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 4 };
const btn = { background: "#2d6a2e", color: "#fff", border: 0, borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
const btn2 = { background: "#fff", color: "#2d6a2e", border: "1px solid #2d6a2e", borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
