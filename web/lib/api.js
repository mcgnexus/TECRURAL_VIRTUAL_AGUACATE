const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const API_URL = API;

export async function simular(payload) {
  const r = await fetch(`${API}/simular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error("API " + r.status);
  return r.json();
}

// Espejo local: SOLO demo offline. NO equivale al motor de la API.
export function balanceLocal(eto, lluvia, riego, reserva0, cap = 90, efic = 0.9) {
  let r = Math.min(cap, reserva0);
  const out = [], agot = [], est = [], dren = [];
  for (let i = 0; i < eto.length; i++) {
    const bruta = r + lluvia[i] + riego[i] * efic - eto[i] * 0.85;
    dren.push(+Math.max(0, bruta - cap).toFixed(2));
    r = Math.min(cap, Math.max(0, bruta));
    const f = r / cap;
    est.push(f < 0.25 ? "estres" : f < 0.40 ? "pre-estres" : "normal");
    out.push(+r.toFixed(2)); agot.push(+(cap - r).toFixed(2));
  }
  return { out, agot, est, dren, drenTotal: +dren.reduce((a, b) => a + b, 0).toFixed(2) };
}

export const EMOJI = { medido: "🟢", introducido: "🔵", estimado: "🟡", externo: "🌐" };

// Sesion anonima en memoria (no persiste, sin datos personales).
let _sesion = null;
export function sesion() {
  if (!_sesion) _sesion = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return _sesion;
}

export async function evento(nombre) {
  try {
    await fetch(`${API}/eventos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evento: nombre, sesion: sesion() }) });
  } catch { /* medicion opcional: nunca bloquea */ }
}

export async function cargarMeteo(lat = 36.733, lon = -3.69, municipio = "18001", dias = 14) {
  const r = await fetch(`${API}/meteo?lat=${lat}&lon=${lon}&municipio_id=${municipio}&dias=${dias}`);
  if (!r.ok) throw new Error("Meteo " + r.status);
  return r.json();
}
export async function guardarObservacion(o) {
  const r = await fetch(`${API}/observaciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
  if (!r.ok) throw new Error("Observación " + r.status);
  return r.json();
}

export async function listarObservaciones(tipo = "", limite = 20) {
  const r = await fetch(`${API}/observaciones?tipo=${tipo}&limite=${limite}`);
  if (!r.ok) throw new Error("Observaciones " + r.status);
  return r.json();
}

export async function contrastar(payload) {
  const r = await fetch(`${API}/contraste`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error("Contraste " + r.status);
  return r.json();
}

export async function leerMicroestacion() {
  const r = await fetch(`${API}/microestaciones`);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || ("Microestación " + r.status)); }
  return r.json();
}

export async function leerDiagnostico() {
  const r = await fetch(`${API}/diagnostico`);
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || ("Diagnóstico " + r.status)); }
  return r.json();
}

export async function simularParcela(payload) {
  const r = await fetch(`${API}/parcela/simular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || ("Parcela " + r.status)); }
  return r.json();
}
export async function guardarArbol(email, escenario, consent_comercial) {
  const r = await fetch(`${API}/guardar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, escenario, consent_comercial }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || ("Guardar " + r.status)); }
  return r.json();
}

export async function recuperarArbol(token) {
  const r = await fetch(`${API}/recuperar/${token}`);
  if (!r.ok) throw new Error("Enlace no válido o caducado");
  return r.json();
}
