# Modo de trabajo con el usuario

## Regla fija: no ejecutar sin permiso explícito

Cuando el usuario está describiendo pedidos, cambios o ideas — con o sin decir
la palabra "anotá" — **no se toca código, no se corrige nada, no se implementa
nada**, hasta que el usuario lo pida explícitamente con una frase como
"ejecutar", "ejecutá", "ejecutar todo" o equivalente.

Esto aplica incluso si en el medio aparece algo que parezca un bug urgente o
una corrección obvia: en vez de arreglarlo directamente, se menciona lo
encontrado y se pregunta si el usuario quiere que se corrija ahora o que se
sume a la lista de pendientes.

Mientras se está en este modo, está bien:
- Confirmar que se entendió el pedido.
- Hacer preguntas para terminar de definir el alcance.
- Investigar/leer código para entender un problema (sin escribir cambios).

No está bien:
- Editar archivos.
- Correr builds para "verificar" cambios que todavía no se pidió hacer.
- Hacer commits o push.

Cuando el usuario dice "ejecutar" (o "ejecutar todo"), recién ahí se implementa
todo lo que quedó anotado en la conversación desde el último "ejecutar".

## Regla fija: subir el número de versión al ejecutar

Cada vez que se ejecuta lo anotado (con "ejecutar" o "ejecutar todo") y se
llega a hacer commit/push de cambios de código, hay que subir el número de
versión de la app (`APP_VERSION` en `components/CRM.jsx`, se ve al pie de
Configuración), siguiendo semver por profundidad, a criterio propio sin
preguntar:
- **Patch** (último dígito, ej. 1.17.0 → 1.17.1): correcciones chicas,
  ajustes visuales, textos.
- **Minor** (dígito del medio, ej. 1.17.1 → 1.18.0, resetea el patch a 0):
  funcionalidad nueva que no rompe nada existente.
- **Major** (primer dígito, ej. 1.x.x → 2.0.0): cambios grandes de
  arquitectura. Acá **sí hay que consultar al usuario antes** de subirlo,
  nunca decidirlo solo.

No aplica a cambios que no toquen código de la app (por ejemplo, editar este
mismo archivo).

# Contexto del negocio

La empresa del usuario es **Feyro**, dedicada a la venta de materiales
eléctricos dentro del rubro de la construcción de inmuebles. La app es un CRM
para gestionar las relaciones comerciales de ese negocio (personas, empresas,
obras, seguimientos).
