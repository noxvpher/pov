"""Verificación de la firma de un webhook de POV.

Está en su propio módulo para poder reusarlo y —sobre todo— **para poder probarlo**:
`examples/examples.test.ts` firma un payload con el mismo código que usa POV y lo verifica con esta
función.

La cabecera viene como ``t=1787012345,v1=3f8a…`` y **puede traer más de un ``v1=``**: durante una
rotación de secreto POV firma con el viejo y el nuevo, para que actualices tu copia cuando te quede
cómodo sin perder eventos.
"""

import hashlib
import hmac
import time


def verificar_firma(raw: bytes, header: str, secreto: str, tolerancia: int = 300) -> bool:
    """`raw` es el cuerpo CRUDO. Reserializar el JSON rompe la firma."""
    if not secreto:
        return False

    campos = [p.split("=", 1) for p in (header or "").split(",")]
    t = next((v for k, v in campos if k == "t"), None)
    # Un dict se quedaría con UN solo v1 y rechazarías eventos válidos justo el día que rotás.
    firmas = [v for k, v in campos if k == "v1"]
    if not t or not firmas:
        return False

    # Ventana temporal: descarta reenvíos viejos.
    if abs(time.time() - int(t)) > tolerancia:
        return False

    esperada = hmac.new(secreto.encode(), f"{t}.".encode() + raw, hashlib.sha256).hexdigest()
    # Comparación en tiempo constante: nunca `==`.
    return any(hmac.compare_digest(esperada, f) for f in firmas)
