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
} from '../types/game';
import { PLAYER_SPEED_MPS, isMonsterAlive } from '../types/game';
import { createGeoJsonCircle, getDistanceMeters } from '../services/geoUtils';
import { getVisionRadius, getCrateVisualInfo } from '../services/combatEngine';
import { MAX_PETS_PER_PLAYER, getMonsterVisualConfig } from '../services/mapEntities';
import { soundEffects } from '../services/soundEffects';

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
 * en formación de abanico táctico (flancos y retaguardia).
 * Regla estricta: ninguna mascota se sitúa en el sector superior (315° a 45°),
 * garantizando que la cabeza, el visor y el torso del jugador queden 100% despejados.
 */
export const getPetEscortOffset = (index: number, total: number) => {
  const distance = 38; // Píxeles de distancia respecto al centro del jugador (rango 36px - 42px)
  // Ángulos tácticos en abanico inferior/lateral (orientación compás: 0° Norte, 90° Este, 180° Sur, 270° Oeste)
  const anglesMap: Record<number, number[]> = {
    1: [140],             // Flanco inferior derecho
    2: [220, 140],        // Izquierda (220°) y Derecha (140°)
    3: [225, 180, 135],   // Izquierda (225°), Retaguardia (180°), Derecha (135°)
  };
  const angles = anglesMap[total] || [180];
  const deg = angles[index] ?? 180;
  const rad = (deg * Math.PI) / 180;

  return {
    x: Math.round(Math.sin(rad) * distance),
    y: Math.round(-Math.cos(rad) * distance + 4), // Ligero descenso (+4px) para despejar el torso y la cabeza
  };
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

  // Estado del jugador local: Herido de Muerte (visión de emergencia hospitalaria)
  const isMeWounded = myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded';

  // ==========================================
  // INYECCIÓN ROBUSTA DE CAPAS TÁCTICAS Y FUENTES GEOJSON
  // ==========================================
  const injectTacticalOverlays = useCallback(
    (map: maplibregl.Map) => {
      if (!isMapStyleLoaded(map)) {
        const onStyleLoad = () => {
          if (mapRef.current === map) {
            injectTacticalOverlaysRef.current?.(map);
          }
        };
        map.once('style.load', onStyleLoad);
        return;
      }

      try {
        // 1. Capa estática: Área de juego (Perímetro exterior de alto contraste sobre fotografía aérea)
      if (!map.getSource('play-area')) {
        const playAreaGeo = createGeoJsonCircle(center, playAreaRadius);
        map.addSource('play-area', {
          type: 'geojson',
          data: playAreaGeo,
        });

        map.addLayer({
          id: 'play-area-fill',
          type: 'fill',
          source: 'play-area',
          paint: {
            'fill-color': '#00f0ff',
            'fill-opacity': 0.08,
          },
        });

        map.addLayer({
          id: 'play-area-outline',
          type: 'line',
          source: 'play-area',
          paint: {
            'line-color': '#00f2fe',
            'line-width': 2.8,
            'line-opacity': 0.9,
            'line-dasharray': [3, 2],
          },
        });
      }

      // 2. Capa estática: Zona del cofre del tesoro (20m)
      if (!map.getSource('treasure-zone')) {
        const treasureGeo = createGeoJsonCircle(treasureLocation, 20);
        map.addSource('treasure-zone', {
          type: 'geojson',
          data: treasureGeo,
        });

        map.addLayer({
          id: 'treasure-zone-fill',
          type: 'fill',
          source: 'treasure-zone',
          paint: {
            'fill-color': '#ffaa00',
            'fill-opacity': 0.28,
          },
        });

        map.addLayer({
          id: 'treasure-zone-outline',
          type: 'line',
          source: 'treasure-zone',
          paint: {
            'line-color': '#ffd000',
            'line-width': 2.5,
            'line-opacity': 1,
          },
        });
      }

      // 3. Capa dinámica: Radio de visión del jugador
      if (!map.getSource('player-vision')) {
        const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
        const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
        const visionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
        const visionGeo = createGeoJsonCircle(myCoords, Math.min(visionRadius, playAreaRadius));

        map.addSource('player-vision', {
          type: 'geojson',
          data: visionGeo,
        });

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

      // 4. Capas dinámicas: Radio de interacción de suministros (40m)
      if (!map.getSource('crates-zones')) {
        const initialCrateFeatures = isMeWounded
          ? []
          : crates
              .filter(
                (c) =>
                  !c.opened &&
                  typeof c.lat === 'number' &&
                  typeof c.lng === 'number' &&
                  !isNaN(c.lat) &&
                  !isNaN(c.lng) &&
                  (c.lat !== 0 || c.lng !== 0)
              )
              .map((c) => createGeoJsonCircle({ lat: c.lat, lng: c.lng }, 40));

        map.addSource('crates-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: initialCrateFeatures },
        });

        map.addLayer({
          id: 'crates-zones-fill',
          type: 'fill',
          source: 'crates-zones',
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.16,
          },
        });

        map.addLayer({
          id: 'crates-zones-outline',
          type: 'line',
          source: 'crates-zones',
          paint: {
            'line-color': '#34d399',
            'line-width': 2,
            'line-opacity': 0.85,
            'line-dasharray': [2, 2],
          },
        });
      }

      // 5. Capas tácticas: Zonas de estructuras (Hospital y Refugios)
      if (!map.getSource('structures-zones')) {
        const visibleStructures = isMeWounded
          ? structures.filter((s) => s.type === 'hospital')
          : structures;
        const initialStructureFeatures = visibleStructures
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

        map.addSource('structures-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: initialStructureFeatures },
        });

        map.addLayer({
          id: 'structures-zones-fill',
          type: 'fill',
          source: 'structures-zones',
          paint: {
            'fill-color': ['match', ['get', 'type'], 'hospital', '#10b981', '#06b6d4'],
            'fill-opacity': 0.22,
          },
        });

        map.addLayer({
          id: 'structures-zones-outline',
          type: 'line',
          source: 'structures-zones',
          paint: {
            'line-color': ['match', ['get', 'type'], 'hospital', '#34d399', '#22d3ee'],
            'line-width': 2.5,
            'line-opacity': 0.95,
            'line-dasharray': [3, 2],
          },
        });
      }

      // 6. Capas tácticas de influencia de entidades: Armas/Loot y Mascotas Silvestres (25m)
      if (!map.getSource('interaction-ranges')) {
        const initialEntityFeatures = isMeWounded
          ? []
          : [
              ...droppedItems
                .filter(
                  (d) =>
                    typeof d.lat === 'number' &&
                    typeof d.lng === 'number' &&
                    !isNaN(d.lat) &&
                    !isNaN(d.lng) &&
                    (d.lat !== 0 || d.lng !== 0)
                )
                .map((d) => ({
                  ...createGeoJsonCircle({ lat: d.lat, lng: d.lng }, 25),
                  properties: { type: 'loot', id: d.id },
                })),
              ...wildPets
                .filter(
                  (wp) =>
                    typeof wp.lat === 'number' &&
                    typeof wp.lng === 'number' &&
                    !isNaN(wp.lat) &&
                    !isNaN(wp.lng) &&
                    (wp.lat !== 0 || wp.lng !== 0)
                )
                .map((wp) => ({
                  ...createGeoJsonCircle({ lat: wp.lat, lng: wp.lng }, 25),
                  properties: { type: 'pet', id: wp.id },
                })),
            ];

        map.addSource('interaction-ranges', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: initialEntityFeatures },
        });

        map.addLayer({
          id: 'interaction-ranges-fill',
          type: 'fill',
          source: 'interaction-ranges',
          paint: {
            'fill-color': ['match', ['get', 'type'], 'pet', '#10b981', '#06b6d4'],
            'fill-opacity': 0.12,
          },
        });

        map.addLayer({
          id: 'interaction-ranges-outline',
          type: 'line',
          source: 'interaction-ranges',
          paint: {
            'line-color': ['match', ['get', 'type'], 'pet', '#34d399', '#22d3ee'],
            'line-width': 2.2,
            'line-opacity': 0.9,
            'line-dasharray': [2, 2],
          },
        });
      }

      // 7. Capa táctica: Línea directa de evacuación hacia el Hospital (Estado Herido de Muerte)
      if (!map.getSource('hospital-guideline')) {
        map.addSource('hospital-guideline', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Halo oscuro de contraste fotográfico sobre satélite y modo táctico
      if (!map.getLayer('hospital-guideline-halo')) {
        map.addLayer({
          id: 'hospital-guideline-halo',
          type: 'line',
          source: 'hospital-guideline',
          layout: {
            visibility: isMeWounded ? 'visible' : 'none',
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#000000',
            'line-width': 5.5,
            'line-opacity': 0.75,
          },
        });
      }

      // Línea principal de alta visibilidad cian con patrón discontinuo
      if (!map.getLayer('hospital-guideline-line')) {
        map.addLayer({
          id: 'hospital-guideline-line',
          type: 'line',
          source: 'hospital-guideline',
          layout: {
            visibility: isMeWounded ? 'visible' : 'none',
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#22d3ee',
            'line-width': 3.5,
            'line-opacity': 1,
            'line-dasharray': [2, 2],
          },
        });
      }

      // 8. Capa táctica: Radio perimetral del jugador herido de muerte (12 metros)
      if (!map.getSource('wounded-perimeter')) {
        map.addSource('wounded-perimeter', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Relleno carmesí translúcido
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

      // Contorno carmesí discontinuo
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

      // Sincronizar inmediatamente datos de emergencia si corresponde
      updateEmergencyOverlaysRef.current?.(map);
    } catch (err) {
      console.warn('[GameMap] Error al inyectar overlays tácticos:', err);
    }
  },
    [
      center,
      playAreaRadius,
      treasureLocation,
      myPlayer.lat,
      myPlayer.lng,
      myPlayer.role,
      myPlayer.pets,
      isRadarActive,
      crates,
      structures,
      isMeWounded,
      droppedItems,
      wildPets,
    ]
  );

  const injectTacticalOverlaysRef = useRef<(map: maplibregl.Map) => void>(injectTacticalOverlays);
  injectTacticalOverlaysRef.current = injectTacticalOverlays;

  // Actualización de fuentes GeoJSON tácticas
  const updateEntityInfluenceSources = useCallback(
    (map: maplibregl.Map) => {
      if (!isMapStyleLoaded(map)) {
        const onStyleLoad = () => {
          if (mapRef.current === map) {
            updateEntityInfluenceSourcesRef.current?.(map);
          }
        };
        map.once('style.load', onStyleLoad);
        return;
      }

      try {
        // 1. Actualizar play-area si procede
      const playAreaSource = map.getSource('play-area') as maplibregl.GeoJSONSource | undefined;
      if (playAreaSource) {
        playAreaSource.setData(createGeoJsonCircle(center, playAreaRadius));
      }

      // 2. Actualizar treasure-zone
      const treasureSource = map.getSource('treasure-zone') as maplibregl.GeoJSONSource | undefined;
      if (treasureSource) {
        treasureSource.setData(createGeoJsonCircle(treasureLocation, 20));
      }

      // 3. Actualizar player-vision
      const visionSource = map.getSource('player-vision') as maplibregl.GeoJSONSource | undefined;
      if (visionSource) {
        const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
        const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
        const visionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
        visionSource.setData(createGeoJsonCircle(myCoords, Math.min(visionRadius, playAreaRadius)));
      }

      // 4. Actualizar crates-zones
      const cratesSource = map.getSource('crates-zones') as maplibregl.GeoJSONSource | undefined;
      if (cratesSource) {
        const crateFeatures = isMeWounded
          ? []
          : crates
              .filter(
                (c) =>
                  !c.opened &&
                  typeof c.lat === 'number' &&
                  typeof c.lng === 'number' &&
                  !isNaN(c.lat) &&
                  !isNaN(c.lng) &&
                  (c.lat !== 0 || c.lng !== 0)
              )
              .map((c) => createGeoJsonCircle({ lat: c.lat, lng: c.lng }, 40));
        cratesSource.setData({ type: 'FeatureCollection', features: crateFeatures });
      }

      // 5. Actualizar structures-zones
      const structuresSource = map.getSource('structures-zones') as maplibregl.GeoJSONSource | undefined;
      if (structuresSource) {
        const visibleStructures = isMeWounded
          ? structures.filter((s) => s.type === 'hospital')
          : structures;
        const structureFeatures = visibleStructures
          .filter(
            (s) =>
              typeof s.lat === 'number' &&
              typeof s.lng === 'number' &&
              !isNaN(s.lat) &&
              !isNaN(s.lng) &&
              (s.lat !== 0 || s.lng !== 0)
          )
          .map((s) => ({
            ...createGeoJsonCircle({ lat: s.lat, lng: s.lng }, s.radius),
            properties: { type: s.type, id: s.id },
          }));
        structuresSource.setData({ type: 'FeatureCollection', features: structureFeatures });
      }

      // 6. Actualizar interaction-ranges
      const rangesSource = map.getSource('interaction-ranges') as maplibregl.GeoJSONSource | undefined;
      if (rangesSource) {
        const features = isMeWounded
          ? []
          : [
              ...droppedItems
                .filter(
                  (d) =>
                    typeof d.lat === 'number' &&
                    typeof d.lng === 'number' &&
                    !isNaN(d.lat) &&
                    !isNaN(d.lng) &&
                    (d.lat !== 0 || d.lng !== 0)
                )
                .map((d) => ({
                  ...createGeoJsonCircle({ lat: d.lat, lng: d.lng }, 25),
                  properties: { type: 'loot', id: d.id },
                })),
              ...wildPets
                .filter(
                  (wp) =>
                    typeof wp.lat === 'number' &&
                    typeof wp.lng === 'number' &&
                    !isNaN(wp.lat) &&
                    !isNaN(wp.lng) &&
                    (wp.lat !== 0 || wp.lng !== 0)
                )
                .map((wp) => ({
                  ...createGeoJsonCircle({ lat: wp.lat, lng: wp.lng }, 25),
                  properties: { type: 'pet', id: wp.id },
                })),
            ];
        rangesSource.setData({ type: 'FeatureCollection', features });
      }
    } catch (err) {
      console.warn('[GameMap] Error al actualizar fuentes de entidades:', err);
    }
  },
    [
      center,
      playAreaRadius,
      treasureLocation,
      myPlayer.lat,
      myPlayer.lng,
      myPlayer.role,
      myPlayer.pets,
      isRadarActive,
      crates,
      structures,
      isMeWounded,
      droppedItems,
      wildPets,
    ]
  );

  const updateEntityInfluenceSourcesRef = useRef<(map: maplibregl.Map) => void>(
    updateEntityInfluenceSources
  );
  updateEntityInfluenceSourcesRef.current = updateEntityInfluenceSources;

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
        const hospital = structures.find((s) => s.type === 'hospital');
        const myLat = myPlayer.lat ?? center.lat;
        const myLng = myPlayer.lng ?? center.lng;

        const hasValidPlayerCoords =
          typeof myLat === 'number' &&
          typeof myLng === 'number' &&
          !isNaN(myLat) &&
          !isNaN(myLng) &&
          (myLat !== 0 || myLng !== 0);

        const hasValidHospitalCoords =
          !!hospital &&
          typeof hospital.lat === 'number' &&
          typeof hospital.lng === 'number' &&
          !isNaN(hospital.lat) &&
          !isNaN(hospital.lng);

        // 1. Línea directa hacia el hospital
        const guidelineSource = map.getSource('hospital-guideline') as maplibregl.GeoJSONSource | undefined;
        const shouldRenderHospitalGuide = Boolean(isMeWounded && hasValidPlayerCoords && hasValidHospitalCoords);

        if (guidelineSource) {
          if (shouldRenderHospitalGuide && hospital) {
            guidelineSource.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [myLng, myLat],
                      [hospital.lng, hospital.lat],
                    ],
                  },
                },
              ],
            });
          } else {
            guidelineSource.setData({
              type: 'FeatureCollection',
              features: [],
            });
          }
        }

        const guideVisibility = shouldRenderHospitalGuide ? 'visible' : 'none';
        try {
          if (map.getLayer('hospital-guideline-halo')) {
            map.setLayoutProperty('hospital-guideline-halo', 'visibility', guideVisibility);
          }
        } catch (err) {
          console.warn('[GameMap] Aviso al consultar capa hospital-guideline-halo:', err);
        }

        try {
          if (map.getLayer('hospital-guideline-line')) {
            map.setLayoutProperty('hospital-guideline-line', 'visibility', guideVisibility);
          }
        } catch (err) {
          console.warn('[GameMap] Aviso al consultar capa hospital-guideline-line:', err);
        }

        // 2. Radio perimetral de 12 metros alrededor del jugador herido
        const perimeterSource = map.getSource('wounded-perimeter') as maplibregl.GeoJSONSource | undefined;
        const shouldRenderPerimeter = Boolean(isMeWounded && hasValidPlayerCoords);

        if (perimeterSource) {
          if (shouldRenderPerimeter) {
            const perimeterCircle = createGeoJsonCircle({ lat: myLat, lng: myLng }, 12);
            perimeterSource.setData({
              type: 'FeatureCollection',
              features: [perimeterCircle],
            });
          } else {
            perimeterSource.setData({
              type: 'FeatureCollection',
              features: [],
            });
          }
        }

        const perimeterVisibility = shouldRenderPerimeter ? 'visible' : 'none';
        try {
          if (map.getLayer('wounded-perimeter-fill')) {
            map.setLayoutProperty('wounded-perimeter-fill', 'visibility', perimeterVisibility);
          }
        } catch (err) {
          console.warn('[GameMap] Aviso al consultar capa wounded-perimeter-fill:', err);
        }

        try {
          if (map.getLayer('wounded-perimeter-outline')) {
            map.setLayoutProperty('wounded-perimeter-outline', 'visibility', perimeterVisibility);
          }
        } catch (err) {
          console.warn('[GameMap] Aviso al consultar capa wounded-perimeter-outline:', err);
        }
      } catch (err) {
        console.warn('[GameMap] Error al actualizar overlays de emergencia:', err);
      }
    },
    [structures, myPlayer.lat, myPlayer.lng, center.lat, center.lng, isMeWounded]
  );
  updateEmergencyOverlaysRef.current = updateEmergencyOverlays;

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

    map.once('style.load', () => {
      if (mapRef.current === map) {
        injectTacticalOverlaysRef.current?.(map);
        updateEntityInfluenceSourcesRef.current?.(map);
        updateEmergencyOverlaysRef.current?.(map);
        setStyleVersion((v) => v + 1);
      }
      isStyleChangingRef.current = false;
    });

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
        : center.lng;
    const initialCenterLat =
      myPlayer.lat != null && !isNaN(myPlayer.lat) && myPlayer.lat !== 0
        ? myPlayer.lat
        : center.lat;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.satellite,
      center: [initialCenterLng, initialCenterLat],
      zoom: 16.5,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
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
  // 2. ACTUALIZACIÓN AISLADA DE CAPAS ESTÁTICAS (Área de Juego y Zona del Tesoro)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleLoaded(map)) return;

    try {
      const playAreaSource = map.getSource('play-area') as maplibregl.GeoJSONSource | undefined;
      if (playAreaSource) {
        playAreaSource.setData(createGeoJsonCircle(center, playAreaRadius));
      }

      const treasureSource = map.getSource('treasure-zone') as maplibregl.GeoJSONSource | undefined;
      if (treasureSource) {
        treasureSource.setData(createGeoJsonCircle(treasureLocation, 20));
      }
    } catch (err) {
      console.warn('[GameMap] Error al actualizar capas estáticas:', err);
    }
  }, [center.lat, center.lng, playAreaRadius, treasureLocation.lat, treasureLocation.lng, styleVersion]);

  // ==========================================
  // 3. ACTUALIZACIÓN EFICIENTE DEL RADIO DE VISIÓN (Throttled por desplazamiento)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleLoaded(map)) return;

    try {
      const myLat = myPlayer.lat ?? center.lat;
      const myLng = myPlayer.lng ?? center.lng;

      // Evitar recalcular geometría GeoJSON si la posición apenas varió menos de 0.8 metros
      if (lastVisionPosRef.current) {
        const dist = getDistanceMeters(lastVisionPosRef.current, { lat: myLat, lng: myLng });
        if (dist < 0.8 && !isRadarActive) return;
      }
      lastVisionPosRef.current = { lat: myLat, lng: myLng };

      const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
      const visionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
      const visionSource = map.getSource('player-vision') as maplibregl.GeoJSONSource | undefined;
      if (visionSource) {
        visionSource.setData(createGeoJsonCircle({ lat: myLat, lng: myLng }, Math.min(visionRadius, playAreaRadius)));
      }
    } catch (err) {
      console.warn('[GameMap] Error al actualizar radio de visión:', err);
    }
  }, [
    myPlayer.lat,
    myPlayer.lng,
    myPlayer.role,
    isRadarActive,
    playAreaRadius,
    center.lat,
    center.lng,
    styleVersion,
  ]);

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
      if (!isMonsterAlive(m) || (m as any).isDead) return false;
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

    const chestHtml = isOpened
      ? `
        <div class="relative flex items-center justify-center">
          <img 
            src="/assets/icons/chests/chest-looted.png" 
            alt="Cofre Saqueado" 
            width="40" 
            height="40" 
            style="width: 40px !important; height: 40px !important; max-width: 40px !important; max-height: 40px !important; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.9)) drop-shadow(0 0 8px rgba(52,211,153,0.4));" 
            class="select-none transition-transform duration-150 group-hover:scale-110" 
          />
        </div>
        <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-emerald-500/60 text-emerald-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
          Cofre Abierto
        </span>
      `
      : computedIsChestGuarded
      ? `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 bg-red-600/30 rounded-full animate-ping pointer-events-none"></div>
          <img 
            src="/assets/icons/chests/chest-guarded.png" 
            alt="Cofre Custodiado" 
            width="40" 
            height="40" 
            style="width: 40px !important; height: 40px !important; max-width: 40px !important; max-height: 40px !important; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.9)) drop-shadow(0 0 12px rgba(239,68,68,0.7));" 
            class="select-none transition-transform duration-150 group-hover:scale-110 animate-pulse" 
          />
        </div>
        <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-red-500/70 text-red-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
          ⚠️ Custodiado
        </span>
      `
      : `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 bg-amber-500/25 rounded-full animate-ping pointer-events-none"></div>
          <img 
            src="/assets/icons/chests/chest-active.png" 
            alt="Cofre Activo" 
            width="40" 
            height="40" 
            style="width: 40px !important; height: 40px !important; max-width: 40px !important; max-height: 40px !important; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.9)) drop-shadow(0 0 10px rgba(245,158,11,0.6));" 
            class="select-none transition-transform duration-150 group-hover:scale-110" 
          />
        </div>
        <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-amber-500/50 text-amber-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
          Tesoro
        </span>
      `;

    if (!chestMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'marker-chest treasure-marker cursor-pointer flex flex-col items-center select-none group pointer-events-auto';
      el.setAttribute('data-entity', 'chest');
      if (isMeWounded) {
        el.style.display = 'none';
      }
      el.innerHTML = chestHtml;
      el.onclick = (e) => handleChestMarkerClickRef.current(e);

      chestMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([treasureLocation.lng, treasureLocation.lat])
        .addTo(map);
    } else {
      chestMarkerRef.current.setLngLat([treasureLocation.lng, treasureLocation.lat]);
      const el = chestMarkerRef.current.getElement();
      if (el) {
        el.className = 'marker-chest treasure-marker cursor-pointer flex flex-col items-center select-none group pointer-events-auto';
        el.setAttribute('data-entity', 'chest');
        el.style.display = isMeWounded ? 'none' : 'flex';
        el.innerHTML = chestHtml;
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
    if (isMapStyleLoaded(map)) {
      try {
        const source = map.getSource('crates-zones') as maplibregl.GeoJSONSource | undefined;
        if (source) {
          const activeCrates = isMeWounded
            ? []
            : crates.filter(
                (c) =>
                  !c.opened &&
                  typeof c.lat === 'number' &&
                  typeof c.lng === 'number' &&
                  !isNaN(c.lat) &&
                  !isNaN(c.lng) &&
                  (c.lat !== 0 || c.lng !== 0)
              );
          const features = activeCrates.map(
            (c) => createGeoJsonCircle({ lat: c.lat, lng: c.lng }, 40)
          );
          source.setData({
            type: 'FeatureCollection',
            features,
          });
        }
      } catch (err) {
        console.warn('[GameMap] Error al actualizar zonas de cajas:', err);
      }
    }

    const currentCrateIds = new Set(crates.map((c) => c.id));
    crateMarkersRef.current.forEach((marker, id) => {
      if (!currentCrateIds.has(id)) {
        marker.remove();
        crateMarkersRef.current.delete(id);
      }
    });

    crates.forEach((crate) => {
      if (crate.opened) {
        if (crateMarkersRef.current.has(crate.id)) {
          crateMarkersRef.current.get(crate.id)?.remove();
          crateMarkersRef.current.delete(crate.id);
        }
        return;
      }

      const info = getCrateVisualInfo(crate);

      if (!crateMarkersRef.current.has(crate.id)) {
        const el = document.createElement('div');
        el.className = 'marker-crate crate-marker flex flex-col items-center select-none cursor-pointer group pointer-events-auto';
        el.setAttribute('data-entity', 'crate');
        if (isMeWounded) {
          el.style.display = 'none';
        }

        const isDescending = Date.now() - crate.droppedAt < 5000;

        if (isDescending) {
          const remainingMs = Math.max(300, 5000 - (Date.now() - crate.droppedAt));
          el.innerHTML = `
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
                  style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85));" 
                  class="select-none transition-transform duration-150 group-hover:scale-110" 
                />
              </div>
              <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${info.borderColor} ${info.textColor} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
                ${info.label} (40m)
              </span>
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
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 ${info.glowColor} rounded-full animate-ping pointer-events-none"></div>
              <img 
                src="${info.icon}" 
                alt="${info.label}" 
                width="32" 
                height="32" 
                style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85));" 
                class="select-none transition-transform duration-150 group-hover:scale-110" 
              />
            </div>
            <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${info.borderColor} ${info.textColor} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
              ${info.label} (40m)
            </span>
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
          el.className = 'marker-crate crate-marker flex flex-col items-center select-none cursor-pointer group pointer-events-auto';
          el.setAttribute('data-entity', 'crate');
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
          const visibleStructures = isMeWounded ? structures.filter((s) => s.type === 'hospital') : structures;
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
      const isHospital = structure.type === 'hospital';
      const badgeBorder = isHospital ? 'border-emerald-400' : 'border-cyan-400';
      const badgeText = isHospital ? 'text-emerald-300' : 'text-cyan-300';
      const icon = isHospital ? '/assets/icons/structures/structure-hospital.png' : '/assets/icons/structures/structure-shelter.png';
      const aura = isHospital ? 'bg-emerald-500/25 animate-ping' : 'bg-cyan-500/20';
      const label = isHospital ? `HOSPITAL (${structure.radius}m)` : `${structure.name.toUpperCase()} (${structure.radius}m)`;

      if (!structureMarkersRef.current.has(structure.id)) {
        const el = document.createElement('div');
        el.className = `marker-structure structure-marker-${structure.id} flex flex-col items-center select-none pointer-events-none`;
        el.setAttribute('data-entity', 'structure');
        if (isMeWounded && !isHospital) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-20 h-20 ${aura} rounded-full pointer-events-none"></div>
            <img 
              src="${icon}" 
              alt="${structure.name}" 
              width="68" 
              height="68" 
              style="width: 68px !important; height: 68px !important; max-width: 68px !important; max-height: 68px !important; object-fit: contain; filter: drop-shadow(0 10px 18px rgba(0,0,0,0.95)) ${isHospital ? 'drop-shadow(0 0 10px rgba(52,211,153,0.5))' : 'drop-shadow(0 0 8px rgba(0,242,254,0.3))'};" 
              class="select-none" 
            />
          </div>
          <span class="mt-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${badgeBorder} ${badgeText} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
            ${label}
          </span>
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
          el.className = `marker-structure structure-marker-${structure.id} flex flex-col items-center select-none pointer-events-none`;
          el.setAttribute('data-entity', 'structure');
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
            typeof d.lat === 'number' &&
            typeof d.lng === 'number' &&
            !isNaN(d.lat) &&
            !isNaN(d.lng) &&
            (d.lat !== 0 || d.lng !== 0)
        )
        .map((d) => d.id)
    );
    droppedItemMarkersRef.current.forEach((marker, id) => {
      if (!currentDroppedIds.has(id)) {
        marker.remove();
        droppedItemMarkersRef.current.delete(id);
      }
    });

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
        el.className = `marker-loot dropped-item-${dropped.id} flex flex-col items-center select-none cursor-pointer group pointer-events-auto`;
        el.setAttribute('data-entity', 'crate');
        if (isMeWounded) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-10 h-10 ${style.aura} rounded-full animate-ping pointer-events-none"></div>
            <img 
              src="${style.icon}" 
              alt="${dropped.item.name}" 
              width="32" 
              height="32" 
              style="width: 32px !important; height: 32px !important; max-width: 32px !important; max-height: 32px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85));" 
              class="select-none transition-transform duration-150 group-hover:scale-110" 
            />
          </div>
          <span class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border ${style.border} ${style.text} rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
            ${dropped.item.name} (T${dropped.item.tier})
          </span>
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
          el.className = `marker-loot dropped-item-${dropped.id} flex flex-col items-center select-none cursor-pointer group pointer-events-auto`;
          el.setAttribute('data-entity', 'crate');
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

    const currentWildPetIds = new Set(wildPets.map((wp) => wp.id));

    // Limpiar mascotas que ya fueron adoptadas o eliminadas
    wildPetMarkersRef.current.forEach((marker, id) => {
      if (!currentWildPetIds.has(id)) {
        marker.remove();
        wildPetMarkersRef.current.delete(id);
      }
    });

    wildPets.forEach((wp) => {
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
        // NO añadir clases absolute ni fixed aquí; MapLibre gestiona la posición mediante transform
        el.className = 'marker-pet pet-marker-container pointer-events-auto select-none cursor-pointer group';
        el.setAttribute('data-entity', 'pet');
        el.style.zIndex = '35'; // Visible por encima del canvas
        el.style.display = isMeWounded ? 'none' : 'block';
        const hasMaxPets = (myPlayer.pets || []).length >= MAX_PETS_PER_PLAYER;
        el.title = hasMaxPets
          ? 'Capacidad máxima de mascotas (3/3): Comitiva completa'
          : `Mascota silvestre: ${wp.pet.name} (Toca para adoptar)`;

        el.innerHTML = `
          <div class="relative flex flex-col items-center justify-center">
            <!-- Icono 3D de Mascota con pulso táctico -->
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 rounded-full bg-emerald-400/30 animate-ping pointer-events-none"></div>
              <img 
                src="${wp.pet.icon}" 
                alt="${wp.pet.name}" 
                width="34" 
                height="34" 
                style="width: 34px !important; height: 34px !important; max-width: 34px !important; max-height: 34px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85)) drop-shadow(0 0 8px rgba(52,211,153,0.6));" 
                class="select-none transition-transform duration-150 group-hover:scale-110" 
              />
            </div>
            <!-- Etiqueta del nombre centrada bajo el avatar -->
            <div class="mt-0.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-950/85 border border-emerald-500/80 text-emerald-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md backdrop-blur-sm">
              ${wp.pet.name}
            </div>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const hasMaxPetsNow = (myPlayerRef.current?.pets || []).length >= MAX_PETS_PER_PLAYER;
          if (hasMaxPetsNow) {
            // Notificar capacidad máxima sin desplazarse ni consumir la mascota
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
        });

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
          el.className = 'marker-pet pet-marker-container pointer-events-auto select-none cursor-pointer group';
          el.setAttribute('data-entity', 'pet');
          el.style.display = isMeWounded ? 'none' : 'block';
          const hasMaxPets = (myPlayer.pets || []).length >= MAX_PETS_PER_PLAYER;
          el.title = hasMaxPets
            ? 'Capacidad máxima de mascotas (3/3): Comitiva completa'
            : `Mascota silvestre: ${wp.pet.name} (Toca para adoptar)`;
        }
      }
    });
  }, [wildPets, mapLoaded, center.lat, center.lng, isMeWounded, myPlayer.pets?.length]);

  // ==========================================
  // 6.8. RADIOS DE INTERACCIÓN DE ENTIDADES (LOOT Y MASCOTAS, 25M)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleLoaded(map)) return;

    try {
      const source = map.getSource('interaction-ranges') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      if (isMeWounded) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      const features = [
        ...droppedItems
          .filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number' && !isNaN(d.lat) && !isNaN(d.lng) && (d.lat !== 0 || d.lng !== 0))
          .map((d) => ({
            ...createGeoJsonCircle({ lat: d.lat, lng: d.lng }, 25),
            properties: { type: 'loot', id: d.id },
          })),
        ...wildPets
          .filter((wp) => typeof wp.lat === 'number' && typeof wp.lng === 'number' && !isNaN(wp.lat) && !isNaN(wp.lng) && (wp.lat !== 0 || wp.lng !== 0))
          .map((wp) => ({
            ...createGeoJsonCircle({ lat: wp.lat, lng: wp.lng }, 25),
            properties: { type: 'pet', id: wp.id },
          })),
      ];

      source.setData({
        type: 'FeatureCollection',
        features,
      });
    } catch (err) {
      console.warn('[GameMap] Error al actualizar rangos de interacción:', err);
    }
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
      const isVisible =
        (distToMonster <= visionRadius || isRadarActive) &&
        m.state !== 'dead' &&
        m.hp > 0;

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
      let marker = monsterMarkersRef.current.get(monsterKey);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'marker-monster monster-map-marker select-none pointer-events-none';
        el.setAttribute('data-entity', 'monster');
        el.innerHTML = `
          <div class="relative flex items-center justify-center pointer-events-none transition-transform duration-200 ${visual.scaleClass}">
            <div class="w-14 h-14 ${visual.pingBg} rounded-full animate-ping absolute"></div>
            
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
                  style="width: 48px !important; height: 48px !important; max-width: 48px !important; max-height: 48px !important; object-fit: contain; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.95)) drop-shadow(0 0 10px rgba(239,68,68,0.7));" 
                  class="select-none" 
                />
              </div>
            </div>

            <!-- Placa táctica con distintivo y nombre de la amenaza (fuera de capas animadas) -->
            <div id="monster-badge-${monsterKey}" class="absolute -bottom-5 whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${visual.badgeBg} border ${visual.borderColor}/60 shadow-md pointer-events-none backdrop-blur-sm">
              ${m.name || visual.label}
            </div>
          </div>
        `;

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
          el.className = 'marker-monster monster-map-marker select-none pointer-events-none';
          el.setAttribute('data-entity', 'monster');
        }
        const hpBar = document.getElementById(`monster-hp-bar-${monsterKey}`);
        if (hpBar) {
          hpBar.style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
        }
        const badge = document.getElementById(`monster-badge-${monsterKey}`);
        if (badge && m.name && badge.textContent !== m.name) {
          badge.textContent = m.name;
        }

        if (m.state === 'dead' || m.hp <= 0) {
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
      const isCriticallyWounded = p.isCriticallyWounded || p.status === 'critically_wounded' || (p.hp <= 0 && p.isAlive);
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
        el.className = `marker-player player-marker-${p.id} flex flex-col items-center select-none cursor-pointer transition-opacity duration-300`;
        el.setAttribute('data-entity', 'player');
        el.setAttribute('data-is-me', isMe ? 'true' : 'false');
        el.style.zIndex = isMe ? '40' : '35';
        if (isMe && isInside) {
          el.style.display = 'none';
        } else if (!isMe && isMeWounded) {
          el.style.display = 'none';
        } else if (!isMe && isInside) {
          el.style.opacity = '0.75';
        }

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${isMe ? '<div class="absolute w-12 h-12 bg-cyan-400/20 rounded-full animate-ping pointer-events-none"></div>' : ''}
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
                  style="width: 44px !important; height: 44px !important; max-width: 44px !important; max-height: 44px !important; object-fit: contain; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.85)) drop-shadow(0 0 6px ${isMe ? 'rgba(0,242,254,0.5)' : isCriticallyWounded ? 'rgba(239,68,68,0.6)' : 'rgba(148,163,184,0.4)'});" 
                  class="select-none transition-transform duration-150" 
                />
              </div>
            </div>
          </div>
          <!-- Caja de estado / Nombre y HP fuera de los contenedores animados -->
          <div class="mt-0.5 px-1.5 py-0.5 bg-hud-dark/95 border ${isMe ? 'border-cyan-400' : isCriticallyWounded ? 'border-red-500' : 'border-hud-border'} rounded shadow text-center min-w-[50px] pointer-events-none">
            <span id="player-label-${p.id}" class="block text-[10px] font-bold ${isMe ? 'text-cyan-300' : isCriticallyWounded ? 'text-red-400 font-black' : 'text-slate-200'} truncate max-w-[85px]">
              ${statusLabel}
            </span>
            <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
              <div id="hp-bar-${p.id}" class="h-full ${isCriticallyWounded ? 'bg-red-500 animate-pulse' : p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}" style="width: ${hpPercent}%"></div>
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
      } else {
        const marker = playerMarkersRef.current.get(p.id);
        marker?.setLngLat([lng, lat]);
        const el = marker?.getElement();
        if (el) {
          el.className = `marker-player player-marker-${p.id} flex flex-col items-center select-none cursor-pointer transition-opacity duration-300`;
          el.setAttribute('data-entity', 'player');
          el.setAttribute('data-is-me', isMe ? 'true' : 'false');
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

        if (isCriticallyWounded || !p.isAlive) {
          if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
          kin.isMoving = false;
          kin.stopTimeout = null;
          updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, false, 'right');
        } else {
          // Cinemática del jugador
          const mov = computeEntityMovement(lat, lng, kin.anchorLat, kin.anchorLng);
          if (mov.isMoving) {
            kin.isMoving = true;
            kin.facingMode = mov.facingMode;
            kin.anchorLat = lat;
            kin.anchorLng = lng;

            if (kin.stopTimeout) clearTimeout(kin.stopTimeout);
            const currentKin = kin;
            currentKin.stopTimeout = setTimeout(() => {
              currentKin.isMoving = false;
              currentKin.stopTimeout = null;
              currentKin.anchorLat = lat;
              currentKin.anchorLng = lng;
              updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, false, currentKin.facingMode);
            }, 600);

            updateKinematicsDOM(`player-bounce-${p.id}`, `player-facing-${p.id}`, true, kin.facingMode);
          }
        }
      }
    });
  }, [players, myPlayer, mapLoaded, center.lat, center.lng, isMeWounded]);

  // ==========================================
  // 8.5. MARCADORES DE MASCOTAS ACOMPAÑANTES (ORBITANDO ALREDEDOR DE SUS DUEÑOS)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!center.lat || !center.lng || (center.lat === 0 && center.lng === 0)) return;

    const allPlayers = players.map((p) => (p.id === myPlayer.id ? myPlayer : p));
    const activeCompanionPetKeys = new Set<string>();

    allPlayers.forEach((p) => {
      const pPets = p.pets || [];
      if (pPets.length === 0) return;

      // Guardia estricta: si el jugador no cuenta con coordenadas geoespaciales válidas, no pintar mascotas
      const pLat = typeof p.lat === 'number' && !isNaN(p.lat) && p.lat !== 0 ? p.lat : (typeof center.lat === 'number' && !isNaN(center.lat) && center.lat !== 0 ? center.lat : null);
      const pLng = typeof p.lng === 'number' && !isNaN(p.lng) && p.lng !== 0 ? p.lng : (typeof center.lng === 'number' && !isNaN(center.lng) && center.lng !== 0 ? center.lng : null);

      if (pLat === null || pLng === null) {
        return;
      }

      const isInside = !!p.insideBuildingId;

      pPets.forEach((pet, index) => {
        const markerKey = `${p.id}_${pet.id}`;
        activeCompanionPetKeys.add(markerKey);

        // Formación táctica de escolta (flancos y retaguardia, despejando cabeza y torso)
        const totalPets = Math.max(1, pPets.length);
        const { x: offsetX, y: offsetY } = getPetEscortOffset(index, totalPets);

        if (!companionPetMarkersRef.current.has(markerKey)) {
          const el = document.createElement('div');
          // NO añadir clases absolute ni fixed; MapLibre gestiona la posición mediante transform
          el.className = 'marker-pet companion-pet-container pointer-events-none select-none';
          el.setAttribute('data-entity', 'pet');
          el.style.zIndex = '25';
          el.style.display = (isInside || isMeWounded) ? 'none' : 'block';

          el.innerHTML = `
            <div 
              id="pet-orbit-${markerKey}"
              class="relative flex flex-col items-center justify-center transition-transform duration-300 ease-out"
              style="transform: translate(${offsetX}px, ${offsetY}px);"
            >
              <div id="pet-avatar-${markerKey}" class="relative flex items-center justify-center">
                <img 
                  src="${pet.icon}" 
                  alt="${pet.name}" 
                  width="28" 
                  height="28" 
                  style="width: 28px !important; height: 28px !important; max-width: 28px !important; max-height: 28px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85)) ${
                    pet.isWounded ? '' : 'drop-shadow(0 0 6px rgba(52,211,153,0.7))'
                  };" 
                  class="select-none ${pet.isWounded ? 'grayscale opacity-60' : ''}" 
                />
              </div>
              ${pet.isWounded ? '<span class="text-[8px] animate-spin">💫</span>' : ''}
            </div>
          `;

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([pLng, pLat])
            .addTo(map);

          companionPetMarkersRef.current.set(markerKey, marker);
        } else {
          const marker = companionPetMarkersRef.current.get(markerKey);
          marker?.setLngLat([pLng, pLat]);
          const el = marker?.getElement();
          if (el) {
            el.className = 'marker-pet companion-pet-container pointer-events-none select-none';
            el.setAttribute('data-entity', 'pet');
            el.style.zIndex = '25';
            el.style.display = (isInside || isMeWounded) ? 'none' : 'block';
            const orbitEl = el.querySelector(`#pet-orbit-${markerKey}`) as HTMLElement;
            if (orbitEl) {
              orbitEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
            }
            const avatar = el.querySelector(`#pet-avatar-${markerKey}`);
            if (avatar) {
              avatar.className = 'relative flex items-center justify-center';
              avatar.innerHTML = `<img src="${pet.icon}" alt="${pet.name}" width="28" height="28" style="width: 28px !important; height: 28px !important; max-width: 28px !important; max-height: 28px !important; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.85)) ${
                pet.isWounded ? '' : 'drop-shadow(0 0 6px rgba(52,211,153,0.7))'
              };" class="select-none ${pet.isWounded ? 'grayscale opacity-60' : ''}" />`;
            }
          }
        }
      });
    });

    // Limpiar marcadores de mascotas que ya no están
    companionPetMarkersRef.current.forEach((marker, key) => {
      if (!activeCompanionPetKeys.has(key)) {
        marker.remove();
        companionPetMarkersRef.current.delete(key);
      }
    });
  }, [players, myPlayer, mapLoaded, center.lat, center.lng, isMeWounded]);

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
        el.className = 'marker-ping ping-marker select-none flex flex-col items-center pointer-events-none';
        el.setAttribute('data-entity', 'ping');
        if (isMeWounded) {
          el.style.display = 'none';
        }
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-10 h-10 bg-cyan-500/40 rounded-full animate-ping absolute pointer-events-none"></div>
            <div class="w-8 h-8 bg-black/80 border border-cyan-400 rounded-full flex items-center justify-center p-0.5 shadow-lg relative">
              <img src="${pingIcon}" alt="Ping ${ping.type}" width="24" height="24" style="width: 24px !important; height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain;" class="select-none" />
            </div>
          </div>
          <span class="mt-1 px-1.5 py-0.5 text-[9px] font-bold bg-black/80 text-cyan-300 rounded border border-cyan-500/50">
            ${ping.playerNickname}
          </span>
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
      const isHospital = struct?.type === 'hospital';
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
          const isVisible = (dist <= visionRadius || isRadarActive) && targetM.state !== 'dead' && targetM.hp > 0;
          el.style.display = !isMeWounded && isVisible ? 'block' : 'none';
        }
      }
    });

    // 2. Aplicar visibilidad de capas en MapLibre GL protegiendo contra estilo nulo o no cargado
    const applyMapLayerVisibility = () => {
      if (!isMapStyleLoaded(map)) return;

      const areaLayers = [
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
            map.setLayoutProperty(layerId, 'visibility', isMeWounded ? 'none' : 'visible');
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

      {/* AVISO TAP-TO-MOVE (Ubicado debajo del widget del cofre para evitar colisiones) */}
      {movementMode === 'manual' && myPlayer.isAlive && (
        <div className="absolute top-[118px] sm:top-52 left-3 sm:left-4 z-20 bg-hud-dark/75 border border-hud-cyan/30 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono text-hud-cyan/90 shadow pointer-events-none">
          👆 Toca el mapa para moverte ({PLAYER_SPEED_MPS[playerSpeed].toFixed(1)} m/s)
        </div>
      )}
    </div>
  );
};

export const GameMap = React.memo<GameMapProps>(GameMapComponent);
