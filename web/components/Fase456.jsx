"use client";
import { useEffect, useState } from "react";
import { guardarObservacion, listarObservaciones, leerDiagnostico, simularParcela } from "../lib/api";

// Fases 4-6: sanidad prudente (vigilancia, no diagnosticos) y parcela por sectores.
export default function Fase456({ meteo }) {
  const [ac, setAc] = useState({ fecha: new Date().toISOString().slice(0, 10), presencia: "0", fauna: "0", nota: "" });
  const [msg, setMsg] = useState("");
  const [fases, setFases] = useState([]);
  const [diag, setDiag] = useState(null);
  const [diagMsg, setDiagMsg] = useState("");
  const [sectores, setSectores] = useState([
    { nombre: "Llano", n_arboles: 40, riego: 3.5, textura: "franco", prof: 0.6 },
    { nombre: "Ladera", n_arboles: 20, riego: 2.5, textura: "arenoso", prof: 0.5 },
  ]);
  const [parc, setParc] = useState(null);

  useEffect(() => {
    listarObservaciones("fase", 20).then((j) => setFases(j.observaciones)).catch(() => {});
  }, []);

  async function vigilar() {
    try {
      await guardarObservacion({ fecha: ac.fecha, tipo: "acaro", valor_num: +ac.presencia, texto: null, nota: ac.nota || null });
      await guardarObservacion({ fecha: ac.fecha, tipo: "fauna_auxiliar", valor_num: +ac.fauna, texto: null, nota: null });
      setMsg("Vigilancia registrada. Revisar el envés no confirma ni descarta nada por sí solo.");
    } catch (e) { setMsg("Error: " + (e.message || e)); }
  }

  async function correrParcela() {
    try {
      const p = await simularParcela({
        nombre: "Mi parcela",
        eto_diaria: meteo?.eto, lluvia_diaria: meteo?.lluvia,
        sectores: sectores.map((s) => ({
          nombre: s.nombre, n_arboles: +s.n_arboles || 1,
          escenario: { riego_mm_dia: Array(14).fill(+s.riego || 0), textura: s.textura, prof_raices_m: +s.prof || 0.6 },
        })),
      });
      setParc(p);
    } catch (e) { setParc({ error: String(e.message || e) }); }
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(parc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "parcela-tec-rural.json"; a.click();
  }

  const setS = (i, k) => (e) => setSectores(sectores.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)));
  const inp = { fontSize: 16 };
  return (
    <section style={panel}>
      <h2>Sanidad y parcela</h2>

      <h3>Vigilancia de ácaro cristalino</h3>
      <p style={hint}>Anota lo que veas en el envés. La meteorología por sí sola no confirma la presencia de ácaros; un aviso territorial (RAIF) no equivale a una observación en tu finca.</p>
      <div style={grid}>
        <label>Fecha <input type="date" value={ac.fecha} onChange={(e) => setAc({ ...ac, fecha: e.target.value })} style={inp} /></label>
        <label>Colonias en envés <select value={ac.presencia} onChange={(e) => setAc({ ...ac, presencia: e.target.value })} style={inp}><option value="0">No vistas</option><option value="1">Vistas</option></select></label>
        <label>Fauna auxiliar <select value={ac.fauna} onChange={(e) => setAc({ ...ac, fauna: e.target.value })} style={inp}><option value="0">No vista</option><option value="1">Vista</option></select></label>
      </div>
      <label>Nota <input value={ac.nota} onChange={(e) => setAc({ ...ac, nota: e.target.value })} style={{ ...inp, width: "90%" }} /></label>
      <div><button style={btn} onClick={vigilar}>Registrar vigilancia</button> <span style={hint}>{msg}</span></div>
      {fases.length > 0 && <p style={hint}>Fases observadas: {fases.map((o) => `${o.fecha}: ${o.texto || o.valor_num}`).join(" · ")}</p>}
      {diag ? <p><a href={diag.url}>Abrir diagnóstico visual</a> <span style={hint}>{diag.nota}</span></p>
        : <div><button style={btn2} onClick={() => leerDiagnostico().then(setDiag).catch((e) => setDiagMsg(String(e.message || e)))}>Comprobar diagnóstico visual</button>
          {diagMsg && <p style={hint}>{diagMsg}</p>}</div>}

      <h3>Sectores de riego</h3>
      <p style={hint}>Grupos de árboles con distinto suelo, pendiente o riego. La predicción cuantitativa de producción por sector requiere datos y validación; aquí solo se compara agua y estrés.</p>
      {sectores.map((s, i) => (
        <div key={i} style={grid}>
          <label>Nombre <input value={s.nombre} onChange={setS(i, "nombre")} style={inp} /></label>
          <label>Árboles <input type="number" value={s.n_arboles} onChange={setS(i, "n_arboles")} style={inp} /></label>
          <label>Riego mm/d <input type="number" step="0.1" value={s.riego} onChange={setS(i, "riego")} style={inp} /></label>
          <label>Suelo <select value={s.textura} onChange={setS(i, "textura")} style={inp}><option value="arenoso">Arenoso</option><option value="franco">Franco</option><option value="arcilloso">Arcilloso</option></select></label>
          <label>Raíces m <input type="number" step="0.1" value={s.prof} onChange={setS(i, "prof")} style={inp} /></label>
          <button style={btn2} onClick={() => setSectores(sectores.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button style={btn2} onClick={() => setSectores([...sectores, { nombre: "Sector " + (sectores.length + 1), n_arboles: 10, riego: 3, textura: "franco", prof: 0.6 }])}>Añadir sector</button>{" "}
      <button style={btn} onClick={correrParcela}>Simular parcela</button>
      {parc && !parc.error && (
        <div>
          <table style={{ borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr><th>Sector</th><th>Árboles</th><th>Reserva fin</th><th>Estrés</th><th>Agua total L</th></tr></thead>
            <tbody>{parc.sectores.map((s) => <tr key={s.sector}><td>{s.sector}</td><td>{s.n_arboles}</td><td>{s.reserva_final_mm} mm</td><td>{s.dias_preestres}+{s.dias_estres}</td><td>{s.agua_aplicada_total_l}</td></tr>)}</tbody>
          </table>
          <p>Total agua: {parc.agua_total_l} L · formato {parc.formato}</p>
          <button style={btn2} onClick={exportar}>Exportar JSON (simulador general)</button>
        </div>
      )}
      {parc?.error && <p>Error: {parc.error}</p>}
    </section>
  );
}

const panel = { background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 4px #0002" };
const hint = { fontSize: 13, color: "#555" };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 4 };
const btn = { background: "#2d6a2e", color: "#fff", border: 0, borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
const btn2 = { background: "#fff", color: "#2d6a2e", border: "1px solid #2d6a2e", borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
