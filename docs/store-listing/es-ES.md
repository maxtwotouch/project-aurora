# App Store listing — es-ES (Español)

> **Draft translation notice:** this locale's copy was drafted by an AI agent using the app's own `src/i18n/locales/es.json` catalog for terminology, not by a professional translator. Per `docs/roadmap-2026-27.md` Phase 1 ("Native-speaker review of consent copy + store copy (de/fr/es/zh) — legal and quality gate before paid traffic"), **do not submit this locale to App Store Connect without a native-speaker review first.**

## App name
**Aurora Tromsø**

Character count: 13 / 30.

Localized form of the proposed en-US name "Aurora Tromsø" (see that file's app-name note for the branding-mismatch open item, which applies identically here).

## Subtitle
**28 lugares, previsión en vivo**

Character count: 29 / 30.

## Promotional text
Puntuación de aurora en vivo, la mejor franja de esta noche y 28 lugares con nombre en Tromsø con datos de acceso. Cinco idiomas. Sin cuentas, sin rastreo.

Character count: 155 / 170. (Promotional text can be updated any time without a new binary submission — App Store Connect > App Store tab > this field is not versioned with the build.)

## Keywords
`auroras boreales,noruega,ártico,índice kp,noche polar,cámara en vivo,miradores,esta noche,previsión`

Character count: 99 / 100. Comma-separated, no spaces after commas (spaces cost characters and Apple's keyword matching does not need them).

**Reasoning per term** (why each word/phrase is here, and why words already in the app name/subtitle are deliberately *not* repeated — Apple indexes name + subtitle + keywords together for search, so duplicating a word already present elsewhere wastes budget that could cover new ground):

- El nombre y el subtítulo ya cubren "aurora", "tromsø", "lugares" y "en vivo" — no repetidos aquí.
- "auroras boreales" — la frase de búsqueda dominante en español, distinta de la sola palabra "aurora" del nombre.
- "noruega", "ártico" — desambiguación geográfica para búsquedas genéricas sin ciudad concreta.
- "índice kp" — término técnico real usado por la app (`tonight.band.kpNow`), buscado por quienes persiguen auroras.
- "noche polar" — refleja con honestidad la gestión de estacionalidad de la app (estado "temporada cerrada").
- "cámara en vivo" — función real (cámaras del cielo en vivo), intención de búsqueda distinta de "previsión".
- "miradores" — término natural en español para los puntos de observación, sin duplicar "lugares" del subtítulo.
- "esta noche" — modificador temporal muy buscado, coherente con la propia app ("Esta noche" en `common.tonightEyebrow`).

## Description
Character count: 3408 (~2500 targeted per the task brief; Apple's actual field limit is ~4000, so this has headroom). Benefit-led, no superlatives ("best", "amazing", etc. deliberately avoided per Apple's Guideline 2.3.1 and this app's own factual/warm tone — see `src/i18n/locales/es.json` for the in-app voice this matches).

```
Tromsø, en Noruega, está dentro del óvalo auroral — uno de los lugares más fiables del mundo para ver la aurora boreal, aproximadamente entre septiembre y abril. Aurora Tromsø le ayuda a decidir dónde y cuándo salir esta noche, con datos meteorológicos y geomagnéticos en vivo en lugar de conjeturas.

LA PREVISIÓN DE ESTA NOCHE, DE UN VISTAZO
Abra la aplicación y vea una puntuación de aurora sobre 100 para esta noche, calculada a partir de la nubosidad, la oscuridad y el índice KP planetario (actividad geomagnética). La aplicación destaca la mejor franja de tres horas para salir y se actualiza automáticamente a lo largo de la noche.

28 LUGARES CON NOMBRE ALREDEDOR DE TROMSØ
Compare 28 lugares fijos —fiordos, lagos y miradores oscuros fuera de la contaminación lumínica de la ciudad— cada uno con su propia puntuación en vivo, su distancia al centro de la ciudad y una breve descripción. Muchos lugares incluyen datos prácticos para llegar, como la parada de autobús y el aparcamiento más cercanos; cuando aparecen marcados como «verificado», estos datos se han contrastado con información de la Tromsø kommune. Ordene la lista por previsión más fuerte o por trayecto más corto, y abra la navegación con un toque.

MAPA, CÁMARAS DEL CIELO EN VIVO E IMÁGENES DE AURORA
Vea todos los lugares en un mapa en orden de trayecto, compruebe una cuadrícula de cámaras del cielo en vivo antes de salir de casa, y consulte imágenes recientes de aurora de un feed universitario (UiT / NO-SPACE) para juzgar las condiciones actuales por sí mismo.

HONESTOS TAMBIÉN SOBRE LA LUZ DEL DÍA
Tromsø está al norte del Círculo Polar Ártico: aproximadamente entre mediados de mayo y finales de julio, el sol de medianoche mantiene el cielo claro toda la noche —no hay ninguna posibilidad realista de ver la aurora en ese periodo, sea cual sea el índice KP. En lugar de mostrar una puntuación engañosa durante esas fechas, la aplicación indica con claridad que la temporada de auroras está cerrada por ahora y ofrece la fecha aproximada en que vuelve a abrir.

CINCO IDIOMAS
La aplicación está disponible por completo en inglés, alemán, francés, español y chino (simplificado), y puede cambiarse en cualquier momento desde Ajustes —útil si está de viaje y quiere la interfaz en su propio idioma, o si le presta el teléfono a alguien.

PRIVACIDAD POR DEFECTO
La aplicación funciona por completo sin cuenta, inicio de sesión ni configuración, y nunca solicita su ubicación GPS —cada «distancia» mostrada se calcula a partir de las coordenadas fijas de un lugar, no a partir de su rastreo. Si lo desea, puede optar por compartir estadísticas anónimas y agregadas (qué lugares se consultan o hacia cuáles se navega, agrupadas por hora) para que nosotros y la Tromsø kommune sepamos qué lugares resultan realmente útiles. Rechazarlo no cambia nada en el funcionamiento de la aplicación, y puede activar o desactivar este uso compartido en cualquier momento desde Ajustes. Esta aplicación no contiene rastreadores ni SDK publicitarios de terceros.

FUENTES DE DATOS
Datos meteorológicos de MET Norway (el instituto meteorológico noruego) y actividad geomagnética del Space Weather Prediction Center de la NOAA, actualizados con regularidad a lo largo de la noche.

Aurora Tromsø tiene un solo lugar y un solo propósito: una respuesta honesta y directa a la pregunta «¿merece la pena salir a mirar esta noche?» —ni más, ni menos.
```

## What's New template
Use for every release's App Store Connect "What's New in This Version" field. Fill in the
bracketed part per release; keep the rest as a stable, low-effort template so release notes
don't become a chore that gets skipped.

```
Esta actualización renueva la previsión de esta noche y los detalles de los lugares. Fuentes de datos: Ajustes > Acerca de. Preguntas o correcciones de lugares: use el enlace de soporte de esta página.
```
