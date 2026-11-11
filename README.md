# TecRural · Mi aguacate virtual (MVP)

PWA + FastAPI + Neon. Árbol 3D como puerta visual; modelos separados detrás.
Motor único de cálculo: la API (`POST /simular`). El frontend la llama y
solo usa su espejo local marcado como demo si la API es inalcanzable.

## Interfaz: Next.js + React (`web/`), Three.js directo
`npm run dev/build/start` en `web/` (puerto 3000). Sin react-three-fiber:
el componente `Viewer` importa `three` de forma dinámica y solo cuando la
sección entra en pantalla; con vista 2D alternativa y etiqueta ilustrativa.
La interfaz antigua (`frontend/`, HTML estático) queda como legado.
`NEXT_PUBLIC_API_URL` apunta a la API; `DATABASE_URL` (Neon) es opcional.
Fuente inicial: botón "Cargar meteo Almuñécar (14 días)" → `GET /meteo`
(Open-Meteo con ubicación y fecha; AEMET si hay key); series diarias reales
entran al balance con origen 🌐 externo. Sin red, valores manuales.

## Motor Python/FastAPI (`backend/`, v0.4.0)
`POST /simular` devuelve `estado`, `fuentes`, más `modelo: {version,
parametros}` y `entradas` (eco). `POST /simulaciones` ejecuta y guarda el
registro reproducible (versión + entradas + resultados + fecha);
`GET /simulaciones/{id}` lo recupera. Sin `DATABASE_URL` guarda en sqlite
local (`backend/simulaciones.db`); con `DATABASE_URL` y driver, en Neon
(ver `db/schema.sql: registro_simulacion`). TypeScript queda descartado
por ahora: se evaluaría con pruebas de equivalencia antes de cambiar.

## Riego: goteros ↔ mm ↔ L/árbol
`goteros_a_mm_dia`: L/árbol/día = nº × caudal × horas; mm = L / m².
Con 5×5 m, 4 goteros × 4 L/h × 2 h = 32 L = 1.28 mm/día.
La **fracción mojada** se registra pero NO modifica el balance (el bulbo
húmedo 3D no se simula). La **eficiencia** solo cubre pérdidas de
aplicación (uniformidad, fugas, evaporación directa); la percolación por
exceso se calcula aparte como **drenaje** y no diagnostica asfixia.

## Visor 3D (Three.js directo)
Sin dependencias de React: Three.js se importa de forma dinámica y solo
cuando la sección entra en pantalla (o al pulsar "Cargar vista 3D").
Sin 3D la app funciona igual; hay vista 2D alternativa.
- `frontend/arbol_hass.glb` (opcional): exportar de Blender en GLB/gltf con
  derechos de uso claros. Si existe, se carga; si no, procedural provisional.
- Calidad adaptable: si el móvil no mantiene ~28 fps, baja a pixelRatio 1
  y 200 hojas; pausa cuando la pestaña se oculta o el visor sale de pantalla.
- Etiqueta en pantalla: representación ilustrativa, no reproduce el árbol
  real; el visor recibe el estado del modelo, no calcula.

## Guardar por email (modo local, sin envío)
`POST /guardar {email, escenario, consent_comercial}` valida el correo
(límite 5/h), guarda el registro versionado y crea `/recuperar/{token}`
válido 30 días. `email_provider.py` en modo `local`: muestra el enlace en
pantalla, no envía nada. Sin proveedor no se promete envío. Casilla
comercial desmarcada; texto y base jurídica pendientes de revisión.
`GET /recuperar/{token}` devuelve el escenario. Web: sección "Guardar mi
árbol" tras comparar, "Seguir probando sin guardar", borrador 7 días en
el dispositivo (se declara que no se conserva al cerrar), página
`/recuperar/[token]`. Eventos mínimos sin PII (`POST /eventos`,
allowlist: visita, visor_cargado/fallo, primera_simulacion, comparacion,
guardado_iniciado/solicitado, recuperacion_abierta,
interes_microestaciones, seguir_sin_guardar).

## Fase 3: árbol personalizado y observaciones
Suelo avanzado (textura → capacidad, profundidad de raíces, Kc) en
"Parámetros avanzados". `POST /observaciones` (riego/lluvia/humedad/fase/
síntoma; los futuros sensores de suelo usan `humedad_suelo_mm`),
`GET /observaciones`, `POST /contraste` (planificado vs realizado vs
medido, con interpretación), `GET /microestaciones` (lee `TECRURAL_API_URL`;
501 si no configurado, sin fingir datos).

## Fiabilidad sin engañar
Origen por dato: 🟢 medido (sensor identificado) · 🔵 introducido (agricultor)
· 🟡 estimado (supuesto) · 🌐 externo (proveedor + ubicación + fecha).
Resultado: **reserva hídrica en demostración**, con motivos concretos
(humedad inicial y capacidad estimadas, meteo de demostración, método
pendiente de revisión, sin contraste en parcela). Sin porcentajes de
confianza. El espejo local del navegador se declara NO equivalente a la API.

## Cosecha: el modelo NO estima kilos
La app recoge la **hipótesis del agricultor** (kg + precio → ingresos
brutos) y la etiqueta como suya. Ejemplo: 2000–3000 kg × 1,20–1,80 €/kg
= 2400–5400 € brutos.

## Estructura
- `web/`: Next.js + React (puerto 3000) — formulario, comparador, Viewer 3D directo, Guardar, `/recuperar/[token]`
- `backend/app.py`: API `/salud`, `/meteo`, `/simular`, `/simulaciones`, `/guardar`, `/recuperar/{token}`, `/eventos`, `/observaciones`, `/contraste`, `/microestaciones`, `/fases`, `/diagnostico`, `/parcela/simular`
- `backend/modelos/fenologia.py`: fases configurables, grados-día, alertas orientativas
- `backend/modelos/balance_hidrico.py`: reserva diaria, agotamiento, drenaje, estados
- `backend/modelos/rendimiento.py`: el modelo NO estima kilos (solo hipótesis del agricultor)
- `backend/modelos/meteo_adapter.py`: AEMET + Open-Meteo con proveedor, ubicación y fecha
- `backend/store.py`: guardado reproducible (Neon con DATABASE_URL, sqlite local si no)
- `db/schema.sql`: Neon (parcela, escenario, simulacion, observacion, registro_simulacion)
- `frontend/`: legado HTML estático

## Ejecutar
```powershell
cd backend; uvicorn app:app --port 8000
cd web; npm install; npm run build; npm run start  # http://127.0.0.1:3000
# Neon: psql $DATABASE_URL -f db/schema.sql
```

## Demo Almuñécar
Goteros 4×4 L/h×2 h en 5×5 m = 32 L = 1.28 mm/día. Escenario B -25% → caídas de reserva, días de estrés, árbol ilustrativo y drenaje si hay exceso. Sin predicción de kilos.
