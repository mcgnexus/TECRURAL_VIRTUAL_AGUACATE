"use client";
import { useEffect, useRef, useState } from "react";

const COLORES = { normal: ["#35902f", "#2f7a2d"], "pre-estres": ["#6f8f2f", "#5d7a28"], estres: ["#9a8a2e", "#8a7426"] };

// Visor Three.js DIRECTO (sin react-three-fiber). Recibe el estado agregado,
// no calcula nada. Carga diferida + vista 2D si el 3D falla.
export default function Viewer({ estados = [], dia = -1, onModo, compact = false }) {
  const secRef = useRef(null);
  const visorRef = useRef(null);
  const canvas2d = useRef(null);
  const api3d = useRef({ listo: false, set: null });
  const estadosRef = useRef(estados);
  estadosRef.current = estados;
  const diaRef = useRef(dia);
  diaRef.current = dia;
  const [modo, setModo] = useState("pendiente"); // pendiente | 3d | 2d
  const [nota, setNota] = useState("");
  const [parte, setParte] = useState(null);
  const estadoEfectivo = () => {
    const es = estadosRef.current || [];
    const d = diaRef.current;
    if (d >= 0 && d < es.length) return es[d];
    return es.length ? es[es.length - 1] : "—";
  };
  useEffect(() => { dibujar2d(); }, [estados, dia, modo]);

  function dibujar2d() {
    const cv = canvas2d.current;
    if (!cv || modo !== "2d") return;
    const g = cv.getContext("2d");
    const [hoja, copa] = COLORES[estadoEfectivo()] || COLORES.normal;
    const W = (cv.width = cv.parentElement.clientWidth || 640);
    cv.height = 340;
    const grd = g.createLinearGradient(0, 0, 0, 340);
    grd.addColorStop(0, "#bfe3ff"); grd.addColorStop(1, "#e8f5d8");
    g.fillStyle = grd; g.fillRect(0, 0, W, 340);
    g.fillStyle = "#8a6b46"; g.fillRect(0, 310, W, 30);
    g.fillStyle = "#6b4a2f"; g.fillRect(W / 2 - 10, 170, 20, 140);
    g.fillStyle = copa;
    [[0, -60, 70], [-45, -30, 50], [45, -30, 50], [0, -110, 55]].forEach(([dx, dy, r]) => {
      g.beginPath(); g.arc(W / 2 + dx, 170 + dy, r, 0, 7); g.fill();
    });
    g.fillStyle = hoja;
    for (let i = 0; i < 40; i++) g.fillRect(W / 2 + Math.sin(i * 3.7) * 70, 110 + Math.cos(i * 5.3) * 60, 8, 5);
    g.fillStyle = "#2b4d1e";
    for (let i = 0; i < 8; i++) g.fillRect(W / 2 - 50 + i * 14, 140 + (i % 3) * 18, 9, 12);
    g.fillStyle = "#000"; g.fillText("Esquema 2D — estado: " + estadoEfectivo(), 10, 18);
  }

  const avisar = (m) => { setModo(m); onModo && onModo(m); };
  // El contenedor 3D solo existe cuando modo==="3d": primero se muestra,
  // y la escena se construye en el efecto de abajo, con el DOM ya montado.
  function cargar3d() {
    if (api3d.current.listo || api3d.current.cargando) { avisar("3d"); return; }
    api3d.current.cargando = true;
    avisar("3d");
  }
  useEffect(() => {
    if (modo === "3d" && !api3d.current.listo) init3d();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);
  async function init3d() {
    let THREE, OrbitControls;
    try {
      THREE = await import("three");
      ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
    } catch (err) { api3d.current.cargando = false; avisar("2d"); setNota("No se pudo cargar Three.js: " + (err && err.message ? err.message : err)); return; }
    try {
      const el = visorRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(el.clientWidth, ALT);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xbfe3ff, 8, 22);
      const cam = new THREE.PerspectiveCamera(45, el.clientWidth / ALT, 0.1, 100);
      cam.position.set(2.6, 2.2, 3.4);
      new OrbitControls(cam, renderer.domElement).target.set(0, 1.6, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5f2a, 1.1));
      const sun = new THREE.DirectionalLight(0xfff2cc, 1.4); sun.position.set(4, 6, 3); scene.add(sun);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshStandardMaterial({ color: 0x8a6b46 }));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);
      let leafMat = null, leaves = null, tronco = null;
      let glbOk = false;
      try {
        const head = await fetch("arbol_hass.glb", { method: "HEAD" });
        if (head.ok) {
          const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
          scene.add((await new GLTFLoader().loadAsync("arbol_hass.glb")).scene);
          glbOk = true;
        }
      } catch { glbOk = false; }
      if (!glbOk) {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 10), trunkMat);
        trunk.position.y = 0.8; trunk.userData.parte = "tronco"; scene.add(trunk); tronco = trunk;
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 7), trunkMat);
          b.position.y = 1.7; b.rotation.z = 0.5 + i * 0.15; b.rotation.y = i * 1.7; b.translateY(0.4); b.userData.parte = "tronco"; scene.add(b);
        }
        leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a2d, roughness: 0.7 });
        const canopy = new THREE.Group(); scene.add(canopy);
        const blobGeo = new THREE.SphereGeometry(1, 14, 12);
        [[0, 2.6, 0, 1.25], [0.8, 2.2, 0.3, 0.85], [-0.8, 2.3, -0.2, 0.9], [0.1, 3.1, -0.3, 0.8], [-0.2, 2.4, 0.7, 0.75]]
          .forEach(([x, y, z, s]) => { const m = new THREE.Mesh(blobGeo, leafMat); m.position.set(x, y, z); m.scale.setScalar(s); canopy.add(m); });
        leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.24),
          new THREE.MeshStandardMaterial({ color: 0x35902f, roughness: 0.6, side: THREE.DoubleSide }), 400);
        const d = new THREE.Object3D();
        for (let i = 0; i < 400; i++) {
          const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 1.0 + Math.random() * 0.35;
          d.position.set(Math.sin(p) * Math.cos(t) * r, 2.55 + Math.cos(p) * r * 0.75, Math.sin(p) * Math.sin(t) * r);
          d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
        }
        scene.add(leaves);
        leaves.userData.parte = "hojas";
        const fruits = new THREE.Group();
        fruits.userData.parte = "frutos";
        for (let i = 0; i < 25; i++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2b4d1e, roughness: 0.45 }));
          f.scale.y = 1.3;
          const t = Math.random() * Math.PI * 2;
          f.position.set(Math.cos(t) * (0.7 + Math.random() * 0.5), 1.9 + Math.random() * 0.9, Math.sin(t) * (0.7 + Math.random() * 0.5));
          f.userData.parte = "frutos";
          fruits.add(f);
        }
        scene.add(fruits);
        ground.userData.parte = "suelo";
        if (tronco) tronco.userData.parte = "tronco";
      }
      // Tocar partes (tactil y raton): distingue toque de arrastre para no
      // interferir con girar/acercar. Informa, no diagnostica.
      {
        const ray = new THREE.Raycaster();
        let px = 0, py = 0;
        const dom = renderer.domElement;
        dom.addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; });
        dom.addEventListener("pointerup", (e) => {
          if (Math.hypot(e.clientX - px, e.clientY - py) > 8) return;
          const r = dom.getBoundingClientRect();
          const nd = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(nd, cam);
          const hit = ray.intersectObjects(scene.children, true)[0];
          let o = hit && hit.object, parte = "arbol";
          while (o) { if (o.userData && o.userData.parte) { parte = o.userData.parte; break; } o = o.parent; }
          setParte(parte);
        });
      }
      const set3d = (e) => {
        if (!leaves) return;
        const paleta = { normal: [0x35902f, 0x2f7a2d], "pre-estres": [0x6f8f2f, 0x5d7a28], estres: [0x9a8a2e, 0x8a7426] };
        const c = paleta[e] || paleta.normal;
        leaves.material.color.setHex(c[0]); leafMat.color.setHex(c[1]);
        leaves.rotation.z = e === "normal" ? 0 : e === "pre-estres" ? 0.03 : 0.07;
      };
      let frames = 0, t0 = performance.now(), degradado = false, visible = true, pausado = false;
      new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(el);
      document.addEventListener("visibilitychange", () => { pausado = document.hidden; });
      addEventListener("resize", () => renderer.setSize(el.clientWidth, ALT));
      (function loop() {
        requestAnimationFrame(loop);
        if (pausado || !visible) return;
        renderer.render(scene, cam);
        if (!degradado && ++frames === 120) {
          if (frames * 1000 / (performance.now() - t0) < 28) { degradado = true; renderer.setPixelRatio(1); if (leaves) leaves.count = 200; }
          frames = 0; t0 = performance.now();
        }
      })();
      api3d.current = { listo: true, set: set3d };
      set3d(estadoEfectivo());
      setNota(glbOk ? "Modelo: arbol_hass.glb" : "Modelo provisional procedural (no fotorrealista)");
      avisar("3d");
    } catch (err) { api3d.current.cargando = false; avisar("2d"); setNota("Vista 3D no disponible: " + (err && err.message ? err.message : err)); }
  }

  useEffect(() => {
    const obs = new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { o.disconnect(); cargar3d(); } }, { rootMargin: "200px" });
    if (secRef.current) obs.observe(secRef.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (modo === "3d" && api3d.current.set) api3d.current.set(estadoEfectivo()); }, [estados, dia, modo]);

  const ALT = compact ? 260 : 340;
  const INFO_PARTES = {
    hojas: "Hojas: su aspecto sigue el estado hídrico simulado. Es una ilustración, no una foto de tu árbol.",
    frutos: "Frutos: se muestran como referencia visual. El modelo aún no simula cuajado ni calibre.",
    suelo: "Suelo: la reserva se calcula para toda la parcela. El dibujo no muestra el bulbo húmedo del goteo.",
    tronco: "Tronco y ramas: estructura orientativa de un Hass adulto.",
    arbol: "Árbol: representación ilustrativa del estado simulado.",
  };

  const cuerpo = (<>
      {modo === "pendiente" && (<div><button style={btn} onClick={cargar3d}>Cargar vista 3D</button>{" "}<button style={btn2} onClick={() => avisar("2d")}>Usar vista 2D</button></div>)}
      {modo === "3d" && <div ref={visorRef} style={{ height: ALT, background: "linear-gradient(#bfe3ff,#e8f5d8)", borderRadius: 10 }} />}
      {modo !== "3d" && modo !== "pendiente" && <canvas ref={canvas2d} style={{ width: "100%", borderRadius: 10 }} onClick={() => setParte("arbol")} />}
      {nota && <p style={hint}>{nota}</p>}
      {parte && <p style={hint}><b>{parte}:</b> {INFO_PARTES[parte]}</p>}
      <p><span style={badge}>Estado: {estadoEfectivo()}</span></p>
    </>);
  if (compact) return (<div ref={secRef}>{cuerpo}</div>);
  return (
    <section ref={secRef} style={panel}>
      <h2>Árbol 3D — escenario B</h2>
      <p style={hint}>Demostración visual; aún no representa un modelo validado. El visor recibe el estado del modelo, no calcula nada. Toca hojas, frutos o suelo para saber qué muestra cada parte.</p>
      {cuerpo}
    </section>
  );
}

const panel = { background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 1px 4px #0002" };
const hint = { fontSize: 13, color: "#555" };
const btn = { background: "#2d6a2e", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 16 };
const btn2 = { background: "#fff", color: "#2d6a2e", border: "1px solid #2d6a2e", borderRadius: 8, padding: "10px 16px", fontSize: 16 };
const badge = { display: "inline-block", background: "#b7791f", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 13 };
