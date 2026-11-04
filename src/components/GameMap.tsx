import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  Coordinates,
  Player,
  Monster,
  SupplyCrate,
  GhostPing,
  MovementMode,
  PlayerRole,
  PlayerSpeed,
  MapStructure,
  DroppedItem,
  WildPet,
  Pet,
} from '../types/game';
import { PLAYER_SPEED_MPS, isMonsterAlive } from '../types/game';
import { createGeoJsonCircle, getDistanceMeters, getDestinationPoint } from '../services/geoUtils';
import { getVisionRadius, getCrateVisualInfo } from '../services/combatEngine';
import {
  MAX_PETS_PER_PLAYER,
  getMonsterVisualConfig,
  isWildPetActive,
  isSupplyCrateActive,
  isDroppedItemActive,
  isPlayerWoundedOrCritical,
  resolveHospitalCoordinates,
} from '../services/mapEntities';
import { soundEffects } from '../services/soundEffects';

// Coordenadas tácticas de fallback predeterminadas
export const INITIAL_LAT = 37.4018;
export const INITIAL_LNG = -2.1565;

// Identificadores únicos de fuentes y capas GeoJSON
export const SOURCE_CIRCLES = 'tactical-interaction-circles-source';
export const LAYER_CIRCLES_FILL = 'tactical-interaction-circles-fill';
export const LAYER_CIRCLES_LINE = 'tactical-interaction-circles-line';

export const SOURCE_BOUNDARY = 'tactical-game-boundary-source';
export const LAYER_BOUNDARY_FILL = 'tactical-game-boundary-fill';
export const LAYER_BOUNDARY_HALO = 'tactical-game-boundary-halo';
export const LAYER_BOUNDARY_LINE = 'tactical-game-boundary-line';

export const SOURCE_PLAYER_VISION = 'player-vision-source';
export const LAYER_PLAYER_VISION_FILL = 'player-vision-fill';
export const LAYER_PLAYER_VISION_LINE = 'player-vision-line';

export const SOURCE_HOSPITAL_GUIDELINE = 'hospital-guideline-source';

/**
 * Genera un polígono GeoJSON circular cerrado en proyección [lng, lat]
 * Cumple estrictamente con la especificación RFC 7946 (3 niveles de array en coordinates)
 */
export function createCircleFeature(
  center: [number, number] | Coordinates, // [lng, lat] o Coordinates
  radiusInMeters: number,
  properties: Record<string, any> = {},
  points = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const rawLng = Array.isArray(center) ? center[0] : center?.lng;
  const rawLat = Array.isArray(center) ? center[1] : center?.lat;
  let lng =
    typeof rawLng === 'number' && !isNaN(rawLng) && Math.abs(rawLng) > 0.0001 ? rawLng : INITIAL_LNG;
  let lat =
    typeof rawLat === 'number' && !isNaN(rawLat) && Math.abs(rawLat) > 0.0001 ? rawLat : INITIAL_LAT;

  // Sanitización defensiva contra inversión accidental [lat, lng]
  if (lng > 0 && lat < 0) {
    const tmp = lng;
    lng = lat;
    lat = tmp;
  }

  const radius =
    typeof radiusInMeters === 'number' && !isNaN(radiusInMeters) && radiusInMeters > 0
      ? radiusInMeters
      : 350;

  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const bearing = (i * 360) / points;
    const pt = getDestinationPoint({ lat, lng }, radius, bearing);
    coords.push([pt.lng, pt.lat]);
  }
  // Cierre estricto del polígono GeoJSON: el último punto debe ser idéntico en valor exacto al primero
  coords.push([coords[0][0], coords[0][1]]);

  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [coords], // Nivel 1: array de anillos -> Nivel 2: anillo exterior -> Nivel 3: par [lng, lat]
    },
  };
}

export const MAP_STYLES = {
  tactical: 'https://tiles.openfreemap.org/styles/dark',
  satellite: {
    version: 8 as const,
    sources: {
      'satellite-tiles': {
        type: 'raster' as const,
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster' as const,
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  },
};

/**
 * Guarda defensiva para verificar de forma segura si el mapa y su estilo interno
 * están completamente cargados y disponibles para interactuar con capas y fuentes GeoJSON.
 */
export const isMapStyleLoaded = (
  mapInstance: maplibregl.Map | null | undefined
): boolean => {
  return Boolean(
    mapInstance &&
      typeof mapInstance.isStyleLoaded === 'function' &&
      mapInstance.isStyleLoaded()
  );
};

/**
 * Muta directamente el LineString del trazado hacia el hospital en el hilo de renderizado sin latencia.
 * Garantiza resiliencia frente a recargas de estilo, orden Z en WebGL y sanitización de coordenadas [lng, lat].
 */
export const updateHospitalGuidelineSync = (
  map: maplibregl.Map,
  playerLng: number,
  playerLat: number,
  isWounded: boolean,
  hospitalCoords: { lat: number; lng: number } | null
) => {
  if (!map || !isMapStyleLoaded(map)) return;

  // 1. Garantizar de forma defensiva que la fuente y capas existan en el estilo activo de MapLibre
  if (!map.getSource(SOURCE_HOSPITAL_GUIDELINE)) {
    try {
      map.addSource(SOURCE_HOSPITAL_GUIDELINE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    } catch {
      // Ignorar si el estilo se encuentra en transición
    }
  }

  if (!map.getSource('hospital-guideline')) {
    try {
      map.addSource('hospital-guideline', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    } catch {
      // Ignorar
    }
  }

  if (!map.getLayer('hospital-guideline-halo')) {
    try {
      map.addLayer({
        id: 'hospital-guideline-halo',
        type: 'line',
        source: SOURCE_HOSPITAL_GUIDELINE,
        layout: {
          visibility: isWounded ? 'visible' : 'none',
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 6.0,
          'line-opacity': 0.85,
        },
      });
    } catch {
      // Ignorar
    }
  }

  if (!map.getLayer('hospital-guideline-line')) {
    try {
      map.addLayer({
        id: 'hospital-guideline-line',
        type: 'line',
        source: SOURCE_HOSPITAL_GUIDELINE,
        layout: {
          visibility: isWounded ? 'visible' : 'none',
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ef4444',
          'line-width': 4.0,
          'line-dasharray': [3, 2],
          'line-opacity': 1.0,
        },
      });
    } catch {
      // Ignorar
    }
  }

  const source1 = map.getSource(SOURCE_HOSPITAL_GUIDELINE) as maplibregl.GeoJSONSource | undefined;
  const source2 = map.getSource('hospital-guideline') as maplibregl.GeoJSONSource | undefined;

  // 2. Normalización y sanitización estricta de coordenadas geográficas [longitud, latitud]
  let pLng = typeof playerLng === 'number' && !isNaN(playerLng) ? playerLng : INITIAL_LNG;
  let pLat = typeof playerLat === 'number' && !isNaN(playerLat) ? playerLat : INITIAL_LAT;
  if (pLng > 0 && pLat < 0) {
    const tmp = pLng;
    pLng = pLat;
    pLat = tmp;
  }

  let hLng = typeof hospitalCoords?.lng === 'number' && !isNaN(hospitalCoords.lng) ? hospitalCoords.lng : -2.1558;
  let hLat = typeof hospitalCoords?.lat === 'number' && !isNaN(hospitalCoords.lat) ? hospitalCoords.lat : 37.401;
  if (hLng > 0 && hLat < 0) {
    const tmp = hLng;
    hLng = hLat;
    hLat = tmp;
  }

  const shouldRender = Boolean(
    isWounded &&
    (pLat !== 0 || pLng !== 0) &&
    (hLat !== 0 || hLng !== 0)
  );

  // 3. Estructura RFC 7946 estándar FeatureCollection
  const guidelineData: any = {
    type: 'FeatureCollection',
    features: shouldRender
      ? [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [pLng, pLat],
                [hLng, hLat],
              ],
            },
            properties: {
              status: 'emergency',
              description: 'Directriz táctica de emergencia hacia el Hospital de Campaña',
            },
          },
        ]
      : [],
  };

  if (source1) source1.setData(guidelineData);
  if (source2) source2.setData(guidelineData);

  const visibility = shouldRender ? 'visible' : 'none';
  try {
    if (map.getLayer('hospital-guideline-halo')) {
      map.setLayoutProperty('hospital-guideline-halo', 'visibility', visibility);
      if (shouldRender) {
        map.moveLayer('hospital-guideline-halo');
      }
    }
    if (map.getLayer('hospital-guideline-line')) {
      map.setLayoutProperty('hospital-guideline-line', 'visibility', visibility);
      if (shouldRender) {
        map.moveLayer('hospital-guideline-line');
      }
    }
  } catch {
    // Ignorar si el estilo se está recargando
  }

  // 4. Radio perimetral de 12 metros alrededor del jugador herido
  const perimeterSource = map.getSource('wounded-perimeter') as maplibregl.GeoJSONSource | undefined;
  if (perimeterSource) {
    if (shouldRender) {
      perimeterSource.setData({
        type: 'FeatureCollection',
        features: [createGeoJsonCircle({ lat: pLat, lng: pLng }, 12)],
      });
    } else {
      perimeterSource.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }
  try {
    if (map.getLayer('wounded-perimeter-fill')) {
      map.setLayoutProperty('wounded-perimeter-fill', 'visibility', visibility);
      if (shouldRender) map.moveLayer('wounded-perimeter-fill');
    }
    if (map.getLayer('wounded-perimeter-outline')) {
      map.setLayoutProperty('wounded-perimeter-outline', 'visibility', visibility);
      if (shouldRender) map.moveLayer('wounded-perimeter-outline');
    }
  } catch {
    // Ignorar
  }

  // 5. Trazas informativas de depuración en consola
  if (shouldRender) {
    console.info(
      `[HospitalGuideline] Avatar en estado HERIDO detectado. Línea discontinua trazada: ` +
      `[Lng: ${pLng.toFixed(6)}, Lat: ${pLat.toFixed(6)}] -> [Lng: ${hLng.toFixed(6)}, Lat: ${hLat.toFixed(6)}]. ` +
      `Datos inyectados en fuente GeoJSON de MapLibre y capas elevadas al tope WebGL.`
    );
  } else if (!isWounded) {
    console.info('[HospitalGuideline] Avatar sin estado herido (operativo). Fuente GeoJSON vaciada y directriz oculta.');
  }
};

export interface EntityMovementState {
  isMoving: boolean;
  facingMode: 'right' | 'left' | 'scan'; // 'scan' para arriba/abajo
}

export function computeEntityMovement(
  currentLat: number,
  currentLng: number,
  prevLat: number | undefined,
  prevLng: number | undefined,
  minThresholdMeters: number = 0.4
): EntityMovementState {
  if (prevLat === undefined || prevLng === undefined) {
    return { isMoving: false, facingMode: 'right' };
  }

  // Componentes del desplazamiento en metros aproximados
  const dLat = (currentLat - prevLat) * 111139; // Eje vertical (Y)
  const dLng = (currentLng - prevLng) * (111139 * Math.cos((currentLat * Math.PI) / 180)); // Eje horizontal (X)
  const distanceMoved = Math.sqrt(dLat * dLat + dLng * dLng);

  // Umbral mínimo de movimiento para activar la zancada (evita micro-vibraciones de GPS)
  if (distanceMoved < minThresholdMeters) {
    return { isMoving: false, facingMode: 'right' };
  }

  const absX = Math.abs(dLng);
  const absY = Math.abs(dLat);

  // Si el avance es predominantemente vertical (|dY| > 1.4 * |dX|): avanzar mirando a ambos lados
  if (absY > absX * 1.4) {
    return { isMoving: true, facingMode: 'scan' };
  }

  // Si avanza hacia el Este (derecha) o hacia el Oeste (izquierda)
  return {
    isMoving: true,
    facingMode: dLng >= 0 ? 'right' : 'left',
  };
}

interface EntityKinematicsRecord {
  anchorLat: number;
  anchorLng: number;
  isMoving: boolean;
  facingMode: 'right' | 'left' | 'scan';
  stopTimeout: ReturnType<typeof setTimeout> | null;
  flankWatchInterval?: ReturnType<typeof setInterval> | null;
}

function getFacingClass(facingMode: 'right' | 'left' | 'scan', isMoving: boolean): string {
  if (!isMoving && facingMode === 'scan') {
    return 'marker-facing-right';
  }
  switch (facingMode) {
    case 'left':
      return 'marker-facing-left';
    case 'scan':
      return 'marker-facing-scan';
    case 'right':
    default:
      return 'marker-facing-right';
  }
}

function updateKinematicsDOM(
  bounceElementId: string,
  facingElementId: string,
  isMoving: boolean,
  facingMode: 'right' | 'left' | 'scan'
) {
  const bounceEl = document.getElementById(bounceElementId);
  if (bounceEl) {
    if (isMoving) {
      if (!bounceEl.classList.contains('marker-stepping')) {
        bounceEl.classList.add('marker-stepping');
      }
    } else {
      bounceEl.classList.remove('marker-stepping');
    }
  }

  const facingEl = document.getElementById(facingElementId);
  if (facingEl) {
    facingEl.classList.remove('marker-facing-right', 'marker-facing-left', 'marker-facing-scan');
    facingEl.classList.add(getFacingClass(facingMode, isMoving));
  }
}

/**
 * Calcula el desplazamiento (offset en píxeles de pantalla) para la comitiva de mascotas
 * en formación de abanico táctico superior (hombros y sector superior del avance),
 * garantizando que la píldora de nombre y la barra de vida inferior queden 100% despejadas.
 * Incorpora inercia y arrastre vectorial (Spring Follow) cuando el jugador se desplaza.
 */
export const getPetEscortOffset = (
  index: number,
  total: number,
  isPlayerMoving: boolean = false,
  facingMode: 'right' | 'left' | 'scan' = 'right'
) => {
  // Abanico superior: distribución por encima del personaje (-90° arriba centro, -135°/-45° hombros, etc.)
  const upperAnglesMap: Record<number, number[]> = {
    1: [-90],              // Justo arriba en el centro
    2: [-135, -45],        // Diagonal superior izquierda y derecha
    3: [-150, -90, -30],   // Arriba izquierda, arriba centro, arriba derecha
  };
  const angles = upperAnglesMap[total] || [-90];
  const rad = ((angles[index] ?? -90) * Math.PI) / 180;
  const distance = 40;

  const baseX = Math.round(Math.cos(rad) * distance);
  const baseY = Math.round(Math.sin(rad) * distance) - 8; // Despeje superior estricto

  if (!isPlayerMoving) {
    return { x: baseX, y: baseY };
  }

  // Cuando el jugador se desplaza, aplicamos inercia de arrastre (lag vectorial)
  // Las mascotas se retrasan con respecto al vector de avance
  let lagX = 0;
  let lagY = 0;
  const inertiaFactor = 8 + index * 4;

  if (facingMode === 'right') {
    lagX = -inertiaFactor; // Arrastre hacia la izquierda
  } else if (facingMode === 'left') {
    lagX = inertiaFactor;  // Arrastre hacia la derecha
  } else if (facingMode === 'scan') {
    lagY = 6 + index * 3;  // Arrastre moderado vertical hacia abajo
  }

  return {
    x: baseX + lagX,
    y: baseY + lagY,
  };
};

/**
 * Obtiene la latencia elástica de seguimiento (Spring Follow) según la posición en fila.
 */
export const getPetFollowLatency = (index: number): number => {
  if (index === 0) return 0.22; // Mascota 0: Líder del flanco
  if (index === 1) return 0.28; // Mascota 1: Centro superior
  return 0.35;                 // Mascota 2: Retaguardia del flanco
};

/**
 * Genera la configuración de animación orgánica y desincronización temporal por mascota.
 */
export const getPetAnimationStyles = (index: number, petType: string, isPlayerMoving: boolean) => {
  // Desfase para que cada mascota respire/trote en un fotograma distinto
  const delaySec = -(index * 0.45);

  if (isPlayerMoving) {
    // Cuando el jugador camina, trotan con ligeras diferencias de cadencia
    const speedVariation = 0.34 + index * 0.04;
    return {
      animation: `petTrotRun ${speedVariation.toFixed(2)}s infinite ease-in-out`,
      animationDelay: `${delaySec}s`,
    };
  }

  // En reposo (Idle)
  const isAerial = petType === 'drone' || petType === 'medbot';
  if (isAerial) {
    return {
      animation: `droneHoverWobble ${(3.2 + index * 0.3).toFixed(2)}s infinite ease-in-out`,
      animationDelay: `${delaySec}s`,
    };
  }

  return {
    animation: `petIdleBreath ${(2.1 + index * 0.25).toFixed(2)}s infinite ease-in-out`,
    animationDelay: `${delaySec}s`,
  };
};

/**
 * Renderiza el HTML de las mascotas de la comitiva orbitando dentro del árbol DOM del propio jugador.
 * Al formar parte del árbol DOM del jugador, se elimina cualquier desfase, desanclaje o lag durante el zoom/pan.
 */
export const renderPlayerEscortPetsHtml = (
  pets?: Pet[],
  playerId: string = '',
  isPlayerMoving: boolean = false,
  facingMode: 'right' | 'left' | 'scan' = 'right'
) => {
  if (!pets || pets.length === 0) return '';
  const totalPets = pets.length;
  const facingClass = facingMode === 'left' ? 'pet-facing-left' : 'pet-facing-right';

  return pets
    .map((pet, idx) => {
      const { x: offsetX, y: offsetY } = getPetEscortOffset(idx, totalPets, isPlayerMoving, facingMode);
      const latency = getPetFollowLatency(idx);
      const animStyles = getPetAnimationStyles(idx, pet.type, isPlayerMoving);

      return `
        <div 
          id="escort-pet-anchor-${playerId}-${idx}"
          class="player-escort-pet escort-pet-anchor absolute top-1/2 left-1/2 pointer-events-none" 
          style="transform: translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), 0px); transition-duration: ${latency}s;"
        >
          <!-- 1. Capa de animación orgánica desincronizada (Idle / Wobble / Trot) -->
          <div 
            id="escort-pet-anim-${playerId}-${idx}"
            class="pet-anim-wrap flex items-center justify-center pointer-events-none"
            style="animation: ${animStyles.animation}; animation-delay: ${animStyles.animationDelay};"
          >
            <!-- 2. Capa de orientación dinámica de mirada (scaleX(1) / scaleX(-1)) -->
            <div 
              id="escort-pet-facing-${playerId}-${idx}"
              class="pet-facing-wrap ${facingClass} flex items-center justify-center pointer-events-none"
            >
              <img 
                src="${pet.icon}" 
                alt="${pet.name}" 
                width="28" 
                height="28" 
                class="marker-entity-img select-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)] ${
                  pet.isWounded ? 'grayscale opacity-60' : 'drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                }" 
                style="width: 28px !important; height: 28px !important; max-width: 28px !important; max-height: 28px !important;" 
              />
              ${pet.isWounded ? '<span class="absolute -top-1 -right-1 text-[8px] animate-spin">💫</span>' : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
};

/**
 * Actualiza directamente el DOM de la comitiva de mascotas (transform inercial, animación y mirada)
 * sin recrear elementos ni reiniciar transiciones CSS a 60 FPS.
 */
export const updatePlayerPetsKinematicsDOM = (
  playerId: string,
  pets: Pet[] | undefined,
  isMoving: boolean,
  facingMode: 'right' | 'left' | 'scan'
) => {
  if (!pets || pets.length === 0) return;
  const total = pets.length;

  pets.forEach((pet, idx) => {
    const anchorEl = document.getElementById(`escort-pet-anchor-${playerId}-${idx}`);
    if (anchorEl) {
      const { x, y } = getPetEscortOffset(idx, total, isMoving, facingMode);
      const latency = getPetFollowLatency(idx);
      anchorEl.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0px)`;
      anchorEl.style.transitionDuration = `${latency}s`;
    }

    const animEl = document.getElementById(`escort-pet-anim-${playerId}-${idx}`);
    if (animEl) {
      const animStyles = getPetAnimationStyles(idx, pet.type, isMoving);
      animEl.style.animation = animStyles.animation;
      animEl.style.animationDelay = animStyles.animationDelay;
    }

    const facingEl = document.getElementById(`escort-pet-facing-${playerId}-${idx}`);
    if (facingEl) {
      facingEl.classList.remove('pet-facing-right', 'pet-facing-left');
      const targetFacing = facingMode === 'left' ? 'pet-facing-left' : 'pet-facing-right';
      facingEl.classList.add(targetFacing);
    }
  });
};

/**
 * Inicia la vigilancia aleatoria de flancos en reposo tras permanecer inmóvil.
 */
export const startIdleFlankWatch = (
  playerId: string,
  pets: Pet[] | undefined,
  kin: EntityKinematicsRecord
) => {
  if (kin.flankWatchInterval) {
    clearInterval(kin.flankWatchInterval);
    kin.flankWatchInterval = null;
  }
  if (!pets || pets.length <= 1) return;

  // En reposo, tras 3.5-5 segundos, una mascota del flanco alterna su mirada para vigilar
  kin.flankWatchInterval = setInterval(() => {
    if (kin.isMoving) {
      if (kin.flankWatchInterval) {
        clearInterval(kin.flankWatchInterval);
        kin.flankWatchInterval = null;
      }
      return;
    }
    const flankIndices = [0, pets.length - 1];
    const targetIdx = flankIndices[Math.floor(Math.random() * flankIndices.length)];
    const facingEl = document.getElementById(`escort-pet-facing-${playerId}-${targetIdx}`);
    if (facingEl) {
      if (facingEl.classList.contains('pet-facing-left')) {
        facingEl.classList.remove('pet-facing-left');
        facingEl.classList.add('pet-facing-right');
      } else {
        facingEl.classList.remove('pet-facing-right');
        facingEl.classList.add('pet-facing-left');
      }
    }
  }, 4000);
};

interface GameMapProps {
  center: Coordinates;
  playAreaRadius: number;
  treasureLocation: Coordinates;
  myPlayer: Player;
  players: Player[];
  monster: Monster;
  monsters?: Monster[];
  crates: SupplyCrate[];
  ghostPings: GhostPing[];
  movementMode: MovementMode;
  playerSpeed?: PlayerSpeed;
  isRadarActive: boolean;
  structures?: MapStructure[];
  droppedItems?: DroppedItem[];
  wildPets?: WildPet[];
  inCombat?: boolean;
  isChestOpened?: boolean;
  isVictory?: boolean;
  isChestLockModalOpen?: boolean;
  isChestTransitioning?: boolean;
  isChestGuarded?: boolean;
  onMapClick: (coords: Coordinates) => void;
  onReviveAttempt?: (targetPlayer: Player) => void;
  onPickDroppedItem?: (dropped: DroppedItem) => void;
  onAdoptWildPet?: (wildPet: WildPet) => void;
  onOpenChest?: () => void;
  onPlayerMarkerClick?: (targetPlayerId: string) => void;
  onMonsterClick?: (monster: Monster) => void;
}

const GameMapComponent: React.FC<GameMapProps> = ({
  center,
  playAreaRadius,
  treasureLocation,
  myPlayer,
  players,
  monster,
  monsters,
  crates,
  ghostPings,
  movementMode,
  playerSpeed = 'normal',
  isRadarActive,
  structures = [],
  droppedItems = [],
  wildPets = [],
  inCombat = false,
  isChestOpened = false,
  isVictory = false,
  isChestLockModalOpen = false,
  isChestTransitioning = false,
  isChestGuarded,
  onMapClick,
  onPickDroppedItem,
  onAdoptWildPet,
  onOpenChest,
  onPlayerMarkerClick,
  onMonsterClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);

  const inCombatRef = useRef(inCombat);
  inCombatRef.current = inCombat;

  // Marcadores HTML persistentes en refs para animación a 60 FPS sin re-renderizar React
  const playerMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const monsterMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const chestMarkerRef = useRef<maplibregl.Marker | null>(null);
  const crateMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pingMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const structureMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const droppedItemMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const wildPetMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const companionPetMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Registros de cinemática (movimiento, zancada y orientación) para jugadores y monstruos
  const playerKinematicsRef = useRef<Map<string, EntityKinematicsRecord>>(new Map());
  const monsterKinematicsRef = useRef<Map<string, EntityKinematicsRecord>>(new Map());

  const onPickDroppedItemRef = useRef(onPickDroppedItem);
  onPickDroppedItemRef.current = onPickDroppedItem;

  const onAdoptWildPetRef = useRef(onAdoptWildPet);
  onAdoptWildPetRef.current = onAdoptWildPet;

  const onPlayerMarkerClickRef = useRef(onPlayerMarkerClick);
  onPlayerMarkerClickRef.current = onPlayerMarkerClick;

  const onMonsterClickRef = useRef(onMonsterClick);
  onMonsterClickRef.current = onMonsterClick;

  const onOpenChestRef = useRef(onOpenChest);
  onOpenChestRef.current = onOpenChest;
  const hasTriggeredChestInMapRef = useRef<boolean>(false);

  const myPlayerRef = useRef(myPlayer);
  myPlayerRef.current = myPlayer;

  // Refs para desacoplar arrastre de cámara (drag) de clic de movimiento (tap-to-move)
  const isDraggingRef = useRef<boolean>(false);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragEndTimeRef = useRef<number>(0);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const [followPlayer, setFollowPlayer] = useState<boolean>(true);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);
  const followPlayerRef = useRef<boolean>(true);
  followPlayerRef.current = followPlayer;

  // Estado local para alternar entre vista táctica oscura y satélite/terreno real (Satélite por defecto)
  const [isSatelliteView, setIsSatelliteView] = useState<boolean>(true);
  const [styleVersion, setStyleVersion] = useState<number>(0);
  const isStyleChangingRef = useRef<boolean>(false);

  const lastCameraPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastVisionPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const updateEmergencyOverlaysRef = useRef<(map: maplibregl.Map) => void>(() => {});

  // Estado del jugador local: Herido / Incapacitado (visión de emergencia hospitalaria)
  const isMeWounded = isPlayerWoundedOrCritical(myPlayer);

  // ==========================================
  // GESTIÓN ROBUSTA DE FUENTES Y CAPAS GEOJSON RESILIENTES
  // ==========================================

  /**
   * Limpia capas o fuentes dinámicas huérfanas en el estilo de MapLibre
   */
  const cleanOrphanSourcesAndLayers = useCallback(
    (
      map: maplibregl.Map,
      currentCrates: SupplyCrate[],
      currentWildPets: WildPet[],
      currentDroppedItems: DroppedItem[]
    ) => {
      try {
        const style = map.getStyle();
        if (!style) return;
        const activeEntityIds = new Set([
          ...currentCrates.filter((c) => isSupplyCrateActive(c)).map((c) => c.id),
          ...currentWildPets.filter((wp) => isWildPetActive(wp)).map((wp) => wp.id),
          ...currentDroppedItems.filter((d) => isDroppedItemActive(d)).map((d) => d.id),
        ]);

        if (style.layers) {
          style.layers.forEach((layer) => {
            if (
              layer.id.startsWith('circle-layer-') ||
              layer.id.startsWith('entity-radius-') ||
              layer.id.startsWith('pet-circle-layer-') ||
              layer.id.startsWith('crate-circle-layer-')
            ) {
              const entityId = layer.id
                .replace('circle-layer-', '')
                .replace('entity-radius-', '')
                .replace('pet-circle-layer-', '')
                .replace('crate-circle-layer-', '');
              if (!activeEntityIds.has(entityId)) {
                if (map.getLayer(layer.id)) map.removeLayer(layer.id);
                if (map.getSource(layer.id)) map.removeSource(layer.id);
              }
            }
          });
        }

        if (style.sources) {
          Object.keys(style.sources).forEach((sourceId) => {
            if (
              sourceId.startsWith('circle-source-') ||
              sourceId.startsWith('pet-circle-source-') ||
              sourceId.startsWith('crate-circle-source-')
            ) {
              const entityId = sourceId
                .replace('circle-source-', '')
                .replace('pet-circle-source-', '')
                .replace('crate-circle-source-', '');
              if (!activeEntityIds.has(entityId)) {
                if (style.layers) {
                  style.layers.forEach((l) => {
                    if ((l as any).source === sourceId && map.getLayer(l.id)) {
                      map.removeLayer(l.id);
                    }
                  });
                }
                if (map.getSource(sourceId)) {
                  map.removeSource(sourceId);
                }
              }
            }
          });
        }
      } catch (err) {
        console.warn('[GameMap] Aviso al limpiar capas huérfanas:', err);
      }
    },
    []
  );

  /**
   * 1. CONFIGURACIÓN MODULAR DE FUENTES Y CAPAS GEOJSON
   * Encapsula la creación resiliente de fuentes y capas tras style.load
   */
  const setupMapLayersAndSources = useCallback(
    (map: maplibregl.Map) => {
      if (!isMapStyleLoaded(map)) return;

      try {
        // 1. FUENTE Y CAPAS DE LA ZONA DE JUEGO (Límite operacional con técnica de doble capa de alto contraste)
        if (!map.getSource(SOURCE_BOUNDARY)) {
          map.addSource(SOURCE_BOUNDARY, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getLayer(LAYER_BOUNDARY_FILL)) {
          map.addLayer({
            id: LAYER_BOUNDARY_FILL,
            type: 'fill',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'Polygon'],
            layout: {
              visibility: 'visible',
            },
            paint: {
              'fill-color': '#00f2fe',
              'fill-opacity': 0.12,
            },
          });
        }

        // Capa de halo/brillo base sólida (sin guiones) para contraste incuestionable sobre satélite
        if (!map.getLayer(LAYER_BOUNDARY_HALO)) {
          map.addLayer({
            id: LAYER_BOUNDARY_HALO,
            type: 'line',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'LineString'],
            layout: {
              visibility: 'visible',
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#00f2fe',
              'line-width': 6.0,
              'line-opacity': 0.55,
              'line-blur': 1.5,
            },
          });
        }

        // Capa superior discontinua con line-cap 'butt' para estabilidad absoluta del shader lineSDF en vértices cerrados
        if (!map.getLayer(LAYER_BOUNDARY_LINE)) {
          map.addLayer({
            id: LAYER_BOUNDARY_LINE,
            type: 'line',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'LineString'],
            layout: {
              visibility: 'visible',
              'line-join': 'round',
              'line-cap': 'butt',
            },
            paint: {
              'line-color': '#00f2fe',
              'line-width': 3.2,
              'line-dasharray': [3, 2],
              'line-opacity': 1.0,
            },
          });
        }

        // 2. FUENTE Y CAPAS DE RADIOS DE INFLUENCIA (Armas, Cajas, Mascotas, Refugios, Hospital, Tesoro)
        if (!map.getSource(SOURCE_CIRCLES)) {
          map.addSource(SOURCE_CIRCLES, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          // Relleno translúcido
          if (!map.getLayer(LAYER_CIRCLES_FILL)) {
            map.addLayer({
              id: LAYER_CIRCLES_FILL,
              type: 'fill',
              source: SOURCE_CIRCLES,
              paint: {
                'fill-color': ['get', 'color'],
                'fill-opacity': ['get', 'fillOpacity'],
              },
            });
          }

          // Borde perimetral punteado
          if (!map.getLayer(LAYER_CIRCLES_LINE)) {
            map.addLayer({
              id: LAYER_CIRCLES_LINE,
              type: 'line',
              source: SOURCE_CIRCLES,
              paint: {
                'line-color': ['get', 'color'],
                'line-width': 1.8,
                'line-dasharray': [2, 2],
                'line-opacity': 0.9,
              },
            });
          }
        }

        // 3. CAPA DINÁMICA: RADIO DE VISIÓN DEL JUGADOR
        if (!map.getSource(SOURCE_PLAYER_VISION)) {
          map.addSource(SOURCE_PLAYER_VISION, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getLayer(LAYER_PLAYER_VISION_FILL)) {
          map.addLayer({
            id: LAYER_PLAYER_VISION_FILL,
            type: 'fill',
            source: SOURCE_PLAYER_VISION,
            layout: {
              visibility: isMeWounded ? 'none' : 'visible',
            },
            paint: {
              'fill-color': '#00f2fe',
              'fill-opacity': 0.08,
            },
          });
        }

        if (!map.getLayer(LAYER_PLAYER_VISION_LINE)) {
          map.addLayer({
            id: LAYER_PLAYER_VISION_LINE,
            type: 'line',
            source: SOURCE_PLAYER_VISION,
            layout: {
              visibility: isMeWounded ? 'none' : 'visible',
            },
            paint: {
              'line-color': '#00f2fe',
              'line-width': 1.6,
              'line-dasharray': [3, 2],
              'line-opacity': 0.7,
            },
          });
        }

        // Capa legacy player-vision para retrocompatibilidad
        if (!map.getSource('player-vision')) {
          map.addSource('player-vision', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getLayer('player-vision-outline')) {
          map.addLayer({
            id: 'player-vision-outline',
            type: 'line',
            source: 'player-vision',
            layout: {
              visibility: isMeWounded ? 'none' : 'visible',
            },
            paint: {
              'line-color': '#00ff88',
              'line-width': 2,
              'line-opacity': 0.75,
              'line-dasharray': [2, 2],
            },
          });
        }

        // 4. OVERLAYS DE EMERGENCIA (Hospital Guideline y Wounded Perimeter)
        if (!map.getSource(SOURCE_HOSPITAL_GUIDELINE)) {
          map.addSource(SOURCE_HOSPITAL_GUIDELINE, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getSource('hospital-guideline')) {
          map.addSource('hospital-guideline', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getLayer('hospital-guideline-halo')) {
          map.addLayer({
            id: 'hospital-guideline-halo',
            type: 'line',
            source: SOURCE_HOSPITAL_GUIDELINE,
            layout: {
              visibility: isMeWounded ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#000000',
              'line-width': 6.0,
              'line-opacity': 0.85,
            },
          });
        }

        if (!map.getLayer('hospital-guideline-line')) {
          map.addLayer({
            id: 'hospital-guideline-line',
            type: 'line',
            source: SOURCE_HOSPITAL_GUIDELINE,
            layout: {
              visibility: isMeWounded ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#ef4444',
              'line-width': 4.0,
              'line-dasharray': [3, 2],
              'line-opacity': 1.0,
            },
          });
        }

        if (!map.getSource('wounded-perimeter')) {
          map.addSource('wounded-perimeter', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        if (!map.getLayer('wounded-perimeter-fill')) {
          map.addLayer({
            id: 'wounded-perimeter-fill',
            type: 'fill',
            source: 'wounded-perimeter',
            layout: {
              visibility: isMeWounded ? 'visible' : 'none',
            },
            paint: {
              'fill-color': '#ef4444',
              'fill-opacity': 0.15,
            },
          });
        }

        if (!map.getLayer('wounded-perimeter-outline')) {
          map.addLayer({
            id: 'wounded-perimeter-outline',
            type: 'line',
            source: 'wounded-perimeter',
            layout: {
              visibility: isMeWounded ? 'visible' : 'none',
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#ef4444',
              'line-width': 2.5,
              'line-dasharray': [2, 2],
              'line-opacity': 0.9,
            },
          });
        }

        // 5. GARANTÍA DE ORDEN Z EN WEBGL: Elevar las capas vectoriales por encima de las capas raster (satélite)
        const vectorLayersElevated = [
          LAYER_BOUNDARY_FILL,
          LAYER_BOUNDARY_HALO,
          LAYER_BOUNDARY_LINE,
          LAYER_CIRCLES_FILL,
          LAYER_CIRCLES_LINE,
          LAYER_PLAYER_VISION_FILL,
          LAYER_PLAYER_VISION_LINE,
          'player-vision-outline',
          'hospital-guideline-halo',
          'hospital-guideline-line',
          'wounded-perimeter-fill',
          'wounded-perimeter-outline',
        ];

        vectorLayersElevated.forEach((layerId) => {
          try {
            if (map.getLayer(layerId)) {
              map.moveLayer(layerId);
            }
          } catch {
            // Ignorar durante transiciones de estilo
          }
        });
      } catch (err) {
        console.warn('[GameMap] Error al configurar capas y fuentes de mapa:', err);
      }
    },
    [isMeWounded]
  );

  // Localización defensiva y garantizada de coordenadas del Hospital de Campaña (nunca retorna null)
  const hospitalCoords = useMemo(
    () => resolveHospitalCoordinates(structures, center, playAreaRadius, treasureLocation),
    [structures, center?.lat, center?.lng, playAreaRadius, treasureLocation?.lat, treasureLocation?.lng]
  );

  /**
   * Sincroniza la geometría del límite de la zona de juego con fallbacks robustos y autosuficiencia
   */
  const syncGameBoundary = useCallback(
    (targetMap?: maplibregl.Map) => {
      const map = targetMap || mapRef.current;
      if (!map) return;

      // 1. Guarda reactiva frente a carga asíncrona de estilo en MapLibre
      if (!isMapStyleLoaded(map)) {
        const onStyleLoad = () => {
          if (mapRef.current === map) {
            syncGameBoundary(map);
          }
        };
        map.once('style.load', onStyleLoad);
        return;
      }

      try {
        // 2. Autosuficiencia: Crear la fuente si aún no existe en el estilo activo
        if (!map.getSource(SOURCE_BOUNDARY)) {
          map.addSource(SOURCE_BOUNDARY, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        // 3. Autosuficiencia: Crear capas de relleno, halo y línea discontinua si no existen
        if (!map.getLayer(LAYER_BOUNDARY_FILL)) {
          map.addLayer({
            id: LAYER_BOUNDARY_FILL,
            type: 'fill',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'Polygon'],
            layout: {
              visibility: 'visible',
            },
            paint: {
              'fill-color': '#00f2fe',
              'fill-opacity': 0.12,
            },
          });
        }

        if (!map.getLayer(LAYER_BOUNDARY_HALO)) {
          map.addLayer({
            id: LAYER_BOUNDARY_HALO,
            type: 'line',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'LineString'],
            layout: {
              visibility: 'visible',
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#00f2fe',
              'line-width': 6.0,
              'line-opacity': 0.55,
              'line-blur': 1.5,
            },
          });
        }

        if (!map.getLayer(LAYER_BOUNDARY_LINE)) {
          map.addLayer({
            id: LAYER_BOUNDARY_LINE,
            type: 'line',
            source: SOURCE_BOUNDARY,
            filter: ['==', '$type', 'LineString'],
            layout: {
              visibility: 'visible',
              'line-join': 'round',
              'line-cap': 'butt',
            },
            paint: {
              'line-color': '#00f2fe',
              'line-width': 3.2,
              'line-dasharray': [3, 2],
              'line-opacity': 1.0,
            },
          });
        }

        const source = (map.getSource(SOURCE_BOUNDARY) || map.getSource('play-area')) as
          | maplibregl.GeoJSONSource
          | undefined;

        if (!source) {
          console.warn('[GameMap:Boundary] No se pudo resolver la fuente GeoJSON del límite tras asegurar su creación.');
          return;
        }

        // 4. Coordenadas y radio con valores predeterminados sólidos (Las Meriendas: 37.4018, -2.1565, 350m)
        const rawLng = center?.lng;
        const rawLat = center?.lat;
        let centerLng =
          typeof rawLng === 'number' && !isNaN(rawLng) && Math.abs(rawLng) > 0.0001 ? rawLng : INITIAL_LNG;
        let centerLat =
          typeof rawLat === 'number' && !isNaN(rawLat) && Math.abs(rawLat) > 0.0001 ? rawLat : INITIAL_LAT;
        if (centerLng > 0 && centerLat < 0) {
          const tmp = centerLng;
          centerLng = centerLat;
          centerLat = tmp;
        }

        const radius =
          typeof playAreaRadius === 'number' && !isNaN(playAreaRadius) && playAreaRadius > 0
            ? playAreaRadius
            : 350;

        // 5. Geometría cerrada de alta fidelidad: Polígono para relleno y LineString perimetral
        const boundaryPolygon = createCircleFeature([centerLng, centerLat], radius, {
          color: '#00f2fe',
          fillOpacity: 0.12,
          id: 'operational-game-boundary-fill',
          type: 'game-boundary',
        });

        const perimeterCoords = boundaryPolygon.geometry.coordinates[0];
        const boundaryLineFeature: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {
            color: '#00f2fe',
            id: 'operational-game-boundary-line',
            type: 'game-boundary',
          },
          geometry: {
            type: 'LineString',
            coordinates: perimeterCoords,
          },
        };

        // 6. Inyectar datos en la fuente GeoJSON
        source.setData({
          type: 'FeatureCollection',
          features: [boundaryPolygon, boundaryLineFeature],
        });

        // 7. Forzar visibilidad explícita y elevar capa de halo y línea a la cúspide de la pila WebGL
        try {
          if (map.getLayer(LAYER_BOUNDARY_FILL)) {
            map.setLayoutProperty(LAYER_BOUNDARY_FILL, 'visibility', 'visible');
            map.moveLayer(LAYER_BOUNDARY_FILL);
          }
          if (map.getLayer(LAYER_BOUNDARY_HALO)) {
            map.setLayoutProperty(LAYER_BOUNDARY_HALO, 'visibility', 'visible');
            map.moveLayer(LAYER_BOUNDARY_HALO);
          }
          if (map.getLayer(LAYER_BOUNDARY_LINE)) {
            map.setLayoutProperty(LAYER_BOUNDARY_LINE, 'visibility', 'visible');
            map.moveLayer(LAYER_BOUNDARY_LINE);
          }
        } catch {
          // Ignorar si el estilo está en transición
        }

        // 8. Trazas informativas de depuración en consola
        const firstPoint = perimeterCoords[0];
        const lastPoint = perimeterCoords[perimeterCoords.length - 1];
        console.info('[GameMap:Boundary] Perímetro operacional asegurado e inyectado:', {
          center: [centerLng, centerLat],
          radiusMeters: radius,
          firstPoint: [Number(firstPoint[0].toFixed(6)), Number(firstPoint[1].toFixed(6))],
          lastPoint: [Number(lastPoint[0].toFixed(6)), Number(lastPoint[1].toFixed(6))],
          isClosed: firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1],
          vertexCount: perimeterCoords.length,
          sourceId: SOURCE_BOUNDARY,
          haloLayerMounted: Boolean(map.getLayer(LAYER_BOUNDARY_HALO)),
          lineLayerMounted: Boolean(map.getLayer(LAYER_BOUNDARY_LINE)),
          fillLayerMounted: Boolean(map.getLayer(LAYER_BOUNDARY_FILL)),
        });
      } catch (err) {
        console.warn('[GameMap] Error al sincronizar límite de juego:', err);
      }
    },
    [center?.lat, center?.lng, playAreaRadius]
  );

  // Efecto reactivo dedicado al límite del área de operaciones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncGameBoundary(map);
  }, [
    center?.lat,
    center?.lng,
    playAreaRadius,
    mapLoaded,
    styleVersion,
    syncGameBoundary,
  ]);

  /**
   * Sincroniza el radio de visión del jugador sobre el mapa en capas de radar
   */
  const syncPlayerVision = useCallback(
    (targetMap?: maplibregl.Map) => {
      const map = targetMap || mapRef.current;
      if (!map || !isMapStyleLoaded(map)) return;

      try {
        const source = (map.getSource(SOURCE_PLAYER_VISION) || map.getSource('player-vision')) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!source) return;

        const playerLat = myPlayer?.lat ?? center?.lat ?? INITIAL_LAT;
        const playerLng = myPlayer?.lng ?? center?.lng ?? INITIAL_LNG;

        if (
          typeof playerLat !== 'number' ||
          typeof playerLng !== 'number' ||
          isNaN(playerLat) ||
          isNaN(playerLng)
        ) {
          return;
        }

        const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
        const calcRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
        const radius = (myPlayer as any)?.visionRadius || (myPlayer as any)?.interactionRadius || calcRadius || 25;

        const visionCircle = createCircleFeature([playerLng, playerLat], radius, {
          color: '#00f2fe',
          id: 'player-vision-circle',
        });
        const visionFC: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [visionCircle],
        };

        source.setData(visionFC);

        const legacyVisionSource = map.getSource('player-vision') as maplibregl.GeoJSONSource | undefined;
        if (legacyVisionSource && legacyVisionSource !== source) {
          legacyVisionSource.setData(visionFC);
        }
      } catch (err) {
        console.warn('[GameMap] Error al sincronizar radio de visión:', err);
      }
    },
    [myPlayer?.lat, myPlayer?.lng, myPlayer?.role, myPlayer?.pets, (myPlayer as any)?.visionRadius, (myPlayer as any)?.interactionRadius, center?.lat, center?.lng, playAreaRadius, isRadarActive]
  );

  /**
   * Sincroniza la directriz hacia el hospital de campaña en reposo y en movimiento
   */
  const syncHospitalGuideline = useCallback(
    (targetMap?: maplibregl.Map) => {
      const map = targetMap || mapRef.current;
      if (!map || !isMapStyleLoaded(map)) return;

      const playerLat = myPlayer?.lat ?? center?.lat ?? INITIAL_LAT;
      const playerLng = myPlayer?.lng ?? center?.lng ?? INITIAL_LNG;
      updateHospitalGuidelineSync(map, playerLng, playerLat, isMeWounded, hospitalCoords);
    },
    [myPlayer?.lat, myPlayer?.lng, center?.lat, center?.lng, isMeWounded, hospitalCoords]
  );

  /**
   * Sincronización directa y síncrona en cada frame para la línea de emergencia al hospital
   * Elimina cualquier latencia o lag al mover el marcador del jugador
   */
  const updateHospitalGuidelineDirect = useCallback(
    (targetMap: maplibregl.Map, currentLng: number, currentLat: number, isWounded: boolean) => {
      updateHospitalGuidelineSync(targetMap, currentLng, currentLat, isWounded, hospitalCoords);
    },
    [hospitalCoords]
  );

  /**
   * 3. SINCRONIZACIÓN REACTIVA ESTRICTA DE ENTIDADES ACTIVAS
   * Solo las entidades presentes y no consumidas generan geometrías poligonales
   */
  const syncAllInteractionCircles = useCallback(
    (targetMap?: maplibregl.Map) => {
      const map = targetMap || mapRef.current;
      if (!map || !isMapStyleLoaded(map)) return;

      try {
        const source = (map.getSource(SOURCE_CIRCLES) ||
          map.getSource('interaction-ranges') ||
          map.getSource('interaction-circles-source')) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;

        const activeFeatures: GeoJSON.Feature[] = [];
        const safeZones = structures || [];

        // A. ESTRUCTURAS PERMANENTES (Hospital y Refugios)
        safeZones
          .filter((zone) => !isMeWounded || zone.type === 'hospital')
          .filter(
            (zone) =>
              typeof zone.lat === 'number' &&
              typeof zone.lng === 'number' &&
              !isNaN(zone.lat) &&
              !isNaN(zone.lng) &&
              (zone.lat !== 0 || zone.lng !== 0)
          )
          .forEach((zone) => {
            activeFeatures.push(
              createCircleFeature([zone.lng, zone.lat], zone.radius || (zone.type === 'hospital' ? 20 : 18), {
                color: zone.type === 'hospital' ? '#10b981' : '#06b6d4', // Verde esmeralda médico o cian refugio
                fillOpacity: 0.12,
                id: zone.id,
                type: zone.type,
              })
            );
          });

        const playerPos = {
          lat: myPlayer?.lat ?? center?.lat ?? INITIAL_LAT,
          lng: myPlayer?.lng ?? center?.lng ?? INITIAL_LNG,
        };
        const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
        const currentVisionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);

        // B. COFRE DEL TESORO: Solo se dibuja círculo perimetral (rojo) si está activamente CUSTODIADO por un monstruo vivo y AVISTADO
        const isChestActive = !isChestOpened && !isChestTransitioning && !isVictory && !isMeWounded;
        const hasValidChestCoords =
          treasureLocation &&
          typeof treasureLocation.lat === 'number' &&
          typeof treasureLocation.lng === 'number' &&
          !isNaN(treasureLocation.lat) &&
          !isNaN(treasureLocation.lng) &&
          (treasureLocation.lat !== 0 || treasureLocation.lng !== 0);

        // Erradicación de círculos naranjas residuales: si el cofre está libre/desbloqueado no se dibuja ningún círculo en el suelo.
        // Solo si está bajo custodia activa de un enemigo vivo y el jugador lo tiene en su campo visual/radar, se proyecta la zona roja de alerta.
        if (isChestActive && hasValidChestCoords && isChestGuarded) {
          const distToChest = getDistanceMeters(playerPos, treasureLocation);
          const isChestSpotted = distToChest <= currentVisionRadius || isRadarActive;
          if (isChestSpotted) {
            activeFeatures.push(
              createCircleFeature([treasureLocation.lng, treasureLocation.lat], 25, {
                color: '#ef4444', // Rojo peligro hostil exclusivo de custodia activa
                fillOpacity: 0.16,
                id: 'active-chest',
                type: 'chest',
              })
            );
          }
        }

        // C. MASCOTAS SILVESTRES (Desaparecen si ya han sido domesticadas/recogidas)
        if (!isMeWounded) {
          (wildPets || [])
            .filter((pet) => isWildPetActive(pet))
            .filter(
              (pet) =>
                typeof pet.lat === 'number' &&
                typeof pet.lng === 'number' &&
                !isNaN(pet.lat) &&
                !isNaN(pet.lng) &&
                (pet.lat !== 0 || pet.lng !== 0)
            )
            .forEach((pet) => {
              activeFeatures.push(
                createCircleFeature([pet.lng, pet.lat], pet.interactionRadius || 12, {
                  color: '#00f2fe', // Cian táctico
                  fillOpacity: 0.14,
                  id: pet.id,
                  type: 'pet',
                })
              );
            });
        }

        // D. CAJAS DE SUMINISTROS Y AIRDROPS (Desaparecen si se han recogido o abierto)
        if (!isMeWounded) {
          (crates || [])
            .filter((crate) => isSupplyCrateActive(crate))
            .filter(
              (crate) =>
                typeof crate.lat === 'number' &&
                typeof crate.lng === 'number' &&
                !isNaN(crate.lat) &&
                !isNaN(crate.lng) &&
                (crate.lat !== 0 || crate.lng !== 0)
            )
            .forEach((crate) => {
              const crateType = (crate as any).crateType || (crate as any).type;
              activeFeatures.push(
                createCircleFeature([crate.lng, crate.lat], crate.radius || 14, {
                  color: crateType === 'explosives' ? '#ef4444' : '#00f2fe',
                  fillOpacity: 0.14,
                  id: crate.id,
                  type: 'crate',
                })
              );
            });
        }

        // E. ARMAS Y BOTÍN SUELTO EN EL SUELO (Desaparecen en el momento de la recogida)
        if (!isMeWounded) {
          (droppedItems || [])
            .filter((item) => isDroppedItemActive(item))
            .filter(
              (item) =>
                typeof item.lat === 'number' &&
                typeof item.lng === 'number' &&
                !isNaN(item.lat) &&
                !isNaN(item.lng) &&
                (item.lat !== 0 || item.lng !== 0)
            )
            .forEach((item) => {
              activeFeatures.push(
                createCircleFeature([item.lng, item.lat], 10, {
                  color: '#a855f7', // Púrpura botín
                  fillOpacity: 0.15,
                  id: item.id,
                  type: 'loot',
                })
              );
            });
        }

        // F. MONSTRUOS: Radios de amenaza/aggro (exclusivamente para monstruos vivos y avistados)
        if (!isMeWounded) {
          const activeMonstersList = monsters && monsters.length > 0 ? monsters : (monster ? [monster] : []);
          activeMonstersList
            .filter((m) => {
              // 1. Exclusión total de enemigos muertos, heridos o neutralizados (nunca proyectan círculo de peligro)
              if (
                !isMonsterAlive(m) ||
                (m as any).isDead ||
                m.status === 'defeated' ||
                m.status === 'wounded' ||
                m.state === 'defeated' ||
                m.state === 'wounded' ||
                m.state === 'dead' ||
                m.hp <= 0
              ) {
                return false;
              }
              // 2. Coordenadas válidas
              if (
                typeof m.lat !== 'number' ||
                typeof m.lng !== 'number' ||
                isNaN(m.lat) ||
                isNaN(m.lng) ||
                (m.lat === 0 && m.lng === 0)
              ) {
                return false;
              }
              // 3. Comprobar que el monstruo esté realmente avistado por el jugador (dentro del radio de visión o radar activo)
              const distToMonster = getDistanceMeters(playerPos, { lat: m.lat, lng: m.lng });
              const isSpotted = distToMonster <= currentVisionRadius || isRadarActive;
              return isSpotted;
            })
            .forEach((m, idx) => {
              activeFeatures.push(
                createCircleFeature(
                  [m.lng, m.lat],
                  (m as any).aggroRadius || 28, // Radio táctico de combate
                  {
                    id: `monster-circle-${m.id || idx}`,
                    color: '#ef4444', // Rojo carmesí de peligro hostil
                    fillOpacity: 0.12,
                    type: 'monster',
                  }
                )
              );
            });
        }

        // G. RANGO DE ACCIÓN/VISIÓN DEL JUGADOR LOCAL
        if (myPlayer?.lng && myPlayer?.lat && !isMeWounded) {
          const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
          const calcRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
          const playerRadius = (myPlayer as any)?.visionRadius || (myPlayer as any)?.interactionRadius || calcRadius || 28;

          activeFeatures.push(
            createCircleFeature(
              [myPlayer.lng, myPlayer.lat],
              playerRadius,
              {
                id: 'player-vision-radius',
                color: '#00f2fe', // Cian táctico
                fillOpacity: 0.08,
                type: 'player-vision',
              }
            )
          );
        }

        // Sobrescribir de forma atómica la fuente GeoJSON
        source.setData({
          type: 'FeatureCollection',
          features: activeFeatures,
        });

        // Limpieza defensiva de capas huérfanas
        cleanOrphanSourcesAndLayers(map, crates || [], wildPets || [], droppedItems || []);
      } catch (err) {
        console.warn('[GameMap] Error al sincronizar círculos GeoJSON de interacción:', err);
      }
    },
    [
      structures,
      treasureLocation.lat,
      treasureLocation.lng,
      isChestOpened,
      isChestTransitioning,
      isVictory,
      isChestGuarded,
      wildPets,
      crates,
      droppedItems,
      isMeWounded,
      monsters,
      monster,
      myPlayer?.lng,
      myPlayer?.lat,
      myPlayer?.role,
      myPlayer?.pets,
      (myPlayer as any)?.visionRadius,
      (myPlayer as any)?.interactionRadius,
      isRadarActive,
      cleanOrphanSourcesAndLayers,
    ]
  );

  // Referencias para interoperabilidad y callbacks directos
  const updateInteractionCircles = syncAllInteractionCircles;
  const updateInteractionCirclesRef = useRef<(targetMap?: maplibregl.Map) => void>(syncAllInteractionCircles);
  updateInteractionCirclesRef.current = syncAllInteractionCircles;

  const updateEntityInfluenceSources = useCallback(
    (map: maplibregl.Map) => {
      syncGameBoundary(map);
      syncAllInteractionCircles(map);
      syncPlayerVision(map);
    },
    [syncGameBoundary, syncAllInteractionCircles, syncPlayerVision]
  );
  const updateEntityInfluenceSourcesRef = useRef<(map: maplibregl.Map) => void>(
    updateEntityInfluenceSources
  );
  updateEntityInfluenceSourcesRef.current = updateEntityInfluenceSources;

  const injectTacticalOverlays = setupMapLayersAndSources;
  const injectTacticalOverlaysRef = useRef<(map: maplibregl.Map) => void>(setupMapLayersAndSources);
  injectTacticalOverlaysRef.current = setupMapLayersAndSources;

  // ==========================================
  // ACTUALIZACIÓN DE OVERLAYS DE EMERGENCIA (Hospital y Perímetro Herido)
  // ==========================================
  const updateEmergencyOverlays = useCallback(
    (map: maplibregl.Map) => {
      if (!isMapStyleLoaded(map)) {
        const onStyleLoad = () => {
          if (mapRef.current === map) {
            updateEmergencyOverlaysRef.current?.(map);
          }
        };
        map.once('style.load', onStyleLoad);
        return;
      }

      try {
        const myLat = myPlayer.lat ?? center?.lat ?? INITIAL_LAT;
        const myLng = myPlayer.lng ?? center?.lng ?? INITIAL_LNG;
        updateHospitalGuidelineSync(map, myLng, myLat, isMeWounded, hospitalCoords);
      } catch (err) {
        console.warn('[GameMap] Error al actualizar overlays de emergencia:', err);
      }
    },
    [hospitalCoords, myPlayer.lat, myPlayer.lng, center?.lat, center?.lng, isMeWounded]
  );
  updateEmergencyOverlaysRef.current = updateEmergencyOverlays;

  // ==========================================
  // 2. RE-HIDRATACIÓN AUTOMÁTICA AL CAMBIAR DE MAPA (SATÉLITE ↔ TÁCTICO)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleStyleLoaded = () => {
      // 1. Recrear las fuentes y capas que map.setStyle destruyó
      setupMapLayersAndSources(map);
      // 2. Reinyectar inmediatamente los datos geométricos actualizados
      syncAllInteractionCircles(map);
      syncGameBoundary(map);
      syncPlayerVision(map);
      updateEmergencyOverlays(map);
      setStyleVersion((v) => v + 1);
      isStyleChangingRef.current = false;
    };

    // Escuchar el evento de carga del nuevo estilo
    map.on('style.load', handleStyleLoaded);

    // Si ya estaba cargado, forzar inicialización
    if (map.isStyleLoaded()) {
      handleStyleLoaded();
    }

    return () => {
      map.off('style.load', handleStyleLoaded);
    };
  }, [
    isSatelliteView,
    mapLoaded,
    setupMapLayersAndSources,
    syncAllInteractionCircles,
    syncGameBoundary,
    syncPlayerVision,
    updateEmergencyOverlays,
  ]);

  // ==========================================
  // HOOK MAESTRO REACTIVO: EJECUTA EN REPOSO ABSOLUTO E INICIALIZACIÓN
  // Sincroniza el perímetro global, todos los radios de interacción y el rango de visión
  // Desvinculado por completo de banderas de movimiento físico o zancadas
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleLoaded(map)) return;

    // 1. Perímetro global del área operativa
    syncGameBoundary(map);

    // 2. Todos los radios de interacción (estructuras, cofres, cajas, mascotas, monstruos, jugador)
    syncAllInteractionCircles(map);

    // 3. Rango de visión y actuación bajo el avatar
    syncPlayerVision(map);

    // 4. Línea de emergencia al hospital (activa en reposo y ante cambio de estado)
    syncHospitalGuideline(map);
  }, [
    mapLoaded,
    styleVersion,
    structures,
    treasureLocation.lat,
    treasureLocation.lng,
    isChestOpened,
    isChestTransitioning,
    isVictory,
    isChestGuarded,
    wildPets,
    crates,
    droppedItems,
    monsters,
    monster,
    center?.lat,
    center?.lng,
    playAreaRadius,
    myPlayer?.lat,
    myPlayer?.lng,
    myPlayer?.hp,
    myPlayer?.status,
    myPlayer?.isCriticallyWounded,
    (myPlayer as any)?.visionRadius,
    (myPlayer as any)?.interactionRadius,
    myPlayer?.role,
    myPlayer?.pets,
    isRadarActive,
    isMeWounded,
    syncGameBoundary,
    syncAllInteractionCircles,
    syncPlayerVision,
    syncHospitalGuideline,
  ]);

  // ==========================================
  // CONMUTACIÓN DINÁMICA DE ESTILO (TÁCTICO VS SATÉLITE)
  // ==========================================
  const handleToggleSatelliteView = useCallback(() => {
    const map = mapRef.current;
    if (!map || isStyleChangingRef.current) return;

    soundEffects.playRadarPing();
    soundEffects.vibrate(35);

    isStyleChangingRef.current = true;
    lastVisionPosRef.current = null;
    const nextIsSatellite = !isSatelliteView;
    setIsSatelliteView(nextIsSatellite);

    const newStyle = nextIsSatellite ? MAP_STYLES.satellite : MAP_STYLES.tactical;
    map.setStyle(newStyle as any);

    // Timeout de seguridad en caso de red lenta
    setTimeout(() => {
      isStyleChangingRef.current = false;
    }, 4000);
  }, [isSatelliteView]);

  const handleToggleMapStyle = handleToggleSatelliteView;

  const handleResetNorth = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    soundEffects.playRadarPing();
    soundEffects.vibrate(35);
    if (typeof (map as any).resetNorthPitch === 'function') {
      (map as any).resetNorthPitch({ duration: 600 });
    } else if (typeof (map as any).resetNorth === 'function') {
      (map as any).resetNorth({ duration: 600 });
    }
  }, []);

  // ==========================================
  // 1. INICIALIZACIÓN DEL MAPA WEBGL
  // ==========================================
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenterLng =
      myPlayer.lng != null && !isNaN(myPlayer.lng) && myPlayer.lng !== 0
        ? myPlayer.lng
        : (center?.lng ?? INITIAL_LNG);
    const initialCenterLat =
      myPlayer.lat != null && !isNaN(myPlayer.lat) && myPlayer.lat !== 0
        ? myPlayer.lat
        : (center?.lat ?? INITIAL_LAT);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.satellite,
      center: [initialCenterLng, initialCenterLat],
      zoom: 16.5,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });

    map.on('style.load', () => {
      injectTacticalOverlaysRef.current?.(map);
      updateEntityInfluenceSourcesRef.current?.(map);
      updateEmergencyOverlaysRef.current?.(map);
    });

    map.on('load', () => {
      isMapLoadedRef.current = true;
      setMapLoaded(true);

      // Centrar cámara inmediatamente sobre la coordenada restaurada del jugador
      if (
        myPlayer.lat != null &&
        myPlayer.lng != null &&
        !isNaN(myPlayer.lat) &&
        !isNaN(myPlayer.lng) &&
        (myPlayer.lat !== 0 || myPlayer.lng !== 0)
      ) {
        map.jumpTo({ center: [myPlayer.lng, myPlayer.lat], zoom: 17 });
      }

      injectTacticalOverlaysRef.current?.(map);
      updateEntityInfluenceSourcesRef.current?.(map);
      updateEmergencyOverlaysRef.current?.(map);
    });

    // Control de interacción de puntero y arrastre
    map.on('mousedown', (e) => {
      pointerDownPosRef.current = { x: e.point.x, y: e.point.y };
      isDraggingRef.current = false;
    });

    map.on('touchstart', (e) => {
      if (e.points && e.points[0]) {
        pointerDownPosRef.current = { x: e.points[0].x, y: e.points[0].y };
      }
      isDraggingRef.current = false;
    });

    map.on('dragstart', () => {
      isDraggingRef.current = true;
      followPlayerRef.current = false;
      setFollowPlayer(false);
    });

    map.on('drag', () => {
      isDraggingRef.current = true;
    });

    map.on('dragend', () => {
      dragEndTimeRef.current = Date.now();
      // Período de amortiguación para evitar que el mouseup final dispare un click espurio
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 120);
    });

    // Control de clic estricto para movimiento o pings
    map.on('click', (e) => {
      // 0. Descartar si el jugador está en combate
      if (inCombatRef.current) return;

      // 1. Descartar si el mapa estuvo arrastrándose activamente o finalizó hace menos de 150ms
      if (isDraggingRef.current || Date.now() - dragEndTimeRef.current < 150) {
        return;
      }

      // 2. Descartar si hubo desplazamiento físico mayor a 6px entre mousedown y click
      if (pointerDownPosRef.current) {
        const dx = e.point.x - pointerDownPosRef.current.x;
        const dy = e.point.y - pointerDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 6) {
          return;
        }
      }

      // 3. Descartar si el evento fue prevenido
      if (e.defaultPrevented) return;

      onMapClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    mapRef.current = map;

    return () => {
      monsterMarkersRef.current.forEach((m) => m.remove());
      monsterMarkersRef.current.clear();
      if (chestMarkerRef.current) {
        chestMarkerRef.current.remove();
        chestMarkerRef.current = null;
      }
      playerMarkersRef.current.forEach((m) => m.remove());
      playerMarkersRef.current.clear();
      crateMarkersRef.current.forEach((m) => m.remove());
      crateMarkersRef.current.clear();
      pingMarkersRef.current.forEach((m) => m.remove());
      pingMarkersRef.current.clear();
      structureMarkersRef.current.forEach((m) => m.remove());
      structureMarkersRef.current.clear();
      droppedItemMarkersRef.current.forEach((m) => m.remove());
      droppedItemMarkersRef.current.clear();
      wildPetMarkersRef.current.forEach((m) => m.remove());
      wildPetMarkersRef.current.clear();
      companionPetMarkersRef.current.forEach((m) => m.remove());
      companionPetMarkersRef.current.clear();

      playerKinematicsRef.current.forEach((kin) => {
        if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
        if (kin.flankWatchInterval) {
          clearInterval(kin.flankWatchInterval);
          kin.flankWatchInterval = null;
        }
      });
      playerKinematicsRef.current.clear();

      monsterKinematicsRef.current.forEach((kin) => {
        if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
      });
      monsterKinematicsRef.current.clear();

      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
      setMapLoaded(false);
    };
  }, []);


  // ==========================================
  // 4. SEGUIMIENTO DE CÁMARA (Aislado, 60 FPS sin interrumpir arrastre)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current || !followPlayerRef.current) return;
    if (isDraggingRef.current) return; // Nunca interrumpir el arrastre del usuario

    if (myPlayer.lat != null && myPlayer.lng != null) {
      if (lastCameraPosRef.current) {
        const moved = getDistanceMeters(lastCameraPosRef.current, { lat: myPlayer.lat, lng: myPlayer.lng });
        if (moved < 0.5) return;
      }
      lastCameraPosRef.current = { lat: myPlayer.lat, lng: myPlayer.lng };

      map.easeTo({
        center: [myPlayer.lng, myPlayer.lat],
        duration: 300,
        easing: (t) => t,
      });
    }
  }, [myPlayer.lat, myPlayer.lng, followPlayer]);

  // Si cambia el centro del juego y aún no hay jugador posicionado
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!myPlayer.lat || !myPlayer.lng) {
      map.flyTo({
        center: [center.lng, center.lat],
        zoom: 16.5,
        duration: 800,
      });
    }
  }, [center.lat, center.lng]);

  // ==========================================
  // 5. MARCADOR DEL COFRE DEL TESORO
  // ==========================================
  const activeChestCoordsRef = useRef<Coordinates>(treasureLocation);
  activeChestCoordsRef.current = treasureLocation;

  useEffect(() => {
    if (treasureLocation?.lat && treasureLocation?.lng) {
      activeChestCoordsRef.current = {
        lat: treasureLocation.lat,
        lng: treasureLocation.lng,
      };
    }
  }, [treasureLocation?.lat, treasureLocation?.lng]);

  // Comprobación reactiva de monstruos hostiles custodiando el perímetro del cofre (<= 25m)
  const computedIsChestGuarded = useMemo(() => {
    if (isChestGuarded != null) return isChestGuarded;
    if (!treasureLocation.lat || !treasureLocation.lng) return false;
    const all = monsters && monsters.length > 0 ? monsters : (monster ? [monster] : []);
    return all.some((m) => {
      if (
        !isMonsterAlive(m) ||
        (m as any).isDead ||
        m.status === 'defeated' ||
        m.status === 'wounded' ||
        m.state === 'defeated' ||
        m.state === 'wounded' ||
        m.state === 'dead' ||
        m.hp <= 0
      ) {
        return false;
      }
      const d = getDistanceMeters({ lat: m.lat, lng: m.lng }, treasureLocation);
      return d <= 25;
    });
  }, [isChestGuarded, monsters, monster, treasureLocation.lat, treasureLocation.lng]);

  const handleChestMarkerClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      const targetCoords = activeChestCoordsRef.current;
      if (!targetCoords || !targetCoords.lat || !targetCoords.lng) return;

      const myPos = {
        lat: myPlayerRef.current?.lat ?? center.lat,
        lng: myPlayerRef.current?.lng ?? center.lng,
      };
      const currentDist = getDistanceMeters(myPos, targetCoords);

      // Si ya está a rango (<= 15m), delegar en el manejador del cofre (comprobando custodia)
      if (currentDist <= 15) {
        if (!computedIsChestGuarded) {
          hasTriggeredChestInMapRef.current = true;
        }
        onOpenChestRef.current?.();
        return;
      }

      // Si está lejos, iniciar el desplazamiento hacia la coordenada ACTUAL (Cofre 3)
      onMapClickRef.current?.(targetCoords);
    },
    [center.lat, center.lng, computedIsChestGuarded]
  );
  const handleChestMarkerClickRef = useRef(handleChestMarkerClick);
  handleChestMarkerClickRef.current = handleChestMarkerClick;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!treasureLocation.lat || !treasureLocation.lng) {
      if (chestMarkerRef.current) {
        chestMarkerRef.current.remove();
        chestMarkerRef.current = null;
      }
      return;
    }

    const isOpened = isChestOpened || isVictory;

    const chestContentHtml = isOpened
      ? `
        <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
          <div class="relative flex items-center justify-center">
            <img 
              src="/assets/icons/chests/chest-looted.png" 
              alt="Cofre Saqueado" 
              width="42" 
              height="42" 
              class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_6px_10px_rgba(0,0,0,0.9)] drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" 
              style="width: 42px !important; height: 42px !important; max-width: 42px !important; max-height: 42px !important;" 
            />
          </div>
          <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-emerald-500/60 text-emerald-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
            Cofre Abierto
          </span>
        </div>
      `
      : computedIsChestGuarded
      ? `
        <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 bg-red-600/30 rounded-full animate-ping pointer-events-none"></div>
            <img 
              src="/assets/icons/chests/chest-guarded.png" 
              alt="Cofre Custodiado" 
              width="42" 
              height="42" 
              class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 animate-pulse drop-shadow-[0_6px_10px_rgba(0,0,0,0.9)] drop-shadow-[0_0_12px_rgba(239,68,68,0.7)]" 
              style="width: 42px !important; height: 42px !important; max-width: 42px !important; max-height: 42px !important;" 
            />
          </div>
          <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-red-500/70 text-red-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
            ⚠️ Custodiado
          </span>
        </div>
      `
      : `
        <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 bg-amber-500/25 rounded-full animate-ping pointer-events-none"></div>
            <img 
              src="/assets/icons/chests/chest-active.png" 
              alt="Cofre Activo" 
              width="42" 
              height="42" 
              class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_6px_10px_rgba(0,0,0,0.9)] drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]" 
              style="width: 42px !important; height: 42px !important; max-width: 42px !important; max-height: 42px !important;" 
            />
          </div>
          <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-amber-500/50 text-amber-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
            Tesoro
          </span>
        </div>
      `;

    if (!chestMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'map-marker-anchor marker-chest treasure-marker';
      el.setAttribute('data-entity', 'chest');
      el.style.pointerEvents = 'none';
      if (isMeWounded) {
        el.style.display = 'none';
      }
      el.innerHTML = chestContentHtml;
      el.onclick = (e) => handleChestMarkerClickRef.current(e);

      chestMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([treasureLocation.lng, treasureLocation.lat])
        .addTo(map);
    } else {
      chestMarkerRef.current.setLngLat([treasureLocation.lng, treasureLocation.lat]);
      const el = chestMarkerRef.current.getElement();
      if (el) {
        el.className = 'map-marker-anchor marker-chest treasure-marker';
        el.setAttribute('data-entity', 'chest');
        el.style.pointerEvents = 'none';
        el.style.display = isMeWounded ? 'none' : 'block';
        el.innerHTML = chestContentHtml;
        el.onclick = (e) => handleChestMarkerClickRef.current(e);
      }
    }
  }, [treasureLocation.lat, treasureLocation.lng, isMeWounded, isChestOpened, isVictory, computedIsChestGuarded]);

  // ==========================================
  // 5.1. APERTURA AUTOMÁTICA DEL COFRE POR PROXIMIDAD DIRECTA EN MAPA (<= 15m)
  // ==========================================
  useEffect(() => {
    if (!myPlayer.lat || !myPlayer.lng || !treasureLocation.lat || !treasureLocation.lng) return;
    if (inCombat || isMeWounded || isChestOpened || isVictory || isChestLockModalOpen || isChestTransitioning || computedIsChestGuarded) return;

    const myPos = { lat: myPlayer.lat, lng: myPlayer.lng };
    const dist = getDistanceMeters(myPos, treasureLocation);
    if (dist <= 15) {
      if (!hasTriggeredChestInMapRef.current) {
        hasTriggeredChestInMapRef.current = true;
        onOpenChestRef.current?.();
      }
    } else {
      hasTriggeredChestInMapRef.current = false;
    }
  }, [
    myPlayer.lat,
    myPlayer.lng,
    treasureLocation.lat,
    treasureLocation.lng,
    inCombat,
    isMeWounded,
    isChestOpened,
    isVictory,
    isChestLockModalOpen,
    isChestTransitioning,
    computedIsChestGuarded,
  ]);

  // ==========================================
  // 6. MARCADORES Y RADIOS DE CAJAS DE SUMINISTROS (AIRDROPS)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Actualizar zonas de interacción de 40m translúcidas en el mapa
    updateInteractionCirclesRef.current?.(map);

    const currentCrateIds = new Set(
      crates.filter((c) => !c.opened && !c.isCollected && !c.looted).map((c) => c.id)
    );
    let removedAnyCrate = false;
    crateMarkersRef.current.forEach((marker, id) => {
      if (!currentCrateIds.has(id)) {
        marker.remove();
        crateMarkersRef.current.delete(id);
        removedAnyCrate = true;
      }
    });
    if (removedAnyCrate) {
      updateInteractionCirclesRef.current?.(map);
    }

    crates.forEach((crate) => {
      if (crate.opened || crate.isCollected || crate.looted) {
        if (crateMarkersRef.current.has(crate.id)) {
          crateMarkersRef.current.get(crate.id)?.remove();
          crateMarkersRef.current.delete(crate.id);
          updateInteractionCirclesRef.current?.(map);
        }
        return;
      }

      const info = getCrateVisualInfo(crate);

      if (!crateMarkersRef.current.has(crate.id)) {
        const el = document.createElement('div');
        el.className = 'map-marker-anchor marker-crate';
        el.setAttribute('data-entity', 'crate');
        el.style.pointerEvents = 'none';
        if (isMeWounded) {
          el.style.display = 'none';
        }

        const isDescending = Date.now() - crate.droppedAt < 5000;

        if (isDescending) {
          const remainingMs = Math.max(300, 5000 - (Date.now() - crate.droppedAt));
          el.innerHTML = `
            <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
              <div class="airdrop-inner airdrop-sway-anim flex flex-col items-center pointer-events-auto">
                <div class="airdrop-parachute flex flex-col items-center pointer-events-none mb-[-2px]">
                  <div class="relative flex items-center justify-center">
                    <svg viewBox="0 0 64 38" width="44" height="26" style="width: 44px !important; height: 26px !important; max-width: 44px !important; max-height: 26px !important;" class="drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)]">
                      <path d="M 4 34 C 4 6, 60 6, 60 34 C 50 30, 42 30, 32 32 C 22 30, 14 30, 4 34 Z" fill="#15803d" stroke="#86efac" stroke-width="1.5"/>
                      <path d="M 18 31 C 20 12, 44 12, 46 31 C 39 31, 25 31, 18 31 Z" fill="#166534"/>
                      <line x1="32" y1="9" x2="32" y2="32" stroke="#86efac" stroke-width="1" stroke-dasharray="2,2"/>
                      <line x1="6" y1="33" x2="32" y2="42" stroke="#e2e8f0" stroke-width="1.2" opacity="0.85"/>
                      <line x1="22" y1="31" x2="32" y2="42" stroke="#e2e8f0" stroke-width="1.2" opacity="0.85"/>
                      <line x1="42" y1="31" x2="32" y2="42" stroke="#e2e8f0" stroke-width="1.2" opacity="0.85"/>
                      <line x1="58" y1="33" x2="32" y2="42" stroke="#e2e8f0" stroke-width="1.2" opacity="0.85"/>
                    </svg>
                  </div>
                </div>
                <div class="relative flex items-center justify-center">
                  <div class="absolute w-10 h-10 ${info.glowColor} rounded-full animate-ping pointer-events-none"></div>
                  <img 
                    src="${info.icon}" 
                    alt="${info.label}" 
                    width="32" 
                    height="32" 
                    class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)]" 
                    style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important;" 
                  />
                </div>
                <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${info.borderColor} ${info.textColor} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
                  ${info.label} (40m)
                </span>
              </div>
            </div>
          `;

          // Al completarse el tiempo de descenso, plegar/retirar paracaídas y remover la animación de vaivén
          setTimeout(() => {
            const parachuteEl = el.querySelector('.airdrop-parachute');
            if (parachuteEl) {
              parachuteEl.classList.add('parachute-fold-anim');
              setTimeout(() => parachuteEl.remove(), 800);
            }
            const innerEl = el.querySelector('.airdrop-inner');
            if (innerEl) {
              innerEl.classList.remove('airdrop-sway-anim');
            }
          }, remainingMs);
        } else {
          el.innerHTML = `
            <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
              <div class="relative flex items-center justify-center">
                <div class="absolute w-10 h-10 ${info.glowColor} rounded-full animate-ping pointer-events-none"></div>
                <img 
                  src="${info.icon}" 
                  alt="${info.label}" 
                  width="32" 
                  height="32" 
                  class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)]" 
                  style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important;" 
                />
              </div>
              <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${info.borderColor} ${info.textColor} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
                ${info.label} (40m)
              </span>
            </div>
          `;
        }

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onMapClickRef.current?.({ lat: crate.lat, lng: crate.lng });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([crate.lng, crate.lat])
          .addTo(map);

        crateMarkersRef.current.set(crate.id, marker);
      } else {
        const marker = crateMarkersRef.current.get(crate.id);
        marker?.setLngLat([crate.lng, crate.lat]);
        const el = marker?.getElement();
        if (el) {
          el.className = 'map-marker-anchor marker-crate';
          el.setAttribute('data-entity', 'crate');
          el.style.pointerEvents = 'none';
          el.style.display = isMeWounded ? 'none' : 'block';
        }
      }
    });
  }, [crates, isMeWounded, mapLoaded, styleVersion]);

  // ==========================================
  // 6.5. MARCADORES Y RADIOS DE ESTRUCTURAS TÁCTICAS (Hospital y Refugios)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Actualizar zonas de interacción en el mapa
    if (isMapStyleLoaded(map)) {
      try {
        const source = map.getSource('structures-zones') as maplibregl.GeoJSONSource | undefined;
        if (source) {
          const visibleStructures = isMeWounded
            ? structures.filter((s) => {
                const t = String(s.type || '').toLowerCase();
                const id = String(s.id || '').toLowerCase();
                const n = String(s.name || '').toLowerCase();
                return t === 'hospital' || id.includes('hospital') || n.includes('hospital');
              })
            : structures;
          const features = visibleStructures
            .filter(
              (s) =>
                typeof s.lat === 'number' &&
                typeof s.lng === 'number' &&
                !isNaN(s.lat) &&
                !isNaN(s.lng) &&
                (s.lat !== 0 || s.lng !== 0)
            )
            .map((s) => {
              const circle = createGeoJsonCircle({ lat: s.lat, lng: s.lng }, s.radius);
              return {
                ...circle,
                properties: {
                  ...circle.properties,
                  type: s.type,
                  id: s.id,
                },
              };
            });
          source.setData({
            type: 'FeatureCollection',
            features,
          });
        }
      } catch (err) {
        console.warn('[GameMap] Error al actualizar zonas de estructuras:', err);
      }
    }

    const currentStructureIds = new Set(structures.map((s) => s.id));
    structureMarkersRef.current.forEach((marker, id) => {
      if (!currentStructureIds.has(id)) {
        marker.remove();
        structureMarkersRef.current.delete(id);
      }
    });

    structures.forEach((structure) => {
      const isHospital =
        String(structure.type || '').toLowerCase() === 'hospital' ||
        String(structure.id || '').toLowerCase().includes('hospital') ||
        String(structure.name || '').toLowerCase().includes('hospital');
      const badgeBorder = isHospital ? 'border-emerald-400' : 'border-cyan-400';
      const badgeText = isHospital ? 'text-emerald-300' : 'text-cyan-300';
      const icon = isHospital ? '/assets/icons/structures/structure-hospital.png' : '/assets/icons/structures/structure-shelter.png';
      const aura = isHospital ? 'bg-emerald-500/25 animate-ping' : 'bg-cyan-500/20';
      const label = isHospital ? `HOSPITAL (${structure.radius}m)` : `${structure.name.toUpperCase()} (${structure.radius}m)`;

      if (!structureMarkersRef.current.has(structure.id)) {
        const el = document.createElement('div');
        el.className = `map-marker-anchor marker-structure structure-marker-${structure.id}`;
        el.setAttribute('data-entity', 'structure');
        el.style.pointerEvents = 'none';
        if (isMeWounded && !isHospital) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="marker-content flex flex-col items-center select-none pointer-events-none" style="pointer-events: auto;">
            <div class="relative flex items-center justify-center">
              <div class="absolute w-20 h-20 ${aura} rounded-full pointer-events-none"></div>
              <img 
                src="${icon}" 
                alt="${structure.name}" 
                width="68" 
                height="68" 
                class="marker-entity-img select-none drop-shadow-[0_10px_18px_rgba(0,0,0,0.95)] ${isHospital ? 'drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'drop-shadow-[0_0_8px_rgba(0,242,254,0.3)]'}" 
                style="width: 68px !important; height: 68px !important; max-width: 68px !important; max-height: 68px !important;" 
              />
            </div>
            <span class="marker-label mt-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${badgeBorder} ${badgeText} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
              ${label}
            </span>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([structure.lng, structure.lat])
          .addTo(map);

        structureMarkersRef.current.set(structure.id, marker);
      } else {
        const marker = structureMarkersRef.current.get(structure.id);
        marker?.setLngLat([structure.lng, structure.lat]);
        const el = marker?.getElement();
        if (el) {
          el.className = `map-marker-anchor marker-structure structure-marker-${structure.id}`;
          el.setAttribute('data-entity', 'structure');
          el.style.pointerEvents = 'none';
          el.style.display = (isMeWounded && !isHospital) ? 'none' : 'block';
        }
      }
    });
  }, [structures, isMeWounded, mapLoaded, styleVersion]);

  // ==========================================
  // 6.6. MARCADORES DE OBJETOS DESCARTADOS EN EL MAPA
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!center.lat || !center.lng || (center.lat === 0 && center.lng === 0)) return;

    const currentDroppedIds = new Set(
      droppedItems
        .filter(
          (d) =>
            !d.isCollected &&
            typeof d.lat === 'number' &&
            typeof d.lng === 'number' &&
            !isNaN(d.lat) &&
            !isNaN(d.lng) &&
            (d.lat !== 0 || d.lng !== 0)
        )
        .map((d) => d.id)
    );
    let removedAnyDropped = false;
    droppedItemMarkersRef.current.forEach((marker, id) => {
      if (!currentDroppedIds.has(id)) {
        marker.remove();
        droppedItemMarkersRef.current.delete(id);
        removedAnyDropped = true;
      }
    });
    if (removedAnyDropped) {
      updateInteractionCirclesRef.current?.(map);
    }

    const getTierStyle = (item: { tier: number; category?: string; type?: string }) => {
      if (item.category === 'health' || item.type === 'medkit') {
        return { border: 'border-emerald-500/50', text: 'text-emerald-300', aura: 'bg-emerald-500/25', glow: 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]', icon: '/assets/icons/crates/crate-medkit.png' };
      }
      if (item.category === 'ammo' || item.type === 'ammo') {
        return { border: 'border-amber-400/50', text: 'text-amber-300', aura: 'bg-amber-500/25', glow: 'drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]', icon: '/assets/icons/crates/crate-ammo.png' };
      }
      switch (item.tier) {
        case 7:
          return { border: 'border-red-500/50', text: 'text-red-300', aura: 'bg-red-500/30', glow: 'drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]', icon: '/assets/icons/weapons/weapon-rpg.png' };
        case 6:
          return { border: 'border-orange-500/50', text: 'text-orange-300', aura: 'bg-orange-500/30', glow: 'drop-shadow-[0_0_10px_rgba(249,115,22,0.6)]', icon: '/assets/icons/weapons/weapon-grenade.png' };
        case 5:
          return { border: 'border-cyan-400/50', text: 'text-cyan-300', aura: 'bg-cyan-500/30', glow: 'drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]', icon: '/assets/icons/weapons/weapon-rifle.png' };
        case 4:
          return { border: 'border-purple-400/50', text: 'text-purple-300', aura: 'bg-purple-500/30', glow: 'drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]', icon: '/assets/icons/weapons/weapon-shotgun.png' };
        case 3:
          return { border: 'border-blue-400/50', text: 'text-blue-300', aura: 'bg-blue-500/30', glow: 'drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]', icon: '/assets/icons/weapons/weapon-pistol.png' };
        case 2:
          return { border: 'border-amber-400/50', text: 'text-amber-300', aura: 'bg-amber-500/30', glow: 'drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]', icon: '/assets/icons/weapons/weapon-axe.png' };
        default:
          return { border: 'border-emerald-400/50', text: 'text-emerald-300', aura: 'bg-emerald-500/30', glow: 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]', icon: '/assets/icons/weapons/weapon-knife.png' };
      }
    };

    droppedItems.forEach((dropped) => {
      if (
        typeof dropped.lat !== 'number' ||
        typeof dropped.lng !== 'number' ||
        isNaN(dropped.lat) ||
        isNaN(dropped.lng) ||
        (dropped.lat === 0 && dropped.lng === 0)
      ) {
        return;
      }

      if (!droppedItemMarkersRef.current.has(dropped.id)) {
        const style = getTierStyle(dropped.item);
        const el = document.createElement('div');
        el.className = `map-marker-anchor marker-loot dropped-item-${dropped.id}`;
        el.setAttribute('data-entity', 'crate');
        el.style.pointerEvents = 'none';
        if (isMeWounded) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="marker-content flex flex-col items-center select-none cursor-pointer group" style="pointer-events: auto;">
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 ${style.aura} rounded-full animate-ping pointer-events-none"></div>
              <img 
                src="${style.icon}" 
                alt="${dropped.item.name}" 
                width="32" 
                height="32" 
                style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important;" 
                class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)]" 
              />
            </div>
            <span class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${style.border} ${style.text} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
              ${dropped.item.name} (T${dropped.item.tier})
            </span>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const myPos = {
            lat: myPlayer.lat ?? center.lat,
            lng: myPlayer.lng ?? center.lng,
          };
          const dist = getDistanceMeters(myPos, { lat: dropped.lat, lng: dropped.lng });
          if (dist <= 25) {
            onPickDroppedItemRef.current?.(dropped);
          } else {
            onMapClickRef.current?.({ lat: dropped.lat, lng: dropped.lng });
            onPickDroppedItemRef.current?.(dropped);
          }
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([dropped.lng, dropped.lat])
          .addTo(map);

        droppedItemMarkersRef.current.set(dropped.id, marker);
      } else {
        const marker = droppedItemMarkersRef.current.get(dropped.id);
        marker?.setLngLat([dropped.lng, dropped.lat]);
        const el = marker?.getElement();
        if (el) {
          el.className = `map-marker-anchor marker-loot dropped-item-${dropped.id}`;
          el.setAttribute('data-entity', 'crate');
          el.style.pointerEvents = 'none';
          el.style.display = isMeWounded ? 'none' : 'block';
        }
      }
    });
  }, [droppedItems, isMeWounded, mapLoaded, center.lat, center.lng]);

  // ==========================================
  // 6.7. MARCADORES DE MASCOTAS SILVESTRES (PETS EN EL MAPA)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!center.lat || !center.lng || (center.lat === 0 && center.lng === 0)) return;

    const currentWildPetIds = new Set(
      wildPets.filter((wp) => !wp.isTamed && !wp.isCollected).map((wp) => wp.id)
    );

    // Limpiar mascotas que ya fueron adoptadas o eliminadas
    let removedAnyPet = false;
    wildPetMarkersRef.current.forEach((marker, id) => {
      if (!currentWildPetIds.has(id)) {
        marker.remove();
        wildPetMarkersRef.current.delete(id);
        removedAnyPet = true;
      }
    });
    if (removedAnyPet) {
      updateInteractionCirclesRef.current?.(map);
    }

    wildPets.forEach((wp) => {
      if (wp.isTamed || wp.isCollected) {
        if (wildPetMarkersRef.current.has(wp.id)) {
          wildPetMarkersRef.current.get(wp.id)?.remove();
          wildPetMarkersRef.current.delete(wp.id);
          updateInteractionCirclesRef.current?.(map);
        }
        return;
      }
      // Guardia estricta de coordenadas válidas (evitar proyección en 0,0)
      if (
        typeof wp.lat !== 'number' ||
        typeof wp.lng !== 'number' ||
        isNaN(wp.lat) ||
        isNaN(wp.lng) ||
        (wp.lat === 0 && wp.lng === 0)
      ) {
        return;
      }

      if (!wildPetMarkersRef.current.has(wp.id)) {
        const el = document.createElement('div');
        el.className = 'map-marker-anchor marker-pet pet-marker-container';
        el.setAttribute('data-entity', 'pet');
        el.style.pointerEvents = 'none';
        el.style.zIndex = '35'; // Visible por encima del canvas
        el.style.display = isMeWounded ? 'none' : 'block';
        const hasMaxPets = (myPlayer.pets || []).length >= MAX_PETS_PER_PLAYER;
        el.title = hasMaxPets
          ? 'Capacidad máxima de mascotas (3/3): Comitiva completa'
          : `Mascota silvestre: ${wp.pet.name} (Toca para adoptar)`;

        el.innerHTML = `
          <div class="marker-content flex flex-col items-center select-none cursor-pointer group" style="pointer-events: auto;">
            <!-- Icono 3D de Mascota con pulso táctico -->
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 rounded-full bg-emerald-400/30 animate-ping pointer-events-none"></div>
              <img 
                src="${wp.pet.icon}" 
                alt="${wp.pet.name}" 
                width="34" 
                height="34" 
                style="width: 34px !important; height: 34px !important; max-width: 34px !important; max-height: 34px !important;" 
                class="marker-entity-img select-none transition-transform duration-150 group-hover:scale-110 drop-shadow-[0_4px_6px_rgba(0,0,0,0.85)] drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]" 
              />
            </div>
            <!-- Etiqueta del nombre centrada bajo el avatar -->
            <div class="marker-label mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-emerald-500/80 text-emerald-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
              ${wp.pet.name}
            </div>
          </div>
        `;

        const handlePetClick = (e: MouseEvent) => {
          e.stopPropagation();
          const hasMaxPetsNow = (myPlayerRef.current?.pets || []).length >= MAX_PETS_PER_PLAYER;
          if (hasMaxPetsNow) {
            // Notificar capacidad máxima e iniciar desplazamiento automático hacia las coordenadas de la mascota
            onMapClickRef.current?.({ lat: wp.lat, lng: wp.lng });
            onAdoptWildPetRef.current?.(wp);
            return;
          }

          const myPos = {
            lat: myPlayerRef.current?.lat ?? center.lat,
            lng: myPlayerRef.current?.lng ?? center.lng,
          };
          const dist = getDistanceMeters(myPos, { lat: wp.lat, lng: wp.lng });
          if (dist <= 25) {
            onAdoptWildPetRef.current?.(wp);
          } else {
            onMapClickRef.current?.({ lat: wp.lat, lng: wp.lng });
            onAdoptWildPetRef.current?.(wp);
          }
        };

        el.onclick = handlePetClick;

        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);

        wildPetMarkersRef.current.set(wp.id, marker);
      } else {
        const marker = wildPetMarkersRef.current.get(wp.id);
        marker?.setLngLat([wp.lng, wp.lat]);
        const el = marker?.getElement();
        if (el) {
          el.className = 'map-marker-anchor marker-pet pet-marker-container';
          el.setAttribute('data-entity', 'pet');
          el.style.pointerEvents = 'none';
          el.style.display = isMeWounded ? 'none' : 'block';
          const hasMaxPets = (myPlayer.pets || []).length >= MAX_PETS_PER_PLAYER;
          el.title = hasMaxPets
            ? 'Capacidad máxima de mascotas (3/3): Comitiva completa'
            : `Mascota silvestre: ${wp.pet.name} (Toca para adoptar)`;

          el.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            const hasMaxPetsNow = (myPlayerRef.current?.pets || []).length >= MAX_PETS_PER_PLAYER;
            if (hasMaxPetsNow) {
              onMapClickRef.current?.({ lat: wp.lat, lng: wp.lng });
              onAdoptWildPetRef.current?.(wp);
              return;
            }

            const myPos = {
              lat: myPlayerRef.current?.lat ?? center.lat,
              lng: myPlayerRef.current?.lng ?? center.lng,
            };
            const dist = getDistanceMeters(myPos, { lat: wp.lat, lng: wp.lng });
            if (dist <= 25) {
              onAdoptWildPetRef.current?.(wp);
            } else {
              onMapClickRef.current?.({ lat: wp.lat, lng: wp.lng });
              onAdoptWildPetRef.current?.(wp);
            }
          };
        }
      }
    });
  }, [wildPets, mapLoaded, center?.lat, center?.lng, isMeWounded, myPlayer.pets?.length]);

  // ==========================================
  // 6.8. RADIOS DE INTERACCIÓN DE ENTIDADES (LOOT Y MASCOTAS, 25M)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateInteractionCirclesRef.current?.(map);
  }, [droppedItems, wildPets, isMeWounded, mapLoaded, styleVersion]);

  // ==========================================
  // 7. MARCADORES DE MONSTRUOS (Anclaje nativo MapLibre GL y niebla de guerra)
  // ==========================================
  const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
  const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
  const visionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
  const activeMonstersList = monsters && monsters.length > 0 ? monsters : [monster];

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMonsterIds = new Set<string>();

    activeMonstersList.forEach((m, idx) => {
      const monsterKey = m.id || `monster_${idx}`;
      currentMonsterIds.add(monsterKey);

      const distToMonster = getDistanceMeters(myCoords, m);
      const isDefeated = m.status === 'wounded' || m.status === 'defeated' || m.state === 'dead' || m.state === 'defeated' || m.state === 'wounded' || m.hp <= 0;
      const isVisible = (distToMonster <= Math.max(visionRadius, isDefeated ? 90 : visionRadius) || isRadarActive);

      let kin = monsterKinematicsRef.current.get(monsterKey);
      if (!kin) {
        kin = {
          anchorLat: m.lat,
          anchorLng: m.lng,
          isMoving: false,
          facingMode: 'right',
          stopTimeout: null,
        };
        monsterKinematicsRef.current.set(monsterKey, kin);
      }

      const visual = getMonsterVisualConfig(m);
      const monsterTypeStr = m.type || 'stalker';

      const renderMonsterContent = (defeated: boolean) => {
        if (defeated) {
          return `
            <div class="marker-container flex flex-col items-center select-none pointer-events-none">
              <!-- Cadáver táctico: derribado en el suelo, desaturado al 100%, sin brillos ni halos -->
              <div class="monster-corpse-marker relative flex items-center justify-center pointer-events-none">
                <img 
                  src="${visual.icon || `/assets/icons/monsters/monster-${monsterTypeStr}.png`}" 
                  alt="${m.name || visual.label}"
                  width="44" 
                  height="44" 
                  style="width: 44px !important; height: 44px !important; max-width: 44px !important; max-height: 44px !important; object-fit: contain;" 
                  class="select-none pointer-events-none"
                />
              </div>

              <!-- Insignia táctica sobria de baja neutralizada (fondo carbón, texto apagado) -->
              <span class="mt-1 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 text-[9px] font-mono font-bold tracking-wider text-slate-400 uppercase whitespace-nowrap shadow-md backdrop-blur-sm pointer-events-none">
                💀 ${m.name || visual.label} (ABATIDO)
              </span>
            </div>
          `;
        }
        return `
          <div class="marker-content flex flex-col items-center select-none cursor-pointer ${visual.scaleClass}">
            <div class="relative flex items-center justify-center">
              <div class="w-14 h-14 ${visual.pingBg} rounded-full animate-ping absolute pointer-events-none"></div>
              
              <!-- Barra de vida (fuera de capas animadas de escala y oscilación) -->
              <div class="absolute -top-4 w-16 bg-black/80 rounded h-1.5 overflow-hidden border ${visual.hpBorderColor}">
                <div id="monster-hp-bar-${monsterKey}" class="${visual.hpBarColor} h-full transition-all duration-300" style="width: 100%"></div>
              </div>

              <!-- 1. Capa Externa: Rebote Procedural (translateY + compresión) -->
              <div id="monster-bounce-${monsterKey}" class="${kin.isMoving ? 'marker-stepping' : ''} flex flex-col items-center">
                <!-- 2. Capa Interna: Orientación de Mirada (scaleX dinámico o scan) -->
                <div id="monster-facing-${monsterKey}" class="${getFacingClass(kin.facingMode, kin.isMoving)} flex items-center justify-center">
                  <img 
                    src="${visual.icon}" 
                    alt="${m.name || visual.label}" 
                    width="48" 
                    height="48" 
                    style="width: 48px !important; height: 48px !important; max-width: 48px !important; max-height: 48px !important;" 
                    class="marker-entity-img select-none drop-shadow-[0_6px_12px_rgba(0,0,0,0.95)] drop-shadow-[0_0_10px_rgba(239,68,68,0.7)]" 
                  />
                </div>
              </div>

              <!-- Placa táctica con distintivo y nombre de la amenaza (fuera de capas animadas) -->
              <div id="monster-badge-${monsterKey}" class="absolute -bottom-5 whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${visual.badgeBg} border ${visual.borderColor}/60 shadow-md pointer-events-none backdrop-blur-sm">
                ${m.name || visual.label}
              </div>
            </div>
          </div>
        `;
      };

      let marker = monsterMarkersRef.current.get(monsterKey);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'map-marker-anchor marker-monster monster-map-marker';
        el.setAttribute('data-entity', 'monster');
        el.setAttribute('data-defeated', isDefeated ? 'true' : 'false');
        if (isDefeated) {
          el.style.pointerEvents = 'none';
          el.style.cursor = 'default';
          el.onclick = null;
        } else {
          el.style.pointerEvents = 'auto';
          el.style.cursor = 'pointer';
          el.onclick = (e) => {
            e.stopPropagation();
            onMonsterClickRef.current?.(m);
          };
        }
        el.innerHTML = renderMonsterContent(isDefeated);

        marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([m.lng, m.lat])
          .addTo(map);

        monsterMarkersRef.current.set(monsterKey, marker);
      } else {
        marker.setLngLat([m.lng, m.lat]);
        const el = marker.getElement();
        if (el) {
          el.className = 'map-marker-anchor marker-monster monster-map-marker';
          el.setAttribute('data-entity', 'monster');
          if (isDefeated) {
            el.style.pointerEvents = 'none';
            el.style.cursor = 'default';
            el.onclick = null;
          } else {
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'pointer';
            el.onclick = (e) => {
              e.stopPropagation();
              onMonsterClickRef.current?.(m);
            };
          }

          const wasDefeated = el.getAttribute('data-defeated') === 'true';
          if (wasDefeated !== isDefeated) {
            el.setAttribute('data-defeated', isDefeated ? 'true' : 'false');
            el.innerHTML = renderMonsterContent(isDefeated);
          }
        }
        const hpBar = document.getElementById(`monster-hp-bar-${monsterKey}`);
        if (hpBar) {
          hpBar.style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
        }
        const badge = document.getElementById(`monster-badge-${monsterKey}`);
        if (badge && m.name && badge.textContent !== m.name) {
          badge.textContent = m.name;
        }

        if (isDefeated) {
          if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
          kin.isMoving = false;
          kin.stopTimeout = null;
          updateKinematicsDOM(`monster-bounce-${monsterKey}`, `monster-facing-${monsterKey}`, false, 'right');
        } else {
          // Cinemática del monstruo
          const mov = computeEntityMovement(m.lat, m.lng, kin.anchorLat, kin.anchorLng);
          if (mov.isMoving) {
            kin.isMoving = true;
            kin.facingMode = mov.facingMode;
            kin.anchorLat = m.lat;
            kin.anchorLng = m.lng;

            if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
            const currentKin = kin;
            currentKin.stopTimeout = setTimeout(() => {
              currentKin.isMoving = false;
              currentKin.stopTimeout = null;
              currentKin.anchorLat = m.lat;
              currentKin.anchorLng = m.lng;
              updateKinematicsDOM(`monster-bounce-${monsterKey}`, `monster-facing-${monsterKey}`, false, currentKin.facingMode);
            }, 600);

            updateKinematicsDOM(`monster-bounce-${monsterKey}`, `monster-facing-${monsterKey}`, true, kin.facingMode);
          }
        }
      }

      const el = marker.getElement();
      if (el) {
        el.style.display = !isMeWounded && isVisible ? 'block' : 'none';
      }
    });

    // Limpiar marcadores de monstruos que ya no estén presentes
    monsterMarkersRef.current.forEach((marker, id) => {
      if (!currentMonsterIds.has(id)) {
        const kin = monsterKinematicsRef.current.get(id);
        if (kin?.stopTimeout) clearTimeout(kin.stopTimeout);
        monsterKinematicsRef.current.delete(id);
        marker.remove();
        monsterMarkersRef.current.delete(id);
      }
    });
  }, [activeMonstersList, isMeWounded, visionRadius, isRadarActive, myCoords.lat, myCoords.lng]);

  // ==========================================
  // 8. MARCADORES DE JUGADORES (Direct DOM update sin lag)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!center.lat || !center.lng || (center.lat === 0 && center.lng === 0)) return;

    const allPlayers = players.map((p) => (p.id === myPlayer.id ? myPlayer : p));
    const activePlayerIds = new Set(allPlayers.map((p) => p.id));

    playerMarkersRef.current.forEach((marker, id) => {
      if (!activePlayerIds.has(id)) {
        const kin = playerKinematicsRef.current.get(id);
        if (kin?.stopTimeout) clearTimeout(kin.stopTimeout);
        if (kin?.flankWatchInterval) {
          clearInterval(kin.flankWatchInterval);
          kin.flankWatchInterval = null;
        }
        playerKinematicsRef.current.delete(id);
        marker.remove();
        playerMarkersRef.current.delete(id);
      }
    });

    const getPlayerRoleIcon = (role?: string) => {
      const normalized = (role || 'scout').toLowerCase();
      const validRoles = ['scout', 'medic', 'tank', 'marksman'];
      const key = validRoles.includes(normalized) ? normalized : 'scout';
      return `/assets/icons/roles/role-${key}.png`;
    };

    allPlayers.forEach((p) => {
      const lat = p.lat ?? center.lat;
      const lng = p.lng ?? center.lng;
      const isMe = p.id === myPlayer.id;
      const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
      const isCriticallyWounded = isPlayerWoundedOrCritical(p);
      const isInside = !!p.insideBuildingId;

      let kin = playerKinematicsRef.current.get(p.id);
      if (!kin) {
        kin = {
          anchorLat: lat,
          anchorLng: lng,
          isMoving: false,
          facingMode: 'right',
          stopTimeout: null,
        };
        playerKinematicsRef.current.set(p.id, kin);
      }

      const avatarIconSrc = isCriticallyWounded
        ? '/assets/icons/roles/player-wounded.png'
        : p.isAlive
        ? getPlayerRoleIcon(p.role)
        : '/assets/icons/roles/player-ghost.png';

      const chestsConquered = p.chests_opened || p.chestsOpened || 0;
      const statusLabel = isCriticallyWounded
        ? `${p.nickname} [HERIDO]`
        : isInside
        ? `${p.nickname} [${p.insideBuildingType === 'hospital' ? 'HOSPITAL' : 'A CUBIERTO'}]`
        : `${p.nickname}${isMe ? ' (Tú)' : ''}${chestsConquered > 0 ? ` [👑${chestsConquered}]` : ''}`;

      if (!playerMarkersRef.current.has(p.id)) {
        const el = document.createElement('div');
        el.className = `map-marker-anchor marker-player player-marker-${p.id}`;
        el.setAttribute('data-entity', 'player');
        el.setAttribute('data-is-me', isMe ? 'true' : 'false');
        el.style.pointerEvents = 'none';
        el.style.zIndex = isMe ? '40' : '35';
        if (isMe && isInside) {
          el.style.display = 'none';
        } else if (!isMe && isMeWounded) {
          el.style.display = 'none';
        } else if (!isMe && isInside) {
          el.style.opacity = '0.75';
        }

        el.innerHTML = `
          <div class="marker-content flex flex-col items-center select-none cursor-pointer" style="pointer-events: auto;">
            <div class="relative flex items-center justify-center">
              ${isMe ? '<div class="absolute w-12 h-12 bg-cyan-400/20 rounded-full animate-ping pointer-events-none"></div>' : ''}
              
              <!-- Comitiva de Mascotas de Escolta dentro del árbol DOM del jugador -->
              <div id="player-pets-${p.id}" class="absolute inset-0 pointer-events-none" data-pets-key="${(p.pets || []).map((pet) => `${pet.id}_${pet.isWounded ? 'w' : 'a'}`).join(',')}">
                ${renderPlayerEscortPetsHtml(p.pets, p.id, kin.isMoving, kin.facingMode)}
              </div>

              <!-- 1. Capa Externa: Rebote Procedural (translateY + compresión) -->
              <div id="player-bounce-${p.id}" class="${kin.isMoving ? 'marker-stepping' : ''} flex items-center justify-center">
                <!-- 2. Capa Interna: Orientación de Mirada (scaleX dinámico o scan) -->
                <div id="player-facing-${p.id}" class="${getFacingClass(kin.facingMode, kin.isMoving)} flex items-center justify-center">
                  <img 
                    id="avatar-icon-${p.id}" 
                    src="${avatarIconSrc}" 
                    alt="${p.nickname}" 
                    width="44" 
                    height="44" 
                    style="width: 44px !important; height: 44px !important; max-width: 44px !important; max-height: 44px !important;" 
                    class="marker-entity-img select-none drop-shadow-[0_6px_8px_rgba(0,0,0,0.85)] ${isMe ? 'drop-shadow-[0_0_6px_rgba(0,242,254,0.5)]' : isCriticallyWounded ? 'drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]' : 'drop-shadow-[0_0_6px_rgba(148,163,184,0.4)]'}" 
                  />
                </div>
              </div>
            </div>
            <!-- Caja de estado / Nombre y HP fuera de los contenedores animados -->
            <div class="marker-label mt-0.5 px-1.5 py-0.5 bg-hud-dark/95 border ${isMe ? 'border-cyan-400' : isCriticallyWounded ? 'border-red-500' : 'border-hud-border'} rounded shadow text-center min-w-[50px] pointer-events-none">
              <span id="player-label-${p.id}" class="block text-[10px] font-bold ${isMe ? 'text-cyan-300' : isCriticallyWounded ? 'text-red-400 font-black' : 'text-slate-200'} truncate max-w-[85px]">
                ${statusLabel}
              </span>
              <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
                <div id="hp-bar-${p.id}" class="h-full ${isCriticallyWounded ? 'bg-red-500 animate-pulse' : p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}" style="width: ${hpPercent}%"></div>
              </div>
            </div>
          </div>
        `;

        el.onclick = (e) => {
          e.stopPropagation();
          if (!isMe) {
            onPlayerMarkerClickRef.current?.(p.id);
          }
        };

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);

        playerMarkersRef.current.set(p.id, marker);

        if (isMe) {
          updateHospitalGuidelineDirect(map, lng, lat, isMeWounded);
          syncHospitalGuideline(map);
          syncPlayerVision(map);
        }

        if (p.pets && p.pets.length > 0 && !kin.isMoving) {
          startIdleFlankWatch(p.id, p.pets, kin);
        }
      } else {
        const marker = playerMarkersRef.current.get(p.id);
        marker?.setLngLat([lng, lat]);
        if (isMe) {
          updateHospitalGuidelineDirect(map, lng, lat, isMeWounded);
          syncHospitalGuideline(map);
          syncPlayerVision(map);
        }
        const el = marker?.getElement();
        if (el) {
          el.className = `map-marker-anchor marker-player player-marker-${p.id}`;
          el.setAttribute('data-entity', 'player');
          el.setAttribute('data-is-me', isMe ? 'true' : 'false');
          el.style.pointerEvents = 'none';
          el.style.zIndex = isMe ? '40' : '35';
          el.onclick = (e) => {
            e.stopPropagation();
            if (!isMe) {
              onPlayerMarkerClickRef.current?.(p.id);
            }
          };
          if (isMe) {
            el.style.display = isInside ? 'none' : 'block';
          } else if (isMeWounded) {
            el.style.display = 'none';
          } else {
            el.style.display = 'block';
            el.style.opacity = isInside ? '0.75' : '1';
          }
        }
        const hpBar = document.getElementById(`hp-bar-${p.id}`);
        if (hpBar) {
          hpBar.style.width = `${hpPercent}%`;
          hpBar.className = `h-full ${isCriticallyWounded ? 'bg-red-500 animate-pulse' : p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}`;
        }
        const avatarIcon = document.getElementById(`avatar-icon-${p.id}`) as HTMLImageElement | null;
        if (avatarIcon) {
          if (avatarIcon.getAttribute('src') !== avatarIconSrc) {
            avatarIcon.src = avatarIconSrc;
          }
          avatarIcon.style.filter = `drop-shadow(0 6px 8px rgba(0,0,0,0.85)) drop-shadow(0 0 6px ${isMe ? 'rgba(0,242,254,0.5)' : isCriticallyWounded ? 'rgba(239,68,68,0.6)' : 'rgba(148,163,184,0.4)'})`;
        }
        const playerLabel = document.getElementById(`player-label-${p.id}`);
        if (playerLabel) {
          playerLabel.textContent = statusLabel;
          playerLabel.className = `block text-[10px] font-bold ${isMe ? 'text-cyan-300' : isCriticallyWounded ? 'text-red-400 font-black' : 'text-slate-200'} truncate max-w-[85px]`;
        }

        // Sincronizar comitiva de mascotas dentro del DOM del jugador
        const petsContainer = document.getElementById(`player-pets-${p.id}`);
        if (petsContainer) {
          const currentKey = (p.pets || []).map((pet) => `${pet.id}_${pet.isWounded ? 'w' : 'a'}`).join(',');
          const prevKey = petsContainer.getAttribute('data-pets-key');
          if (prevKey !== currentKey) {
            petsContainer.setAttribute('data-pets-key', currentKey);
            petsContainer.innerHTML = renderPlayerEscortPetsHtml(p.pets, p.id, kin.isMoving, kin.facingMode);
          }
        }

        // Cinemática del jugador: activa tanto en estado normal como herido/crítico camino al hospital
        const isGhostPlayer = !p.isAlive && !isCriticallyWounded;
        if (isGhostPlayer) {
          if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
          if (kin.flankWatchInterval) {
            clearInterval(kin.flankWatchInterval);
            kin.flankWatchInterval = null;
          }
          kin.isMoving = false;
          kin.stopTimeout = null;
          updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, false, 'right');
          updatePlayerPetsKinematicsDOM(p.id, p.pets, false, 'right');
        } else {
          // Cinemática del jugador (activo o en estado herido/crítico camino al hospital)
          const mov = computeEntityMovement(lat, lng, kin.anchorLat, kin.anchorLng);
          if (mov.isMoving) {
            kin.isMoving = true;
            kin.facingMode = mov.facingMode;
            kin.anchorLat = lat;
            kin.anchorLng = lng;

            if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
            if (kin.flankWatchInterval) {
              clearInterval(kin.flankWatchInterval);
              kin.flankWatchInterval = null;
            }
            const currentKin = kin;
            currentKin.stopTimeout = setTimeout(() => {
              currentKin.isMoving = false;
              currentKin.stopTimeout = null;
              currentKin.anchorLat = lat;
              currentKin.anchorLng = lng;
              updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, false, currentKin.facingMode);
              updatePlayerPetsKinematicsDOM(p.id, p.pets, false, currentKin.facingMode);
              startIdleFlankWatch(p.id, p.pets, currentKin);
            }, 600);

            updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, true, kin.facingMode);
            updatePlayerPetsKinematicsDOM(p.id, p.pets, true, kin.facingMode);
          }
        }
      }
    });
  }, [players, myPlayer, mapLoaded, center?.lat, center?.lng, isMeWounded, updateHospitalGuidelineDirect, syncHospitalGuideline, syncPlayerVision]);

  // ==========================================
  // 8.5. MASCOTAS ACOMPAÑANTES: Integradas directamente en el DOM del jugador
  // (Section 8.5 de marcadores independientes desmantelada para evitar desfase de proyección y lag)
  // ==========================================
  useEffect(() => {
    // Si quedara algún marcador remanente de comitiva previa, limpiarlo inmediatamente
    if (companionPetMarkersRef.current.size > 0) {
      companionPetMarkersRef.current.forEach((m) => m.remove());
      companionPetMarkersRef.current.clear();
    }
  }, []);

  // ==========================================
  // 9. MARCADORES DE PINGS DE FANTASMA
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    ghostPings.forEach((ping) => {
      if (!pingMarkersRef.current.has(ping.id)) {
        const pingIcon = `/assets/icons/hud/ping-${ping.type || 'assist'}.png`;
        const el = document.createElement('div');
        el.className = 'map-marker-anchor marker-ping ping-marker';
        el.setAttribute('data-entity', 'ping');
        el.style.pointerEvents = 'none';
        if (isMeWounded) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="marker-content flex flex-col items-center select-none pointer-events-none">
            <div class="relative flex items-center justify-center">
              <div class="w-10 h-10 bg-cyan-500/40 rounded-full animate-ping absolute pointer-events-none"></div>
              <div class="w-8 h-8 bg-black/80 border border-cyan-400 rounded-full flex items-center justify-center p-0.5 shadow-lg relative">
                <img 
                  src="${pingIcon}" 
                  alt="Ping ${ping.type}" 
                  width="24" 
                  height="24" 
                  style="width: 24px !important; height: 24px !important; max-width: 24px !important; max-height: 24px !important;" 
                  class="marker-entity-img select-none" 
                />
              </div>
            </div>
            <span class="marker-label mt-1 px-1.5 py-0.5 text-[9px] font-bold bg-black/80 text-cyan-300 rounded border border-cyan-500/50 whitespace-nowrap shadow-md backdrop-blur-sm">
              ${ping.playerNickname}
            </span>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([ping.lng, ping.lat])
          .addTo(map);

        pingMarkersRef.current.set(ping.id, marker);

        setTimeout(() => {
          marker.remove();
          pingMarkersRef.current.delete(ping.id);
        }, 8000);
      }
    });
  }, [ghostPings, isMeWounded]);

  // ==========================================
  // 10. GESTIÓN DEL ESTADO HERIDO DE MUERTE:
  //     OCULTACIÓN TOTAL DE ELEMENTOS Y GUÍA AL HOSPITAL (LÍNEA DE PUNTOS)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Ocultar o restaurar marcadores existentes en el DOM de forma inmediata (sin depender del estilo WebGL)
    if (chestMarkerRef.current) {
      const el = chestMarkerRef.current.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    }

    crateMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    });

    structureMarkersRef.current.forEach((marker, id) => {
      const struct = structures.find((s) => s.id === id);
      const isHospital = Boolean(
        struct &&
          (String(struct.type || '').toLowerCase() === 'hospital' ||
            String(struct.id || '').toLowerCase().includes('hospital') ||
            String(struct.name || '').toLowerCase().includes('hospital'))
      );
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded && !isHospital ? 'none' : 'block';
    });

    droppedItemMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    });

    wildPetMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    });

    companionPetMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    });

    pingMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el) el.style.display = isMeWounded ? 'none' : 'block';
    });

    playerMarkersRef.current.forEach((marker, id) => {
      const isMe = id === myPlayer.id;
      const el = marker.getElement();
      if (el) {
        if (isMe) {
          el.style.display = myPlayer.insideBuildingId ? 'none' : 'block';
        } else {
          el.style.display = isMeWounded ? 'none' : 'block';
        }
      }
    });

    monsterMarkersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (el) {
        const targetM = activeMonstersList.find((m, idx) => (m.id || `monster_${idx}`) === id);
        if (targetM) {
          const dist = getDistanceMeters(myCoords, targetM);
          const isDefeated =
            targetM.status === 'wounded' ||
            targetM.status === 'defeated' ||
            targetM.state === 'dead' ||
            targetM.state === 'defeated' ||
            targetM.state === 'wounded' ||
            targetM.hp <= 0;
          const isVisible =
            dist <= Math.max(visionRadius, isDefeated ? 90 : visionRadius) || isRadarActive;
          el.style.display = !isMeWounded && isVisible ? 'block' : 'none';
        }
      }
    });

    // 2. Aplicar visibilidad de capas en MapLibre GL protegiendo contra estilo nulo o no cargado
    const applyMapLayerVisibility = () => {
      if (!isMapStyleLoaded(map)) return;

      const areaLayers = [
        LAYER_CIRCLES_FILL,
        LAYER_CIRCLES_LINE,
        LAYER_BOUNDARY_FILL,
        LAYER_BOUNDARY_HALO,
        LAYER_BOUNDARY_LINE,
        LAYER_PLAYER_VISION_FILL,
        LAYER_PLAYER_VISION_LINE,
        'treasure-zone-fill',
        'treasure-zone-outline',
        'crates-zones-fill',
        'crates-zones-outline',
        'interaction-ranges-fill',
        'interaction-ranges-outline',
        'player-vision-outline',
      ];
      areaLayers.forEach((layerId) => {
        try {
          if (map.getLayer(layerId)) {
            const isPlayerVision =
              layerId === 'player-vision-outline' ||
              layerId === LAYER_PLAYER_VISION_FILL ||
              layerId === LAYER_PLAYER_VISION_LINE;
            const isLegacyNonHospital =
              layerId.startsWith('crates-') ||
              layerId.startsWith('interaction-') ||
              layerId.startsWith('treasure-');
            const shouldHide = isMeWounded && (isPlayerVision || isLegacyNonHospital);
            map.setLayoutProperty(layerId, 'visibility', shouldHide ? 'none' : 'visible');
          }
        } catch (err) {
          console.warn(`[GameMap] Aviso al consultar capa ${layerId}:`, err);
        }
      });

      // Overlays tácticos de emergencia (Línea directa al hospital y círculo perimetral)
      updateEmergencyOverlays(map);
    };

    if (!isMapStyleLoaded(map)) {
      map.once('style.load', applyMapLayerVisibility);
      return () => {
        map.off('style.load', applyMapLayerVisibility);
      };
    } else {
      applyMapLayerVisibility();
    }
  }, [
    isMeWounded,
    myPlayer.lat,
    myPlayer.lng,
    myPlayer.hp,
    myPlayer.status,
    myPlayer.isCriticallyWounded,
    myPlayer.insideBuildingId,
    structures,
    center.lat,
    center.lng,
    isRadarActive,
    monsters,
    styleVersion,
    updateEmergencyOverlays,
  ]);

  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-hud-dark ${inCombat ? 'pointer-events-none' : ''}`}>
      <div ref={mapContainerRef} id="map" className="relative w-full h-full" />

      {/* BOTÓN DE CENTRAR CÁMARA */}
      <button
        onClick={() => {
          followPlayerRef.current = true;
          setFollowPlayer(true);
          if (mapRef.current && myPlayer.lat && myPlayer.lng) {
            mapRef.current.flyTo({
              center: [myPlayer.lng, myPlayer.lat],
              zoom: 17,
              duration: 800,
            });
          }
        }}
        className={`absolute bottom-28 right-4 z-20 p-2.5 rounded-full border shadow-xl backdrop-blur-md transition-all flex items-center justify-center ${
          followPlayer
            ? 'bg-hud-cyan/20 border-hud-cyan text-hud-cyan shadow-hud-cyan/30'
            : 'bg-hud-card/80 border-hud-border text-hud-muted hover:text-white'
        }`}
        title="Centrar en mi posición"
      >
        <img src="/assets/icons/hud/hud-locate-center.png" alt="Centrar" className="w-6 h-6 object-contain" />
      </button>

      {/* CONTROLES TÁCTICOS SUPERIOR DERECHA (BRÚJULA + SELECTOR DE MAPA EN COLUMNA ORDENADA) */}
      <div className="fixed top-20 right-4 z-30 flex flex-col items-center gap-3 pointer-events-auto">
        {/* 1. Botón Circular Brújula / Norte */}
        <button
          type="button"
          onClick={handleResetNorth}
          className="w-10 h-10 rounded-full bg-slate-950/85 border-2 border-cyan-400 flex items-center justify-center p-1 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)] hover:bg-cyan-950/60 transition-all active:scale-95 cursor-pointer"
          title="Orientar al Norte"
        >
          <img src="/assets/icons/hud/hud-compass.png" alt="Norte" className="w-7 h-7 object-contain" />
        </button>

        {/* 2. Botón Selector Satélite / Táctico */}
        <button
          type="button"
          onClick={handleToggleMapStyle}
          className="px-3 py-1.5 rounded-lg bg-slate-950/85 border border-cyan-400/80 text-cyan-400 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.3)] hover:bg-cyan-950/60 transition-all whitespace-nowrap active:scale-95 cursor-pointer"
          title="Cambiar vista de mapa"
        >
          {isSatelliteView ? (
            <>
              <img src="/assets/icons/hud/hud-map-tactical.png" alt="Táctico" className="w-5 h-5 object-contain" />
              <span>TÁCTICO</span>
            </>
          ) : (
            <>
              <img src="/assets/icons/hud/hud-map-satellite.png" alt="Satélite" className="w-5 h-5 object-contain" />
              <span>SATÉLITE</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export const GameMap = React.memo<GameMapProps>(GameMapComponent);
