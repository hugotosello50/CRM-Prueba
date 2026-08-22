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

## Regla fija: mantener al asistente de IA al día

El asistente de IA (`lib/acciones.js` + `lib/asistenteIA.js` + el prompt que
arma `app/api/asistente/route.js`) no descubre funcionalidad sola: solo sabe
hacer lo que está explícitamente cargado en su catálogo de acciones. Cada vez
que se ejecuta una mejora o arreglo que agrega o modifica algo que el usuario
puede **hacer** en la app (crear, editar, eliminar, cambiar estado, mover,
vincular, etc. sobre personas, empresas, obras, hilos, tareas, acciones,
vínculos, etiquetas, notas, subtareas, o lo que sea que se sume a futuro), hay
que sumar o actualizar la acción correspondiente en ese catálogo — como un
paso más de esa misma ejecución, sin que haga falta que el usuario lo pida
aparte cada vez. Sigue el mismo patrón ya usado para las acciones existentes:
función pura en `lib/acciones.js`, forma de parámetros + resolvedor de
nombres-a-ids en `lib/asistenteIA.js`, entrada en la lista numerada de
`PROMPT_SISTEMA`, y caso en `resumenLegible`.

No aplica a:
- Cambios puramente visuales o de layout (no agregan ninguna capacidad nueva).
- Configuración/Apariencia (fuera de alcance del asistente, según lo acordado).
- Adjuntos (no se pueden cargar archivos por texto/voz).

Si sumar la acción es grande o su diseño no es obvio (por ejemplo, hace falta
decidir cómo identificar un registro que no tiene nombre propio, como una
acción del historial), se puede tratar como una etapa aparte dentro de la
misma ejecución — pero sigue siendo parte del trabajo, no algo opcional a
mencionar y dejar pendiente.

# Fundamentos de la App

## Criterio general: app navegable y consistente

Criterio de fondo que se aplica a toda la app y que hay que tener presente cada
vez que se toca una pantalla: quiero una app **navegable** y con **datos
consistentes**.

Esto es más amplio que la lista de puntos concretos de abajo: la consistencia
tiene que regir **cualquier tema, formato o comportamiento** de la app, no solo
los que ya están explícitamente documentados acá. Si una pantalla resuelve algo
de una manera (un patrón visual, un flujo de confirmación, un selector, un
texto, lo que sea), y en otra pantalla aparece la misma situación, se resuelve
**igual** — no se inventa una variante nueva. Cuando se detecta una
inconsistencia (dos lugares que resuelven lo mismo de formas distintas), el
criterio por defecto es unificarlas a un solo patrón, y preguntar cuál de las
variantes existentes tomar como base solo si no es obvio cuál conviene.

Puntos concretos ya identificados (no es una lista cerrada):

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

## Desplegables "ver/ocultar" con formato único

Toda la app usa el mismo patrón para secciones que se pliegan/despliegan
(ej: "Ver contexto" / "Ocultar contexto", "Ver resumen" / "Ocultar resumen",
"Ver vínculos" / "Ocultar vínculos", "Ver historial de interlocutores" /
"Ocultar historial de interlocutores"). Tienen que compartir **el mismo
formato, color y comportamiento** en toda la app: mismo tamaño de texto,
mismo color, misma posición del ícono de flecha (chevron) respecto al texto,
y el texto tiene que cambiar entre "Ver X" y "Ocultar X" (no dejar un título
fijo con solo el ícono cambiando). Al día de hoy hay variantes distintas
conviviendo (comparar por ejemplo "Ver contexto" en `AccionCard`/
`VerContextoOrigen` vs. "Vínculos" con chevron en `HiloDetail` vs. "Ver grupo
completo" en `EmpresaDetail`) — eso es justamente la inconsistencia a
corregir: unificarlas todas a un solo patrón visual, de acá en adelante y en
lo existente que se toque.

## Textos: nunca todo en mayúsculas

Ningún texto de la app se muestra todo en mayúsculas: ni los controles
interactivos (botones y enlaces tipo "+ Agregar", "+ Vincular", los
desplegables "Ver X/Ocultar X", "Restablecer...", "Generar...",
pestañas/filtros clicables, etc.) ni las etiquetas estáticas (título de campo
en formularios, encabezados de sección, encabezados de tabla, etc.). Todos
se escriben con la primera letra en mayúscula y el resto en minúscula — no
usar la transformación visual "todo en mayúsculas" (clase `uppercase` de
Tailwind), aunque sea el patrón visual que ya existe en gran parte de la
app.

## Eliminar siempre con confirmación

En toda la app, para eliminar un registro no alcanza con una "x" que borre
directo. El criterio fijo es: ícono de editar (lápiz) + ícono de papelera que,
al tocarlo, pide confirmación antes de eliminar (mismo patrón ya usado en
Cargos, Personas, Empresas, Obras, etc.). Aplica de acá en adelante a toda
pantalla nueva y a cualquier pantalla existente que se toque.

Además de esa doble confirmación, antes de eliminar hay que **analizar si el
registro está siendo usado por otro registro** (vínculos, relaciones, campos
que lo referencian, etc.) y, si es así, **avisarlo explícitamente** en el
mismo paso de confirmación (qué y cuántos registros lo usan) — no alcanza con
la confirmación genérica de "¿estás seguro?". Esto aplica a todo botón
"eliminar" de la app, de acá en adelante y en lo existente que se toque.

## Menciones "@Entidad" en campos de texto

Hay un mecanismo para que un texto libre (nota, título, descripción) incluya
menciones a una Persona/Empresa/Obra que se muestran como enlace clicable a
su ficha. Se implementa con dos piezas reutilizables ya armadas en
`components/CRM.jsx`:

- `CampoConMenciones`: reemplazo de un `<input>`/`<textarea>` común, agrega el
  autocompletado al escribir "@".
- `TextoConMenciones`: reemplazo de mostrar `{texto}` a secas, renderiza las
  menciones como enlaces.

Guardado como texto plano con el formato `@[Nombre](Tipo:id)`, así el campo
sigue siendo un input/textarea común y cualquier lugar que todavía no use
`TextoConMenciones` conserva el nombre legible (no rompe nada).

Hoy están enchufados en: título del hilo (tema del hilo/tarea) y las
descripciones de acciones (`notaPlanificada`/`notaHecho`), tanto al editar
como al mostrarse. **El plan es extenderlo a todo campo de texto libre de la
app** — al tocar una pantalla nueva con notas/descripciones, evaluar sumar
estos mismos dos componentes ahí en vez de inventar algo distinto.

# Contexto del negocio

La empresa del usuario es **Feyro**, dedicada a la venta de materiales
eléctricos dentro del rubro de la construcción de inmuebles. La app es un CRM
para gestionar las relaciones comerciales de ese negocio (personas, empresas,
obras, seguimientos).
