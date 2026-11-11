"use client";
import { useEffect, useState } from "react";
import { recuperarArbol, evento } from "../../../lib/api";

export default function Recuperar({ params }) {
  const [R, setR] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    evento("recuperacion_abierta");
    recuperarArbol(params.token).then(setR).catch((e) => setErr(String(e.message || e)));
  }, [params.token]);
  if (err) return <main style={m}><h1>Enlace no válido o caducado</h1><p>{err}</p><p><a href="/">Volver al simulador</a></p></main>;
  if (!R) return <main style={m}><p>Cargando tu árbol…</p></main>;
  const ent = R.entradas || {};
  return (
    <main style={m}>
      <h1>🥑 Tu aguacate virtual</h1>
      <p>Guardado el {(R.created_at || "").slice(0, 10)} · motor v{R.version_modelo} · enlace válido hasta {(R.vinculo?.expira || "").slice(0, 10)}.</p>
      <p>Reserva final: {R.resultados?.reserva_final_mm} mm · días estrés: {R.resultados?.dias_estres} · pre-estrés: {R.resultados?.dias_preestres}.</p>
      <p>Riego: {(ent.usar_goteros ? `${ent.num_goteros}×${ent.caudal_l_h} L/h×${ent.horas_riego_dia} h` : (ent.riego_mm_dia || []).join(", "))} · marco {ent.marco_x_m}×{ent.marco_y_m} m.</p>
      <p><a href="/">Seguir probando en el simulador</a></p>
    </main>
  );
}
const m = { maxWidth: 700, margin: "auto", padding: 16, fontFamily: "system-ui", background: "#f3f6f0", minHeight: "100vh" };
