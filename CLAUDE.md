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

# Criterios de diseño de la App

## Criterio general: app navegable y consistente

Criterio de fondo que se aplica a toda la app y que hay que tener presente cada
vez que se toca una pantalla: quiero una app **navegable** y con **datos
consistentes**. En concreto:

- Repasar el código buscando **inconsistencias** y **eliminar cosas que hayan
  quedado en desuso** (código muerto, pantallas/campos/tablas huérfanas).
- En los ABM se usan **los mismos formularios** (reutilizar, no duplicar
  variantes casi iguales).
- **Borrado con pre-confirmación** siempre (ver sección de abajo).
- **Lápiz de edición** en los registros.
- **Buscador** arriba.
- **Botón con el signo "+"** arriba que además muestre, **dentro del botón**, el
  **número indicador de la cantidad de registros**.

Cuando se pida un repaso con este criterio: primero **investigar y hacer un
resumen de lo que se va a hacer, y esperar** — no ejecutar hasta el "ejecutar"
explícito (igual que la regla general de trabajo).

## Eliminar siempre con confirmación

En toda la app, para eliminar un registro no alcanza con una "x" que borre
directo. El criterio fijo es: ícono de editar (lápiz) + ícono de papelera que,
al tocarlo, pide confirmación antes de eliminar (mismo patrón ya usado en
Cargos, Personas, Empresas, Obras, etc.). Aplica de acá en adelante a toda
pantalla nueva y a cualquier pantalla existente que se toque.

# Contexto del negocio

La empresa del usuario es **Feyro**, dedicada a la venta de materiales
eléctricos dentro del rubro de la construcción de inmuebles. La app es un CRM
para gestionar las relaciones comerciales de ese negocio (personas, empresas,
obras, seguimientos).
