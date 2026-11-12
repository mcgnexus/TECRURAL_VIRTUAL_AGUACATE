export const metadata = { title: "TecRural - Simulación de riego del aguacate", description: "Simulación orientativa de riego en aguacate Hass. No es un gemelo digital validado." };
export const viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
        <script dangerouslySetInnerHTML={{ __html: `tailwind.config={theme:{extend:{colors:{brand:{cream:'#F9F7F1',card:'#F2EDE4',accent:'#4A7C2C',dark:'#163D24',sand:'#DFD7C7',orange:'#E37A32',gray:'#656D62'}},fontFamily:{sans:['-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','Helvetica','Arial','sans-serif']}}}}` }} />
        <style dangerouslySetInnerHTML={{ __html: `input[type=range].custom-slider{-webkit-appearance:none;appearance:none;width:100%;background:transparent}input[type=range].custom-slider::-webkit-slider-runnable-track{height:8px;border-radius:9999px;background:linear-gradient(to right,#1B4D2E 0%,#295F37 var(--p,55%),#E2D9CB var(--p,55%),#E2D9CB 100%)}input[type=range].custom-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;height:24px;width:24px;border-radius:50%;background:#3B6B40;border:3.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.25);cursor:pointer;margin-top:-8px}input[type=range].custom-slider::-moz-range-track{height:8px;border-radius:9999px;background:#E2D9CB}input[type=range].custom-slider::-moz-range-progress{height:8px;border-radius:9999px;background:#295F37}input[type=range].custom-slider::-moz-range-thumb{height:24px;width:24px;border-radius:50%;background:#3B6B40;border:3.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.25);cursor:pointer}` }} />
      </head>
      <body style={{ fontFamily: "system-ui", margin: 0 }}>{children}</body>
    </html>
  );
}
