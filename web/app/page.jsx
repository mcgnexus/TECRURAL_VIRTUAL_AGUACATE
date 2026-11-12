"use client";
import { useEffect, useRef, useState } from "react";
import Viewer from "../components/Viewer";
import Guardar from "../components/Guardar";
import Fase3 from "../components/Fase3";
import Fase456 from "../components/Fase456";
import { simular, balanceLocal, EMOJI, evento, cargarMeteo } from "../lib/api";

const serie = (n, v) => Array(n).fill(v);
const BORRADOR_DIAS = 7;

export default function Page() {
  const [f, setF] = useState({ reserva: 35, edad: 8, ngot: 4, caudal: 4, horasA: 2, marcoX: 5, marcoY: 5, fmoj: 0.45, efi: 0.9, eto: 4.5, lluvia: 0, textura: "franco", profR: 0.6, kcOp: "adulto", kcMan: 0.85, tmax: 28, tmin: 16, oRes: "estimado", oEto: "estimado", oLlu: "estimado", sensor: "", sensorFecha: "", metProv: "", metUbi: "", metFecha: "", kgmin: 25, kgmax: 40, pmin: 1.2, pmax: 1.8, cmin: "", cmax: "", goteros: true });
  const [R, setR] = useState(null);
  const [motor, setMotor] = useState("");
  const [payloadB, setPayloadB] = useState(null);
  const [guardarVer, setGuardarVer] = useState(false);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [micro, setMicro] = useState(false);
  const [avanzado, setAvanzado] = useState(false);
  const [dia, setDia] = useState(6);
  const [dias, setDias] = useState(7);
  const [play, setPlay] = useState(false);
  const [vel, setVel] = useState(1);
  const [sliderVal, setSliderVal] = useState(55);
  const [meteo, setMeteo] = useState(null);
  const [meteoMsg, setMeteoMsg] = useState("");
  const nComp = useRef(0);
  const graf = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  useEffect(() => {
    if (!play || !R) return;
    const id = setInterval(() => setDia((d) => (d >= dias - 1 ? 0 : d + 1)), 1000 / vel);
    return () => clearInterval(id);
  }, [play, vel, R, dias]);

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
    const n = dias;
    const eto = meteo ? meteo.eto.slice(0, n) : serie(n, +f.eto || 0);
    const lluvia = meteo ? meteo.lluvia.slice(0, n) : serie(n, +f.lluvia || 0);
    const r0 = +f.reserva, mx = +f.marcoX || 5, my = +f.marcoY || 5, sup = mx * my;
    const efic = +f.efi || 0.9, red = 100 - sliderVal;
    const got = f.goteros;
    const ng = +f.ngot || 4, q = +f.caudal || 4, hA = +f.horasA || 2;
    const lA = ng * q * hA, aMm = +(lA / sup).toFixed(2);
    const a = got ? aMm : 3.5;
    const b = got ? +((ng * q * hA * (1 - red / 100)) / sup).toFixed(2) : +(a * (1 - red / 100)).toFixed(2);
    const mm2l = (mm) => +(mm * sup).toFixed(1);
    const origen = { reserva_inicial: f.oRes, eto: f.oEto, lluvia: f.oLlu, suelo: "introducido", marco: "introducido", riego: "introducido" };
    let A, B, via = "API (motor único)", payB = null;
    try {
      const base = { eto_diaria: eto, lluvia_diaria: lluvia, tmax_diaria: serie(n, +f.tmax || 0), tmin_diaria: serie(n, +f.tmin || 0), reserva_inicial_mm: r0, edad_anios: +f.edad, textura: f.textura, prof_raices_m: +f.profR || 0.6, kc_opcion: f.kcOp, kc_manual: +f.kcMan || null, marco_x_m: mx, marco_y_m: my, fraccion_mojada: +f.fmoj, eficiencia_aplicacion: efic, origen, sensor_reserva_id: f.sensor || null, sensor_reserva_fecha: f.sensorFecha || null, meteo_proveedor: f.metProv || null, meteo_ubicacion: f.metUbi || null, meteo_fecha: f.metFecha || null, hipotesis_kg_min: +f.kgmin, hipotesis_kg_max: +f.kgmax, hipotesis_precio_min: +f.pmin, hipotesis_precio_max: +f.pmax, hipotesis_coste_min: f.cmin === "" ? null : +f.cmin, hipotesis_coste_max: f.cmax === "" ? null : +f.cmax };
      if (got) {
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
      const mk = (mm) => { const bl = balanceLocal(eto, lluvia, serie(n, mm), r0, 90, efic); return { reservas_mm: bl.out, agotamiento_mm: bl.agot, estados: bl.est, drenaje_total_mm: bl.drenTotal, riego_efectivo_mm: serie(n, +(mm * efic).toFixed(2)), reserva_final_mm: bl.out[n - 1], dias_preestres: bl.est.filter((x) => x === "pre-estres").length, dias_estres: bl.est.filter((x) => x === "estres").length, estado: { variable: "reserva hídrica", nivel: "demostración (cálculo local no comprobado)", motivos: ["la API es inalcanzable; este cálculo no equivale al motor oficial"] }, fuentes: ["reserva_inicial", "eto", "lluvia", "riego"].map((d) => ({ dato: d, categoria: origen[d] || "estimado", detalle: "Sin comprobar: cálculo local." })), suelo: null, clima: null, riesgo_humedad: null, modelo: null }; };
      A = mk(a); B = mk(b);
    }
    setMotor(via);
    setR({ A, B, a, b, mm2l, sup });
    if (payB) setPayloadB(payB);
    setDia(n - 1); setPlay(false);
    nComp.current += 1;
    evento(nComp.current === 1 ? "primera_simulacion" : "comparacion");
    try { localStorage.setItem("tec_rural_borrador", JSON.stringify({ cuando: Date.now(), form: f })); } catch { /* sin almacenamiento */ }
    requestAnimationFrame(() => dibujar(graf.current, A.reservas_mm, B.reservas_mm, a, b, mm2l(a), n));
  }

  const estB = R ? R.B.estados : [];
  const cap = (R?.B.suelo?.capacidad_util_mm) || 90;
  const aguaPct = R ? Math.max(0, Math.min(100, Math.round((R.B.reserva_final_mm / cap) * 100))) : Math.round((+f.reserva / 90) * 100);
  const tempPct = Math.max(0, Math.min(100, Math.round(((+f.tmax || 0) / 40) * 100)));
  const diaTxt = R ? `Día ${dia + 1}/${dias} — ${estB[dia] || "—"} — reserva B: ${R.B.reservas_mm[dia]} mm` : "Ejecuta una simulación para ver la evolución.";
  const ubicacion = meteo ? (meteo.ubicacion.includes(",") ? "Almuñécar, Granada" : meteo.ubicacion) : "Almuñécar, Granada";

  return (
    <div className="bg-stone-200 min-h-screen flex items-center justify-center p-0 md:p-6 font-sans antialiased text-[#1b2f1f] select-none">
      <div className="relative w-full max-w-[420px] bg-[#FAF8F5] md:rounded-[52px] shadow-2xl overflow-hidden border-0 md:border-[10px] md:border-[#2b2b2b] flex flex-col min-h-screen md:min-h-[890px]">
        <header className="w-full pt-3 px-7 flex justify-between items-center shrink-0">
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">10:24</span>
          <div className="w-28 h-6 bg-black rounded-full mx-auto -mt-1"></div>
          <div className="flex items-center space-x-1.5 text-neutral-900">
            <svg className="w-4 h-3.5 fill-current" viewBox="0 0 17 12"><rect height="3" rx="0.5" width="3" x="0" y="9"></rect><rect height="6" rx="0.5" width="3" x="4.5" y="6"></rect><rect height="9" rx="0.5" width="3" x="9" y="3"></rect><rect height="12" rx="0.5" width="3" x="13.5" y="0"></rect></svg>
            <svg className="w-4 h-3.5 fill-current" viewBox="0 0 16 12"><path d="M8 12a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zm5.3-5.2a7.6 7.6 0 00-10.6 0 .8.8 0 11-1.1-1.1 9.2 9.2 0 0112.8 0 .8.8 0 01-1.1 1.1zm-2.4 2.4a4.3 4.3 0 00-5.8 0 .8.8 0 01-1.1-1.1 5.9 5.9 0 018 0 .8.8 0 01-1.1 1.1z"></path></svg>
            <div className="flex items-center pl-0.5"><div className="w-5 h-2.5 border border-neutral-900 rounded-sm p-0.5 flex items-center"><div className="w-3.5 h-full bg-neutral-900"></div></div><div className="w-0.5 h-1 bg-neutral-900"></div></div>
          </div>
        </header>
        <nav className="px-6 py-2.5 flex justify-between items-center bg-[#FAF8F5]">
          <div className="flex items-center gap-2">
            <svg className="w-9 h-7 text-[#2E7D32]" fill="currentColor" viewBox="0 0 42 30"><path d="M12.5 4C7.8 4 4 7.8 4 12.5c0 1.2.3 2.4.7 3.5H38c.6-1.1 1-2.3 1-3.5 0-4.7-3.8-8.5-8.5-8.5-2.8 0-5.2 1.3-6.8 3.4C22.2 5.5 17.8 4 12.5 4z" opacity="0.85"></path><path d="M2.5 22C1.1 22 0 23.1 0 24.5S1.1 27 2.5 27h37c1.4 0 2.5-1.1 2.5-2.5s-1.1-2.5-2.5-2.5H2.5z"></path><path d="M5 18h32c1.7 0 3 1.3 3 3H2c0-1.7 1.3-3 3-3z"></path></svg>
            <span className="text-[23px] font-black tracking-tight text-[#163D24]">TecRural</span>
          </div>
          <button aria-label="Abrir menú" className="p-1 rounded-lg hover:bg-stone-100 transition-colors" type="button" onClick={() => setAvanzado((v) => !v)}>
            <svg className="w-7 h-7 text-[#163D24]" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.3" viewBox="0 0 24 24"><line x1="4" x2="20" y1="7" y2="7"></line><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="17" y2="17"></line></svg>
          </button>
        </nav>
        <main className="flex-1 overflow-y-auto px-5 pb-6">
          <section className="flex justify-between items-start mt-2 mb-3">
            <div className="flex items-start gap-2.5">
              <div className="w-1.5 h-12 bg-[#2D7337] rounded-full mt-0.5"></div>
              <div>
                <h1 className="text-[27px] font-black tracking-tight text-[#112F1B] leading-none">Tu aguacate</h1>
                <div className="flex items-center gap-1 text-[#2b4c34] mt-1 text-[13px] font-medium">
                  <svg className="w-3.5 h-3.5 text-[#1b4325] fill-current" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>
                  <span>{ubicacion}</span>
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#DDE6D5] rounded-full text-[#23582C] text-[11px] font-bold tracking-wider uppercase">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"></path></svg>
              <span>SIMULACIÓN</span>
            </div>
          </section>

          <section className="relative rounded-3xl overflow-hidden shadow-sm border border-[#E8E2D5] bg-[#EAE3D4] mb-2 w-full">
            <Viewer estados={estB} dia={dia} compact onModo={(m) => evento(m === "3d" ? "visor_cargado" : "visor_fallo")} />
          </section>
          {R && (
            <div className="flex items-center gap-2 mb-3 text-[12px] text-[#2F4433]">
              <button className="bg-[#174626] text-white rounded-xl px-3 py-1.5 font-bold" onClick={() => setPlay((p) => !p)}>{play ? "⏸" : "▶"}</button>
              <input type="range" min={0} max={dias - 1} value={dia} onChange={(e) => { setDia(+e.target.value); setPlay(false); }} className="flex-1" aria-label="Día de la simulación" />
              <select value={vel} onChange={(e) => setVel(+e.target.value)} className="text-[12px] rounded-lg border border-[#9EAF9F] bg-white"><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select>
              <span className="whitespace-nowrap">{diaTxt}</span>
            </div>
          )}

          <section className="grid grid-cols-2 gap-2.5 mb-4">
            <article className="bg-[#F1ECE1] rounded-2xl p-2.5 px-3 flex items-center gap-2.5 border border-[#E4DECFA0]">
              <div className="shrink-0 text-[#1B5E20]">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path><path d="M3 20c2 1 4 1 6 0 2-1 4-1 6 0 2 1 4 1 6 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2"></path></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#14321C] truncate leading-tight">Agua del suelo {R ? `${R.B.reserva_final_mm} mm` : ""}</p>
                <div className="w-full bg-[#DED6C7] rounded-full h-2.5 mt-1.5 overflow-hidden"><div className="bg-[#5B9A28] h-full rounded-full" style={{ width: aguaPct + "%" }}></div></div>
              </div>
            </article>
            <article className="bg-[#F1ECE1] rounded-2xl p-2.5 px-3 flex items-center gap-2.5 border border-[#E4DECFA0]">
              <div className="shrink-0 text-[#255C30]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#14321C] truncate leading-tight">Temperatura {f.tmax}°C</p>
                <div className="w-full bg-[#DED6C7] rounded-full h-2.5 mt-1.5 overflow-hidden"><div className="bg-[#E47B2E] h-full rounded-full" style={{ width: tempPct + "%" }}></div></div>
              </div>
            </article>
          </section>

          <section className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-[#215E2C] fill-current" viewBox="0 0 24 24"><path d="M2 9h4v2H2zm16 0h4v2h-4zm-8-3h4v4h-4zm-5 4h14v2H5zm7 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"></path></svg>
              <h2 className="text-[19px] font-extrabold text-[#112F1B] tracking-tight">Escenario de riego</h2>
            </div>
            <p className="text-[14px] font-bold text-[#14341E] mb-1">Agua disponible</p>
            <div className="px-1 py-1">
              <input aria-label="Control de agua disponible" className="custom-slider w-full" style={{ "--p": sliderVal + "%" }} max="100" min="0" type="range" value={sliderVal} onChange={(e) => setSliderVal(+e.target.value)} />
            </div>
            <div className="flex justify-between items-center text-[11px] font-medium text-[#294B30] px-0.5 mt-0.5">
              <div className="flex items-center gap-1"><svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg><span>Menos agua</span></div>
              <div className="flex items-center gap-1"><span>Más agua</span><svg className="w-3.5 h-3.5 stroke-current fill-none" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg></div>
            </div>
            <p className="text-[12px] text-[#2F4433] mt-1">Escenario B: −{100 - sliderVal}% de riego respecto a tu dotación ({f.goteros ? `${f.ngot}×${f.caudal} L/h×${f.horasA} h` : "mm/día manual"}).</p>
          </section>

          <section className="grid grid-cols-2 gap-2.5 mb-3.5">
            <button className="flex items-center justify-center gap-2 bg-[#174626] hover:bg-[#12381e] text-white py-3 px-3 rounded-2xl font-bold text-[15px] shadow-sm transition active:scale-[0.98]" type="button" onClick={comparar}>
              <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Simular {dias} días</span>
            </button>
            <button className="flex items-center justify-center gap-1.5 bg-[#FAF8F4] hover:bg-[#F2ECE1] text-[#143B20] border-2 border-[#174626] py-3 px-2 rounded-2xl font-bold text-[14px] leading-tight transition active:scale-[0.98]" type="button" onClick={comparar}>
              <svg className="w-5 h-5 fill-current shrink-0 text-[#174626]" viewBox="0 0 24 24"><path d="M13 3v2.05A7.002 7.002 0 0 1 19 12h2c0-4.97-4.03-9-9-9zm-2 0c-4.97 0-9 4.03-9 9h2c0-3.87 3.13-7 7-7.95V3zm-1 9H2l4 7 4-7H8v-2h2v2zm12 0h-2v-2h-2v2h-2l4 7 4-7z"></path></svg>
              <span className="text-center">Comparar escenarios</span>
            </button>
          </section>
          {motor && <p className="text-[12px] text-[#2F4433] mb-2">Motor: {motor}</p>}

          <aside className="bg-[#EFE9DC] rounded-xl p-3 flex items-start gap-2.5 mb-3 border border-[#E3DCCE]">
            <div className="mt-0.5 text-[#1b3d22] shrink-0">
              <svg className="w-[18px] h-[18px] stroke-current fill-none" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="16" y2="12"></line><line x1="12" x2="12.01" y1="8" y2="8"></line></svg>
            </div>
            <p className="text-[12px] leading-snug text-[#2F4433]">
              <span className="font-bold italic text-[#16361E]">Resultado orientativo.</span> Te ayuda a anticipar la respuesta de tu aguacate según el riego seleccionado.{R ? ` Reserva hídrica: ${R.B.estado?.nivel}.` : ""}
            </p>
          </aside>

          <footer className="flex justify-center pb-2">
            {!guardarVer && !sinGuardar && (
              <button className="inline-flex items-center gap-2 border border-[#9EAF9F] hover:bg-stone-100 text-[#1E4D2B] bg-transparent py-1.5 px-6 rounded-xl text-[13px] font-semibold transition active:scale-95" type="button" onClick={() => { setGuardarVer(true); evento("guardado_iniciado"); }}>
                <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                <span>Guardar progreso</span>
              </button>
            )}
          </footer>
          {guardarVer && <div className="mb-3"><Guardar escenario={payloadB} onGuardado={() => {}} /></div>}
          {sinGuardar && <p className="text-[12px] text-[#2F4433] mb-3">Sigues probando sin guardar. Tu progreso no se conserva al cerrar; el borrador de este dispositivo se guarda 7 días.</p>}
          {!guardarVer && !sinGuardar && (
            <div className="flex justify-center pb-2"><button className="text-[12px] text-[#1E4D2B] underline" onClick={() => { setSinGuardar(true); evento("seguir_sin_guardar"); }}>Seguir probando sin guardar</button></div>
          )}
          <div className="flex justify-center pb-3">
            {!micro
              ? <button className="text-[12px] text-[#1E4D2B] underline" onClick={() => { setMicro(true); evento("interes_microestaciones"); }}>Quiero conocer las microestaciones</button>
              : <p className="text-[12px] text-[#2F4433]">Anotado tu interés. Te contactaremos cuando haya novedades para tu zona.</p>}
          </div>

          <details open={avanzado} onToggle={(e) => setAvanzado(e.target.open)} className="bg-white rounded-2xl p-3 mb-3 border border-[#E8E2D5]">
            <summary className="font-bold text-[#14341E] cursor-pointer">Ajustes avanzados y datos</summary>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 text-[13px]">
              <label>Horizonte (días) <input type="number" min="3" max="30" value={dias} onChange={(e) => setDias(Math.max(3, Math.min(30, +e.target.value || 7)))} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Reserva inicial (mm) <input type="number" value={f.reserva} onChange={set("reserva")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Edad (años) <input type="number" value={f.edad} onChange={set("edad")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label className="col-span-2"><input type="checkbox" checked={f.goteros} onChange={set("goteros")} /> Riego por goteros</label>
              {f.goteros ? (<>
                <label>Nº goteros <input type="number" value={f.ngot} onChange={set("ngot")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
                <label>Caudal L/h <input type="number" step="0.5" value={f.caudal} onChange={set("caudal")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
                <label>Horas/día <input type="number" step="0.25" value={f.horasA} onChange={set("horasA")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              </>) : null}
              <label>Marco X (m) <input type="number" step="0.5" value={f.marcoX} onChange={set("marcoX")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Marco Y (m) <input type="number" step="0.5" value={f.marcoY} onChange={set("marcoY")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Textura <select value={f.textura} onChange={set("textura")} className="ml-1 border rounded-lg px-1 py-0.5"><option value="arenoso">Arenoso</option><option value="franco">Franco</option><option value="arcilloso">Arcilloso</option></select></label>
              <label>Raíces (m) <input type="number" step="0.1" value={f.profR} onChange={set("profR")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Kc <select value={f.kcOp} onChange={set("kcOp")} className="ml-1 border rounded-lg px-1 py-0.5"><option value="adulto">Adulto</option><option value="joven">Joven</option><option value="manual">Manual</option></select></label>
              {f.kcOp === "manual" && <label>Kc manual <input type="number" step="0.05" value={f.kcMan} onChange={set("kcMan")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>}
              <label>Fracción mojada <input type="number" step="0.05" value={f.fmoj} onChange={set("fmoj")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Eficiencia <input type="number" step="0.05" value={f.efi} onChange={set("efi")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>ETo mm/d <input type="number" step="0.1" value={f.eto} onChange={set("eto")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Tmax °C <input type="number" step="0.5" value={f.tmax} onChange={set("tmax")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Lluvia mm/d <input type="number" step="0.5" value={f.lluvia} onChange={set("lluvia")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Tmin °C <input type="number" step="0.5" value={f.tmin} onChange={set("tmin")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <OrigenMini v={f.oRes} set={set("oRes")} nombre="reserva" />
              <OrigenMini v={f.oEto} set={set("oEto")} nombre="ETo" />
              <OrigenMini v={f.oLlu} set={set("oLlu")} nombre="lluvia" />
              {f.oRes === "medido" && (<><label>Sensor id <input value={f.sensor} onChange={set("sensor")} className="w-24 ml-1 border rounded-lg px-1 py-0.5" /></label><label>Fecha <input type="date" value={f.sensorFecha} onChange={set("sensorFecha")} className="ml-1 border rounded-lg px-1 py-0.5" /></label></>)}
              {(f.oEto === "externo" || f.oLlu === "externo") && (<><label>Proveedor <input value={f.metProv} onChange={set("metProv")} className="w-24 ml-1 border rounded-lg px-1 py-0.5" /></label><label>Ubicación <input value={f.metUbi} onChange={set("metUbi")} className="w-24 ml-1 border rounded-lg px-1 py-0.5" /></label><label>Fecha <input type="date" value={f.metFecha} onChange={set("metFecha")} className="ml-1 border rounded-lg px-1 py-0.5" /></label></>)}
              <label>Kg mín <input type="number" value={f.kgmin} onChange={set("kgmin")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Kg máx <input type="number" value={f.kgmax} onChange={set("kgmax")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Precio mín <input type="number" step="0.1" value={f.pmin} onChange={set("pmin")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Precio máx <input type="number" step="0.1" value={f.pmax} onChange={set("pmax")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Coste mín <input type="number" value={f.cmin} onChange={set("cmin")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
              <label>Coste máx <input type="number" value={f.cmax} onChange={set("cmax")} className="w-20 ml-1 border rounded-lg px-1 py-0.5" /></label>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="bg-[#174626] text-white rounded-xl px-3 py-1.5 text-[13px] font-bold" onClick={usarMeteo}>Cargar meteo Almuñécar ({dias} días)</button>
            </div>
            {meteo && <p className="text-[12px] mt-1">Meteo: {meteo.proveedor} · {meteo.ubicacion} · {meteo.actualizado} <button className="underline" onClick={() => setMeteo(null)}>manual</button></p>}
            {meteoMsg && !meteo && <p className="text-[12px] mt-1">{meteoMsg}</p>}
          </details>

          {R && (
            <section className="bg-white rounded-2xl p-3 mb-3 border border-[#E8E2D5] text-[13px]">
              <h2 className="font-bold text-[#14341E]">Reserva hídrica: {R.B.estado?.variable} — {R.B.estado?.nivel}</h2>
              <canvas ref={graf} width={640} height={220} style={{ width: "100%", background: "#fafafa", border: "1px solid #ddd", borderRadius: 8 }} />
              <p><b>A:</b> final {R.A.reserva_final_mm} mm · <b>B:</b> final {R.B.reserva_final_mm} mm · estrés en B: {R.B.dias_preestres} pre + {R.B.dias_estres} severo.</p>
              <p>Agua: A {R.a} mm/d = {R.mm2l(R.a)} L/árbol/día · B {R.b} mm/d = {R.mm2l(R.b)} L/árbol/día.
              {R.B.drenaje_total_mm > 0 ? ` Drenaje B: ${R.B.drenaje_total_mm} mm (no diagnostica asfixia).` : " Sin drenaje estimado."}
              {R.B.suelo && ` Suelo: ${R.B.suelo.textura}, raíces ${R.B.suelo.prof_raices_m} m → ${R.B.suelo.capacidad_util_mm} mm, Kc ${R.B.suelo.kc_usado}.`}</p>
              <ul className="list-disc ml-4">{(R.B.estado?.motivos || []).map((m, i) => <li key={i}>{m}</li>)}</ul>
              {R.B.clima && <p>Grados-día (base 10): {R.B.clima.gdd_base10}. {R.B.clima.alertas.length ? R.B.clima.alertas.map((a) => `Día ${a.dia + 1}: ${a.mensaje}`).join(" ") : "Sin alertas climáticas."}</p>}
              {R.B.riesgo_humedad && <p><b>Riesgo humedad:</b> {R.B.riesgo_humedad}</p>}
              {R?.modelo && <p className="text-[12px]">Motor v{R.modelo.version} · Kc adulto {R.modelo.parametros.kc_hass_adulto} · umbrales {R.modelo.parametros.umbral_preestres}/{R.modelo.parametros.umbral_estres}.</p>}
              <p><b>Tu hipótesis:</b> {f.kgmin}–{f.kgmax} kg/árbol · {Math.round(f.kgmin * f.pmin)}–{Math.round(f.kgmax * f.pmax)} €/árbol.
              {f.cmin !== "" && f.cmax !== "" && ` Margen: ${Math.round(f.kgmin * f.pmin - f.cmax)}–${Math.round(f.kgmax * f.pmax - f.cmin)} €/árbol.`}</p>
              <p className="text-[12px]">El modelo no estima la cosecha. El cuajado depende de floración y polinización.</p>
              <h3 className="font-bold mt-2">Datos utilizados{R?.modelo && <span> · motor v{R.modelo.version}</span>}</h3>
              <ul className="list-disc ml-4">{(R?.B.fuentes || []).map((s, i) => <li key={i}>{EMOJI[s.categoria]} <b>{s.dato}</b> ({s.categoria}): {s.detalle}</li>)}</ul>
            </section>
          )}

          <div className="bg-white rounded-2xl p-3 mb-3 border border-[#E8E2D5]"><Fase3 escenario={payloadB} /></div>
          <div className="bg-white rounded-2xl p-3 mb-3 border border-[#E8E2D5]"><Fase456 meteo={meteo} /></div>
        </main>
        <div className="w-full flex justify-center pb-2 pt-1 bg-[#FAF8F5] shrink-0"><div className="w-32 h-1 bg-neutral-900 rounded-full"></div></div>
      </div>
    </div>
  );
}

function dibujar(cv, RA, RB, a, b, la, n) {
  if (!cv) return;
  const g = cv.getContext("2d");
  const top = Math.max(...RA, ...RB, 10);
  const yMax = Math.ceil(top / 30) * 30;
  const Y = (v) => 200 - (v / yMax) * 190;
  g.clearRect(0, 0, 640, 220); g.strokeStyle = "#ccc";
  for (let y = 0; y <= yMax; y += yMax / 6) { g.beginPath(); g.moveTo(40, Y(y)); g.lineTo(630, Y(y)); g.stroke(); g.fillStyle = "#999"; g.fillText(Math.round(y), 8, Y(y) + 3); }
  const draw = (s, col) => { g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); s.forEach((v, i) => { const x = 40 + i * (590 / (n - 1)); const y = Y(v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  draw(RA, "#2d6a2e"); draw(RB, "#c0392b");
  g.fillStyle = "#000"; g.fillText(`— A ${a} mm/d (${la} L/árb/d)`, 45, 18);
  g.fillStyle = "#c0392b"; g.fillText(`— B ${b} mm/d`, 250, 18);
}

function OrigenMini({ v, set, nombre }) {
  return <label>Origen {nombre} <select value={v} onChange={set} className="ml-1 border rounded-lg px-1 py-0.5"><option value="estimado">🟡 Estimado</option><option value="introducido">🔵 Introducido</option><option value="medido">🟢 Medido</option><option value="externo">🌐 Externo</option></select></label>;
}
