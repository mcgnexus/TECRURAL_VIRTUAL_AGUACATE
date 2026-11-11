"""Envio de correo: modo local (sin envio, el enlace se muestra en pantalla).
Para produccion, conectar aqui un proveedor transaccional y cambiar
EMAIL_MODE a "proveedor". Sin proveedor configurado jamas se promete envio."""
import os

MODO = os.environ.get("EMAIL_MODE", "local")


def enviar_enlace(email: str, enlace: str) -> dict:
    if MODO == "local":
        print(f"[email-local] para {email}: {enlace}")
        return {"enviado": False, "modo": "local",
                "nota": "Enlace de prueba: en produccion llegara por correo."}
    raise NotImplementedError("Proveedor de correo no configurado (EMAIL_MODE).")
