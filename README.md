# Las Meriendas: Monster Hunt 👹⚔️

> **Utopia** — Juego web cooperativo y táctico de geolocalización en tiempo real desarrollado como Progressive Web App (PWA).

---

## 🎮 Descripción y Mecánicas

En **Las Meriendas: Monster Hunt**, una escuadra de hasta 4 cazadores debe coordinarse en un mapa táctico del mundo real para saquear airdrops de armas, defenderse del temible Monstruo de Las Meriendas y asegurar el cofre del tesoro para lograr la victoria.

### Características Principales

- **Modos de Movimiento Dual:**
  - **GPS Real:** Geolocalización de alta precisión en vivo (`navigator.geolocation.watchPosition`). Si el jugador se encuentra fuera del perímetro del juego, un aviso táctico en el HUD muestra la distancia exacta a la que se encuentra del área de operaciones sin teletransportar al jugador.
  - **Tap-to-Move:** Pulsa en cualquier punto del mapa para moverte con paso humano simulado a 1.4 m/s (~5 km/h). La navegación respeta los límites del círculo de juego reajustando el rumbo al perímetro interior si se pulsa fuera.
- **Sistema de Spawn y Posicionamiento Dinámico:**
  - Los jugadores (tanto anfitrión como aliados que se unen) aparecen distribuidos de forma segura y uniforme en una corona circular interior (entre el 20% y el 70% del radio de juego respecto al centro), evitando teletransportes a coordenadas fijas o aparecer encima del tesoro.
  - Sincronización completa de coordenadas de cámara (`center_lat`, `center_lng`) y tesoro entre todos los clientes conectados a través de Supabase.
- **Clases de Combate:**
  - **Médico:** Reanimación de aliados caídos en 10s (en lugar de 20s) y radio de curación ampliado a 35m.
  - **Tanque:** +50% de vida base (150 HP) y atracción de agro prioritario del monstruo.
  - **Explorador:** Radio de visión de 105m y habilidad activa **Radar Táctico** (cooldown 60s, revela al monstruo durante 10s a todos los aliados).
  - **Tirador:** +35% de daño a distancia y mayor alcance de tiro efectivo.
- **Motor de Mapas Vectoriales:** MapLibre GL con estilos vectoriales libres de OpenFreeMap (modo oscuro acelerado por WebGL a 60 FPS).
- **IA del Monstruo (Host-driven):**
  - **Patrulla:** Vigilancia circular en torno al cofre.
  - **Persecución:** Detección de radio de agresión y ataque continuo cuerpo a cuerpo.
  - **Fase 2 (Enfurecimiento):** Al bajar del 30% de HP, velocidad +40%, rugido ensordecedor y ralentización de jugadores cercanos.
  - **Muerte Temporal:** Desaparición con cuenta atrás visible de 60s y resurrección en el cofre.
- **Audio y Hápticos Procedurales:** Sintetizador con Web Audio API (disparos, latidos cardíacos, rugidos, alarmas y fanfarria triunfal sin archivos externos pesados) y Navigator Vibration API para alerta por proximidad.
- **Modo Sigilo / Discreto:** Alterna el audio para confiar únicamente en pulsos táctiles y HUD visual.
- **Modo Fantasma y Resurrección:** Al caer a 0 HP, conviértete en tumba y envía pings tácticos de alerta a tus aliados mientras te reaniman.
- **Condición de Victoria:** Asegura el cofre permaneciendo en un radio de 20m durante 30 segundos continuos mientras el monstruo entra en furia hacia el cofre.
- **Ranking Histórico Persistente:** Tabla de clasificación conectada a PostgreSQL en Supabase con desglose de estadísticas (daño, revividos, cajas y bajas).

---

## 🛠️ Stack Tecnológico

- **Frontend:** React 18+, Vite, TypeScript estricto.
- **Estilos & HUD:** Tailwind CSS (diseño táctico oscuro mobile-first), Lucide React, Canvas Confetti.
- **Motor de Mapas:** `maplibre-gl` con azulejos libres de OpenFreeMap.
- **Sonido y Hápticos:** Web Audio API procedural + Navigator Vibration API.
- **PWA:** `vite-plugin-pwa` con Service Worker agresivo, precache de assets y soporte offline.
- **Backend & Realtime:** Supabase.
  - Autenticación Anónima (`signInAnonymously()`).
  - Base de datos relacional PostgreSQL con RLS estricto y triggers automáticos.
  - Supabase Realtime (Canales combinados con `broadcast` para movimiento sin saturar la BD y `presence` para estados de conexión).

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
Para desplegar en Vercel:
1. Conecta el repositorio en Vercel.
2. En **Settings > Environment Variables**, añade:
   - `VITE_SUPABASE_URL` = `https://iadiswktxduqetzjujli.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = tu clave pública/anónima de Supabase
3. La aplicación cuenta con blindaje contra fallos de inicialización:
   - Si no se configuran las variables en Vercel, la aplicación no crashea en pantalla negra; muestra un banner descriptivo y activa el modo de demostración local.
   - Cuenta con un `<ErrorBoundary>` táctico que captura cualquier excepción de WebGL, audio o geolocalización mostrando el diagnóstico en pantalla.

---

## 🌿 Flujo de Desarrollo

Cumpliendo las directrices de [`AGENTS.md`](./AGENTS.md):
- Todas las características se desarrollan en ramas `features/*` o `fix/*`.
- El comando `npm run build` debe finalizar con **0 errores y 0 advertencias** antes de cualquier commit o merge.
- Sincronización continua de documentación post-feature.
