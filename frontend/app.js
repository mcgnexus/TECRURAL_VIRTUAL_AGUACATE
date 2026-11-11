// Sin imports estaticos de Three.js: el visor 3D se carga bajo demanda.
// El comparador funciona sin 3D; el visor solo VISUALIZA el estado agregado.

// Espejo local del motor: SOLO para demo offline. NO es equivalente a la API:
// no esta comprobado contra ella. Cuando se usa, la pantalla lo declara.
function balanceLocal(eto, lluvia, riego, reserva0, cap = 90, efic = 0.9) {
  let r = Math.min(cap, reserva0);
  const out = [], agot = [], est = [], dren = [];
  for (let i = 0; i < eto.length; i++) {
    const rEf = riego[i] * efic;
    const bruta = r + lluvia[i] + rEf - eto[i] * 0.85;
    dren.push(+Math.max(0, bruta - cap).toFixed(2));
    r = Math.min(cap, Math.max(0, bruta));
    const f = r / cap;
    est.push(f < 0.25 ? 'estres' : f < 0.40 ? 'pre-estres' : 'normal');
    out.push(+r.toFixed(2)); agot.push(+(cap - r).toFixed(2));
  }
  return { out, agot, est, dren, drenTotal: +dren.reduce((a, b) => a + b, 0).toFixed(2) };
}

const EMOJI = { medido: '🟢', introducido: '🔵', estimado: '🟡', externo: '🌐' };
const $ = id => document.getElementById(id);

// --- Visor: texto siempre; 3D bajo demanda; 2D si el 3D falla ---
let ultimoEstado = '—';
const api3d = { listo: false, set: null }; // se rellena al cargar Three.js
function setEstadoVisual(e) {
  ultimoEstado = e;
  $('estadoArbol').textContent = 'Estado: ' + e;
  if (api3d.listo && api3d.set) api3d.set(e);
  dibujar2d(e); // la vista 2D tambien se mantiene al dia
}

const COLORES = { normal: ['#35902f', '#2f7a2d'], 'pre-estres': ['#6f8f2f', '#5d7a28'], estres: ['#9a8a2e', '#8a7426'] };

// Vista 2D accesible: esquema + texto, funciona sin WebGL ni red extra.
function dibujar2d(e) {
  const cv = $('visor2d');
  if (!cv || cv.style.display === 'none') return;
  const g = cv.getContext('2d');
  const [hoja, copa] = COLORES[e] || COLORES.normal;
  g.clearRect(0, 0, cv.width, cv.height);
  const grd = g.createLinearGradient(0, 0, 0, cv.height);
  grd.addColorStop(0, '#bfe3ff'); grd.addColorStop(1, '#e8f5d8');
  g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#8a6b46'; g.fillRect(0, cv.height - 30, cv.width, 30);
  g.fillStyle = '#6b4a2f'; g.fillRect(cv.width / 2 - 10, cv.height - 170, 20, 140);
  g.fillStyle = copa;
  [[0, -60, 70], [-45, -30, 50], [45, -30, 50], [0, -110, 55]].forEach(([dx, dy, r]) => {
    g.beginPath(); g.arc(cv.width / 2 + dx, cv.height - 170 + dy, r, 0, 7); g.fill();
  });
  g.fillStyle = hoja;
  for (let i = 0; i < 40; i++) {
    const x = cv.width / 2 + (Math.sin(i * 3.7) * 70), y = cv.height - 230 + (Math.cos(i * 5.3) * 60);
    g.fillRect(x, y, 8, 5);
  }
  g.fillStyle = '#2b4d1e';
  for (let i = 0; i < 8; i++) g.fillRect(cv.width / 2 - 50 + i * 14, cv.height - 200 + (i % 3) * 18, 9, 12);
  g.fillStyle = '#000'; g.fillText('Esquema 2D — estado: ' + e, 10, 18);
}

async function cargar3d() {
  $('visorPH').style.display = 'none';
  if (api3d.listo) { $('visor').style.display = ''; return; }
  let THREE, OrbitControls;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch (err) {
    usar2d('No se pudo cargar Three.js (red o WebGL). Vista 2D activada.');
    return;
  }
  try {
    const el = $('visor');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, 340);
    el.appendChild(renderer.domElement);
    el.style.display = '';
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbfe3ff, 8, 22);
    const cam = new THREE.PerspectiveCamera(45, el.clientWidth / 340, 0.1, 100);
    cam.position.set(2.6, 2.2, 3.4);
    new OrbitControls(cam, renderer.domElement).target.set(0, 1.6, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5f2a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2cc, 1.4); sun.position.set(4, 6, 3); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshStandardMaterial({ color: 0x8a6b46 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    // Si existe arbol_hass.glb (exportado de Blender, con derechos de uso),
    // se usa; si no, arbol procedural provisional (no fotorrealista).
    let leafMat, leaves;
    let glbOk = false;
    try {
      const head = await fetch('arbol_hass.glb', { method: 'HEAD' });
      if (head.ok) {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync('arbol_hass.glb');
        scene.add(gltf.scene);
        glbOk = true;
      }
    } catch { glbOk = false; }
    if (!glbOk) {
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.95 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 10), trunkMat);
      trunk.position.y = 0.8; scene.add(trunk);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 7), trunkMat);
        b.position.y = 1.7; b.rotation.z = 0.5 + i * 0.15; b.rotation.y = i * 1.7; b.translateY(0.4); scene.add(b);
      }
      leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a2d, roughness: 0.7 });
      const canopy = new THREE.Group(); scene.add(canopy);
      const blobGeo = new THREE.SphereGeometry(1, 14, 12);
      [[0, 2.6, 0, 1.25], [0.8, 2.2, 0.3, 0.85], [-0.8, 2.3, -0.2, 0.9], [0.1, 3.1, -0.3, 0.8], [-0.2, 2.4, 0.7, 0.75]]
        .forEach(([x, y, z, s]) => { const m = new THREE.Mesh(blobGeo, leafMat); m.position.set(x, y, z); m.scale.setScalar(s); canopy.add(m); });
      const leafGeo = new THREE.PlaneGeometry(0.16, 0.24);
      leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x35902f, roughness: 0.6, side: THREE.DoubleSide }), 400);
      const d = new THREE.Object3D();
      for (let i = 0; i < 400; i++) {
        const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 1.0 + Math.random() * 0.35;
        d.position.set(Math.sin(p) * Math.cos(t) * r, 2.55 + Math.cos(p) * r * 0.75, Math.sin(p) * Math.sin(t) * r);
        d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
      }
      scene.add(leaves);
      const fruits = new THREE.Group();
      for (let i = 0; i < 25; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshStandardMaterial({ color: 0x2b4d1e, roughness: 0.45 }));
        f.scale.y = 1.3;
        const t = Math.random() * Math.PI * 2;
        f.position.set(Math.cos(t) * (0.7 + Math.random() * 0.5), 1.9 + Math.random() * 0.9, Math.sin(t) * (0.7 + Math.random() * 0.5));
        fruits.add(f);
      }
      scene.add(fruits);
    }
    const set3d = e => {
      if (!leaves) return; // GLB: el mapeo de estados se definira con el asset
      const c = { normal: [0x35902f, 0x2f7a2d], 'pre-estres': [0x6f8f2f, 0x5d7a28], estres: [0x9a8a2e, 0x8a7426] }[e];
      leaves.material.color.setHex(c[0]); leafMat.color.setHex(c[1]);
      leaves.rotation.z = e === 'normal' ? 0 : e === 'pre-estres' ? 0.03 : 0.07;
    };
    // Calidad adaptable: si el movil no mantiene ~28 fps, baja resolucion y hojas.
    let frames = 0, t0 = performance.now(), degradado = false, visible = true, pausado = false;
    new IntersectionObserver(en => { visible = en[0].isIntersecting; }).observe(el);
    document.addEventListener('visibilitychange', () => { pausado = document.hidden; });
    addEventListener('resize', () => renderer.setSize(el.clientWidth, 340));
    (function loop() {
      requestAnimationFrame(loop);
      if (pausado || !visible) return;
      renderer.render(scene, cam);
      if (!degradado && ++frames === 120) {
        const fps = frames * 1000 / (performance.now() - t0);
        if (fps < 28) {
          degradado = true;
          renderer.setPixelRatio(1);
          if (leaves) leaves.count = 200;
        }
        frames = 0; t0 = performance.now();
      }
    })();
    api3d.listo = true; api3d.set = set3d;
    set3d(ultimoEstado);
    $('origen3d').textContent = glbOk ? 'Modelo: arbol_hass.glb' : 'Modelo provisional procedural (no fotorrealista)';
  } catch (err) {
    usar2d('WebGL no disponible. Vista 2D activada.');
  }
}

function usar2d(msg) {
  $('visor').style.display = 'none';
  $('visorPH').style.display = 'none';
  const cv = $('visor2d');
  cv.style.display = '';
  cv.width = cv.parentElement.clientWidth || 640; cv.height = 340;
  if (msg) $('motor2d').textContent = msg;
  dibujar2d(ultimoEstado);
}
$('cargar3d').onclick = cargar3d;
$('ver2d').onclick = () => usar2d('');
// Carga diferida: el 3D solo se descarga cuando su seccion entra en pantalla.
new IntersectionObserver((en, obs) => {
  if (en[0].isIntersecting) { obs.disconnect(); cargar3d(); }
}, { rootMargin: '200px' }).observe($('visorSec'));

// --- Comparador A vs B ---
const serie = (n, v) => Array(n).fill(v);
const toggleBoxes = () => {
  $('boxGoteros').style.display = $('usarGoteros').checked ? '' : 'none';
  $('boxMm').style.display = $('usarGoteros').checked ? 'none' : '';
  $('boxSensor').style.display = $('origen_reserva').value === 'medido' ? '' : 'none';
  $('boxMeteo').style.display = ($('origen_eto').value === 'externo' || $('origen_lluvia').value === 'externo') ? '' : 'none';
};
$('usarGoteros').onchange = toggleBoxes;
$('origen_reserva').onchange = toggleBoxes;
$('origen_eto').onchange = toggleBoxes;
$('origen_lluvia').onchange = toggleBoxes;
toggleBoxes();

async function simularAPI(payload) {
  const r = await fetch('http://127.0.0.1:8000/simular', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('API ' + r.status);
  return r.json();
}

$('simular').onclick = async () => {
  const n = 14;
  const etoV = +$('eto').value || 0, lluV = +$('lluvia').value || 0;
  const eto = serie(n, etoV), lluvia = serie(n, lluV);
  const r0 = +$('reserva').value, edad = +$('edad').value;
  const mx = +$('marcoX').value || 5, my = +$('marcoY').value || 5;
  const efic = +$('efi').value || 0.9, fmoj = +$('fmoj').value || 0.45;
  const sup = mx * my, mm2l = mm => +(mm * sup).toFixed(1);
  const red = +$('redB').value;
  const got = $('usarGoteros').checked;
  const ng = +$('ngot').value || 4, q = +$('caudal').value || 4, hA = +$('horasA').value || 2;
  const lA = ng * q * hA, aMm = +(lA / sup).toFixed(2);
  const a = got ? aMm : (+$('riegoA').value || 3.5);
  const b = got ? +((ng * q * hA * (1 - red / 100)) / sup).toFixed(2) : +(a * (1 - red / 100)).toFixed(2);
  const origen = {
    reserva_inicial: $('origen_reserva').value, eto: $('origen_eto').value,
    lluvia: $('origen_lluvia').value, suelo: 'estimado', marco: 'introducido',
    riego: got ? 'introducido' : 'introducido',
  };

  let A, B, estado, fuentes, via = 'API (motor único)';
  try {
    const base = {
      eto_diaria: eto, lluvia_diaria: lluvia, reserva_inicial_mm: r0, edad_anios: edad,
      suelo_util_mm: 90, marco_x_m: mx, marco_y_m: my, fraccion_mojada: fmoj,
      eficiencia_aplicacion: efic, origen,
      sensor_reserva_id: $('sensor_id').value || null, sensor_reserva_fecha: $('sensor_fecha').value || null,
      meteo_proveedor: $('met_prov').value || null, meteo_ubicacion: $('met_ubi').value || null,
      meteo_fecha: $('met_fecha').value || null,
    };
    if (got) {
      A = await simularAPI({ ...base, usar_goteros: true, num_goteros: ng, caudal_l_h: q, horas_riego_dia: hA });
      B = await simularAPI({ ...base, usar_goteros: true, num_goteros: ng, caudal_l_h: q, horas_riego_dia: +(hA * (1 - red / 100)).toFixed(2) });
    } else {
      A = await simularAPI({ ...base, riego_mm_dia: serie(n, a) });
      B = await simularAPI({ ...base, riego_mm_dia: serie(n, b) });
    }
    estado = A.estado; fuentes = B.fuentes;
  } catch (e) {
    via = 'cálculo local NO equivalente (API inalcanzable; sin comprobar contra el motor oficial)';
    const mk = mm => {
      const bl = balanceLocal(eto, lluvia, serie(n, mm), r0, 90, efic);
      return { reservas_mm: bl.out, agotamiento_mm: bl.agot, estados: bl.est, drenaje_mm: bl.dren, drenaje_total_mm: bl.drenTotal, riego_efectivo_mm: serie(n, +(mm * efic).toFixed(2)), reserva_final_mm: bl.out[13], dias_preestres: bl.est.filter(x => x === 'pre-estres').length, dias_estres: bl.est.filter(x => x === 'estres').length };
    };
    A = mk(a); B = mk(b);
    estado = { variable: 'reserva hídrica', nivel: 'demostración (cálculo local no comprobado)', motivos: ['la API es inalcanzable; este cálculo no equivale al motor oficial'] };
    fuentes = [
      { dato: 'reserva_inicial', categoria: origen.reserva_inicial, detalle: 'Sin comprobar: cálculo local.' },
      { dato: 'eto', categoria: origen.eto, detalle: 'Sin comprobar: cálculo local.' },
      { dato: 'lluvia', categoria: origen.lluvia, detalle: 'Sin comprobar: cálculo local.' },
      { dato: 'riego', categoria: 'introducido', detalle: 'Sin comprobar: cálculo local.' },
    ];
  }
  $('motor').textContent = 'Motor: ' + via;
  const RA = A.reservas_mm, RB = B.reservas_mm;
  const preB = B.dias_preestres, estB = B.dias_estres;
  setEstadoVisual(B.estados[B.estados.length - 1]);
  $('nivelRes').textContent = estado.variable + ': ' + estado.nivel;
  $('motivos').innerHTML = estado.motivos.map(m => `<li>${m}</li>`).join('');
  const cv = $('graf'), g = cv.getContext('2d');
  g.clearRect(0, 0, 640, 220); g.strokeStyle = '#ccc';
  for (let y = 0; y <= 90; y += 15) { g.beginPath(); g.moveTo(40, 200 - y * 2); g.lineTo(630, 200 - y * 2); g.stroke(); }
  const draw = (s, col) => { g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); s.forEach((v, i) => { const x = 40 + i * (590 / 13), y = 200 - v * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  draw(RA, '#2d6a2e'); draw(RB, '#c0392b');
  g.fillStyle = '#000'; g.fillText(`— A ${a} mm/d (${mm2l(a)} L/árb/d)`, 45, 18);
  g.fillStyle = '#c0392b'; g.fillText(`— B ${b} mm/d (-${red}%)`, 250, 18);
  const diasE = B.estados.filter(e => e !== 'normal').length;
  const drenTxt = B.drenaje_total_mm > 0 ? ` Drenaje estimado B: ${B.drenaje_total_mm} mm (exceso sobre capacidad; no diagnostica asfixia).` : ' Sin drenaje estimado.';
  $('res').innerHTML =
    `<p><b>A:</b> final ${RA[13]} mm (agotamiento ${A.agotamiento_mm[13]} mm) · ` +
    `<b>B:</b> final ${RB[13]} mm (agotamiento ${B.agotamiento_mm[13]} mm) · días con estrés en B: ${diasE} (${preB} pre + ${estB} severo).</p>` +
    `<p>Agua aplicada: A ${a} mm/d = ${mm2l(a)} L/árbol/día${got ? ` (${ng}×${q} L/h×${hA} h)` : ''} · B ${b} mm/d = ${mm2l(b)} L/árbol/día.` + drenTxt + `</p>` +
    `<p class="hint">Marco ${mx}×${my} m = ${sup} m²/árbol · fracción mojada ${fmoj} (no modifica el balance: el bulbo 3D no se simula) · eficiencia ${efic} (excluye percolación). ` +
    `Equivalencia de volumen: no significa mojado uniforme ni que todo llegue a raíces.</p>`;
  const kmin = +$('kgmin').value, kmax = +$('kgmax').value, pmin = +$('pmin').value, pmax = +$('pmax').value;
  $('cosecha').innerHTML =
    `<p><b>Tu hipótesis:</b> ${kmin}–${kmax} kg/árbol · ingresos brutos ${Math.round(kmin * pmin)}–${Math.round(kmax * pmax)} €/árbol (a ${pmin}–${pmax} €/kg).</p>` +
    `<p class="hint">El modelo no estima la cosecha. El cuajado depende de floración y polinización, aún no simulados.</p>`;
  $('fuentes').innerHTML = fuentes.map(f => `<li>${EMOJI[f.categoria] || ''} <b>${f.dato}</b> (${f.categoria}): ${f.detalle}</li>`).join('') +
    `<li>Riego A ${a} / B ${b} mm/día (${mm2l(a)} / ${mm2l(b)} L/árbol/día)</li>`;
};
$('simular').click();
