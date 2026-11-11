"use client";
import { useState } from "react";
import { guardarArbol, evento } from "../lib/api";

// Guarda tu aguacate virtual: email solo para recuperar el escenario.
// La casilla comercial va desmarcada; texto y base juridica pendientes de revision.
export default function Guardar({ escenario, onGuardado }) {
  const [email, setEmail] = useState("");
  const [comercial, setComercial] = useState(false);
  const [estado, setEstado] = useState("idle"); // idle | enviando | ok | error
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState("");

  async function enviar() {
    setEstado("enviando"); setMsg("");
    evento("guardado_solicitado");
    try {
      const r = await guardarArbol(email, escenario, comercial);
      setRes(r); setEstado("ok");
      onGuardado && onGuardado(r);
    } catch (e) { setEstado("error"); setMsg(String(e.message || e)); }
  }

  if (estado === "ok" && res) {
    return (
      <div>
        <p>✅ Árbol guardado. Enlace válido hasta {res.expira?.slice(0, 10)}:</p>
        <p><a href={res.enlace}>{res.enlace}</a></p>
        <p style={hint}>{res.envio?.nota} {res.nota}</p>
      </div>
    );
  }
  return (
    <div>
      <h3>Guarda tu aguacate virtual</h3>
      <p>Recibe un enlace para recuperar tu árbol, sus datos y los escenarios que has probado.</p>
      <label>Tu correo electrónico <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.es" style={{ width: 220, fontSize: 16 }} /></label>
      <label style={{ display: "block", marginTop: 8 }}>
        <input type="checkbox" checked={comercial} onChange={(e) => setComercial(e.target.checked)} /> Quiero recibir comunicaciones comerciales (opcional).
      </label>
      <p style={hint}>Usamos tu correo solo para recuperar tu árbol. Texto y base jurídica pendientes de revisión antes de publicar.</p>
      <button style={btn} disabled={estado === "enviando" || !escenario} onClick={enviar}>{estado === "enviando" ? "Guardando…" : "Guardar mi árbol"}</button>
      {estado === "error" && <p style={{ color: "#a00" }}>{msg}</p>}
    </div>
  );
}

const btn = { background: "#2d6a2e", color: "#fff", border: 0, borderRadius: 8, padding: "12px 18px", fontSize: 17, marginTop: 8 };
const hint = { fontSize: 13, color: "#555" };
