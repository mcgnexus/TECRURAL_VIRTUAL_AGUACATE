export const metadata = { title: "TecRural · Mi aguacate virtual", description: "Simulación orientativa de riego en aguacate Hass. No es un gemelo digital validado." };
export const viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({ children }) {
  return (<html lang="es"><body style={{fontFamily:"system-ui",margin:0,background:"#f3f6f0"}}>{children}</body></html>);
}
