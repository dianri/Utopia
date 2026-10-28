# Las Meriendas: Monster Hunt 👹⚔️

> **Utopia** — Juego web táctico y cooperativo de geolocalización en tiempo real desarrollado como Progressive Web App (PWA).

---

## 🎮 Descripción General

En **Las Meriendas: Monster Hunt**, una escuadra de cazadores debe coordinarse en un mapa táctico del mundo real para explorar estructuras, adoptar compañeros de apoyo, gestionar mochilas de armamento, enfrentarse en combates por turnos/tiempo real contra el temible **Monstruo de Las Meriendas** y desbloquear cooperativamente las fases de seguridad del cofre del tesoro para asegurar la victoria.

---

## ⚡ Novedades y Mecánicas Principales

### ⚔️ 1. Combate Táctico en Modo Arena (RPG / Cartas)
- **Eliminación del Auto-Combate Pasivo:** Se ha suprimido el ataque automático en el mapa por simple proximidad. El mapa táctico se reserva para exploración, rescate, suministros y posicionamiento.
- **Arena de Combate Interactiva (`CombatArena.tsx`):** Al aproximarse a menos de 20 metros del monstruo, el jugador entra en una interfaz de combate inmersiva estilo RPG de cartas:
  - Barra de vida global y compartida del monstruo sincronizada por Supabase Realtime.
  - Ataque manual con cadencia estricta (`cadenceMs`), consumo de munición/usos y feedback háptico.
  - Asistencia en combate de las mascotas activas que infligen daño continuo.
  - Ciclo de contraataques periódicos del monstruo (cada 2.5s) con sacudida de pantalla e impacto.
  - **Opción de Huida Táctica:** Botón "HUIR" que otorga un sprint de emergencia (+30% de velocidad durante 5s) e inmunidad temporal de combate.

---

### 🎒 2. Sistema Integral de Mochila, Jerarquía y Desgaste de Armamento
- **Mochila Táctica (`BackpackModal.tsx`):** Capacidad limitada a **4 slots** de inventario con visor de estadísticas, nivel de daño, cadencia y munición.
- **Jerarquía de Armas (7 Tiers):**
  1. **Tier 7 — Lanzacohetes RPG:** Daño masivo de área (120 DMG, 2 cohetes).
  2. **Tier 6 — Granadas Tácticas:** Daño explosivo alto (85 DMG, 4 granadas).
  3. **Tier 5 — Fusil Táctico M4:** Ráfagas automáticas de alta cadencia (28 DMG, 45 balas).
  4. **Tier 4 — Escopeta de Postas:** Dispersión letal a corta distancia (55 DMG, 12 cartuchos).
  5. **Tier 3 — Pistola 9mm:** Arma de fuego equilibrada (22 DMG, 30 balas).
  6. **Tier 2 — Hacha Táctica:** Arma cuerpo a cuerpo avanzada con **15 usos de durabilidad** (55 DMG).
  7. **Tier 1 — Cuchillo de Supervivencia:** Arma básica cuerpo a cuerpo (22 DMG).
  8. **Tier 0 — Puños (Recurso Final):** Ataque cuerpo a cuerpo desarmado ilimitado (5 DMG, cadencia 350ms). No ocupa espacio en la mochila y se auto-equipa si no queda ningún arma usable.
- **Mochila Ilimitada:** Capacidad infinita sin restricción de slots y con scroll táctico fluido en el modal de mochila, permitiendo acumular todo el arsenal y suministros recogidos sin descarte forzado.
- **Desgaste Dinámico y Auto-Fallback:** Al agotarse la munición o romperse un arma de durabilidad, el sistema equipa automáticamente la siguiente mejor arma disponible en la mochila hasta recurrir a Puños (Tier 0). Al recoger cualquier nueva arma, se auto-equipa al instante si se portaban los puños.
- **Descarte Total en el Suelo (`DroppedItem`):** Los jugadores pueden soltar cualquier arma en el terreno (incluido el cuchillo táctico). Los objetos caen al terreno como marcadores interactivos en MapLibre GL con colores por Tier y son recolectables a menos de 20m.
- **Curación Instantánea:** Los botiquines de primeros auxilios y raciones se consumen inmediatamente al abrir cajas de suministros, curando la salud sin ocupar espacio en la mochila.

---

### 🐾 3. Sistema de Mascotas de Apoyo (Pets)
- **Adopción Ilimitada:** Spawneo procedural de mascotas silvestres en el mapa con marcadores animados. Se adoptan automáticamente al aproximarse a menos de 12 metros, sumándose al séquito del cazador.
- **Órbita en Mapa con Anclaje Geoespacial Estricto:** Las mascotas acompañan al jugador con renderizado nativo proyectado a 2.5m en MapLibre GL, perfectamente fijas al terreno sin deslizamientos ni retardo durante paneos o zoom de la cámara.
- **Perfiles y Habilidades Pasivas:**
  - 🐕 **Perro Guardián (`dog`):** 60 HP, 6 DMG. Rastreo y recogida de suministros ampliada a 25m.
  - 🛸 **Dron Táctico (`drone`):** 45 HP, 10 DMG. Fuego a distancia y +15m de radio de visión en la niebla de guerra.
  - ⚡ **Roedor Eléctrico (`electric_mouse`):** 50 HP, 8 DMG. Descargas rápidas de alta cadencia.
  - 🐇 **Conejo Veloz (`rabbit`):** 40 HP, 4 DMG. Velocidad de reacción y recolección rápida.
  - 🐈 **Gato Callejero (`cat`):** 45 HP, 7 DMG. Sigilo felino que otorga al dueño +10% de evasión frente a los ataques del monstruo.
  - 🤖 **Mini Robot Médico (`med_bot`):** 50 HP, 3 DMG. Nanobots de soporte que regeneran pasivamente +2 HP cada 5s fuera de combate.
- **Recogida Pasiva de Suministros (Fetch Loot):** Las mascotas escanean y recolectan suministros automáticamente dentro de su radio de acción. Si el jugador necesita vida, la curación se transfiere a él; si está al 100%, cura a la mascota con menor salud. Las armas van directamente a la mochila.
- **Estado Desmayada y Reanimación:** Si la vida de una mascota llega a 0, queda incapacitada (`isWounded: true`) y entra en modo flotación con animación de mareo (`💫`) hasta ser revivida al 100% en el Hospital de Campaña.

---

### 🏥 4. Estructuras Tácticas en el Mapa
- **Hospital de Campaña (`🏥`):**
  - Radio de interacción de 18 metros.
  - Curación médica continua (+10 HP/segundo) para jugadores en su interior.
  - Revive y restaura automáticamente al 100% de salud a todas las mascotas desmayadas de la comitiva.
  - Centro de estabilización clínica para jugadores en estado crítico.
- **Casas / Refugios Tácticos (`🏠`):**
  - De 3 a 5 búnkeres distribuidos en el área operativa con radio de 14 metros.
  - **Mecánica de Cobertura Total:** Al entrar, el avatar se oculta visualmente del mapa exterior (`style.display = 'none'`), los aliados lo visualizan con etiqueta `[A CUBIERTO]`, y el monstruo pierde inmediatamente el aggro.
- **Capa Táctica Visual:** Representación poligonal GeoJSON de las zonas de influencia estructural (`structures-zones`) y banner contextual de estado interior (`IndoorStatusBanner.tsx`).

---

### 🩸 5. Rediseño del Ciclo de Vida: Estado "Herido de Muerte"
- **Sustitución de la Muerte Instantánea:** Al recibir daño letal, el HP se ancla en 1 y el jugador pasa al estado `critically_wounded`.
- **Restricciones de Combate:** Armas bloqueadas, habilidades deshabilitadas e imposibilidad de saquear cajas. La única acción disponible es replegarse hacia el Hospital de Campaña.
- **HUD Crítico y Brújula Médica:** Viñeta roja pulsante en pantalla y compás direccional interactivo (`CriticallyWoundedOverlay.tsx`) que señala con precisión de rumbo y distancia hacia el Hospital más cercano.
- **Recuperación y Supervivencia Colectiva:** Al alcanzar >= 20 HP dentro del Hospital, el combatiente se estabiliza y reanuda el combate activo. La partida solo se pierde si **todos** los miembros de la escuadra caen heridos de muerte simultáneamente.

---

### 🗝️ 6. Apertura Cooperativa del Cofre por Fases
- Sustituida la cuenta regresiva estática por un sistema cooperativo de **3 fases con 2 cerrojos cada una** (6 desafíos en total):
  1. **Fase 1 (Sincronización QTE):** Puntería temporal sobre zonas verdes oscilantes.
  2. **Fase 2 (Código Lumínico):** Secuencia de memoria táctica tipo Simón Dice de 3 a 4 colores.
  3. **Fase 3 (Frecuencia Magnética):** Dial rotatorio sintonizador con respuesta háptica.
- **Furia Defensiva del Monstruo:** Cuando cualquier agente inicia el desbloqueo del cofre, el monstruo entra en modo `defend_chest` y realiza un sprint a 3.8 m/s directamente hacia las coordenadas del cofre.
- **Aislamiento por Partida:** Estado de desbloqueo estricto por ID único de sala (`game.id`), evitando que nuevas partidas hereden progreso residual.

---

### 📱 7. Optimización Mobile-First y HUD Táctico
- **Soporte para Safe Area:** Separación inferior del panel de armas (`bottom-6` / `bottom-8` y `pb-[env(safe-area-inset-bottom)]`) evitando colisiones con la barra de navegación del sistema operativo móvil.
- **Contenedor Flex Vertical de Alertas:** Notificaciones de respawn y alertas de cofre apiladas en columna (`top-20 flex-col gap-2`) sin solapamiento entre tarjetas.
- **Autocierre de Mensajes de Bitácora:** Desvanecimiento temporal del log de combate (`CombatLog.tsx`) tras 5 segundos de inactividad para mantener despejada la vista de mapa.
- **Renderizado Seguro de Marcadores en MapLibre:** Guardia estricta de ciclo de vida del mapa WebGL y revelación diferida mediante doble `requestAnimationFrame` que elimina cualquier parpadeo de marcadores en la coordenada `(0, 0)`.

---

## 🕹️ Modos de Movimiento y Conectividad

- **Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Indicador de distancia si te encuentras fuera del área sin teletransporte forzado.
  - **Tap-to-Move:** Navegación táctil con velocidad humana de 1.4 m/s (~5 km/h) y reajuste perimetral automático si pulsas fuera del radio de juego.
- **Lobby y Explorador de Operaciones en Vivo:**
  - Creación de partidas **Públicas** (visibles en el radar del lobby) o **Privadas** (acceso mediante código de 6 letras o enlace `/?room=CODIGO`).
  - Incorporación a partidas ya iniciadas (**Late Join / Reconnect**) con spawn seguro y sincronización inmediata vía Supabase Realtime.
- **Protocolo de Cancelación y Abandono:**
  - Cancelación global por el anfitrión con confirmación y redirección ordenada de la escuadra.
  - Abandono seguro individual sin romper la sesión de los demás compañeros.

---

## 🎖️ Clases de Combate

| Clase | Rol Táctico | Habilidad Especial / Ventaja |
| :--- | :--- | :--- |
| ✚ **Médico** | Soporte y Sanación | Reanimación rápida y radio de curación táctica ampliado a 35m. |
| 🛡️ **Tanque** | Primera Línea | +50% de vida base (150 HP) y atracción prioritaria del aggro del monstruo. |
| 👁️ **Explorador** | Reconocimiento | Radio de visión de 105m y habilidad activa **Radar Táctico** (revela al monstruo a toda la escuadra). |
| 🎯 **Tirador** | Daño a Distancia | +35% de daño con armas de fuego y mayor alcance efectivo de disparo. |

---

## 🛠️ Stack Tecnológico

- **Frontend:** React 18+, Vite, TypeScript estricto.
- **Estilos & HUD:** Tailwind CSS (diseño táctico oscuro mobile-first), Lucide React, Canvas Confetti.
- **Motor de Mapas:** `maplibre-gl` con azulejos vectoriales libres de OpenFreeMap (aceleración WebGL a 60 FPS).
- **Audio y Hápticos:** Web Audio API procedural (síntesis de sonido sin archivos de audio pesados) + Navigator Vibration API.
- **PWA:** `vite-plugin-pwa` con Service Worker agresivo, precache de assets y soporte offline.
- **Backend & Realtime:** Supabase.
  - Autenticación Anónima (`signInAnonymously()`).
  - Base de datos PostgreSQL con RLS estricto y triggers automáticos.
  - Supabase Realtime (Canales combinados con `broadcast` para movimiento sin saturar la BD y `presence` para sincronización de escuadra).

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el repositorio
```bash
git clone https://github.com/dianri/Utopia.git
cd Utopia
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla `.env.example` a `.env` y añade tus claves de Supabase:
```bash
cp .env.example .env
```
Configura:
```env
VITE_SUPABASE_URL=https://iadiswktxduqetzjujli.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_aqui
```

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

### 5. Compilación para producción (Quality Gate)
```bash
npm run build
```
Genera la carpeta `dist/` optimizada con división de módulos (`vendor`, `maplibre`, `supabase`) y Service Worker PWA activo.

### 6. Despliegue en Vercel
El repositorio incluye [`vercel.json`](./vercel.json) con la regla de reescritura para Single Page Applications (SPA).
1. Conecta el repositorio en Vercel.
2. En **Settings > Environment Variables**, añade:
   - `VITE_SUPABASE_URL` = `https://iadiswktxduqetzjujli.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = tu clave pública/anónima de Supabase
3. La aplicación cuenta con blindaje contra fallos de inicialización:
   - Si no se configuran las variables en Vercel, muestra un banner descriptivo y activa el modo de demostración local sin pantalla negra.
   - Cuenta con un `<ErrorBoundary>` táctico que captura cualquier excepción de WebGL, audio o geolocalización.

---

## 🌿 Flujo de Desarrollo Multi-Agente

Cumpliendo las directrices de [`AGENTS.md`](./AGENTS.md):
- Todas las características se desarrollan en ramas aisladas (`feature/agent-<id>-<tarea>`).
- El comando `npm run build` debe finalizar con **0 errores y 0 advertencias** antes de cualquier commit o merge.
- **Revisión y actualización obligatoria de `README.md` y `AGENTS.md` con cada nueva feature o cambio arquitectónico.**
- Sincronización continua de `CHANGELOG.md` bajo la sección `[Unreleased]`.
