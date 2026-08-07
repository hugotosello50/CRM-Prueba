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
Configuración). Convención: bump de versión menor (ej. 1.17.0 → 1.18.0),
reiniciando el parche a 0. No aplica a cambios que no toquen código de la app
(por ejemplo, editar este mismo archivo).
