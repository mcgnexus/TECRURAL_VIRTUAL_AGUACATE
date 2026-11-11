// Puente mismo-origen hacia FastAPI. El navegador nunca habla con Python
// directamente: el backend es privado y solo esta ruta lo alcanza mediante
// BACKEND_URL (binding de Vercel) o la API local en desarrollo.
const TARGET = process.env.BACKEND_URL || "http://127.0.0.1:8000";

async function pasar(req, path) {
  const url = `${TARGET}/${path}${req.nextUrl.search}`;
  const init = { method: req.method, headers: { "Content-Type": "application/json" } };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();
  let r;
  try {
    r = await fetch(url, init);
  } catch {
    return Response.json({ detail: "motor no disponible" }, { status: 503 });
  }
  const texto = await r.text();
  return new Response(texto, { status: r.status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req, { params }) {
  return pasar(req, (await params).path.join("/"));
}
export async function POST(req, { params }) {
  return pasar(req, (await params).path.join("/"));
}
