import React, { useEffect, useRef, useState } from 'react';
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
import { PLAYER_SPEED_MPS } from '../types/game';
import { createGeoJsonCircle, getDistanceMeters } from '../services/geoUtils';
import { getVisionRadius, getCrateVisualInfo } from '../services/combatEngine';
import { Locate, Compass } from 'lucide-react';

interface GameMapProps {
  center: Coordinates;
  playAreaRadius: number;
  treasureLocation: Coordinates;
  myPlayer: Player;
  players: Player[];
  monster: Monster;
  crates: SupplyCrate[];
  ghostPings: GhostPing[];
  movementMode: MovementMode;
  playerSpeed?: PlayerSpeed;
  isRadarActive: boolean;
  structures?: MapStructure[];
  droppedItems?: DroppedItem[];
  wildPets?: WildPet[];
  inCombat?: boolean;
  onMapClick: (coords: Coordinates) => void;
  onReviveAttempt?: (targetPlayer: Player) => void;
  onPickDroppedItem?: (dropped: DroppedItem) => void;
}

const GameMapComponent: React.FC<GameMapProps> = ({
  center,
  playAreaRadius,
  treasureLocation,
  myPlayer,
  players,
  monster,
  crates,
  ghostPings,
  movementMode,
  playerSpeed = 'normal',
  isRadarActive,
  structures = [],
  droppedItems = [],
  wildPets = [],
  inCombat = false,
  onMapClick,
  onPickDroppedItem,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);

  const inCombatRef = useRef(inCombat);
  inCombatRef.current = inCombat;

  // Marcadores HTML persistentes en refs para animación a 60 FPS sin re-renderizar React
  const playerMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const monsterMarkerRef = useRef<maplibregl.Marker | null>(null);
  const chestMarkerRef = useRef<maplibregl.Marker | null>(null);
  const crateMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pingMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const structureMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const droppedItemMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const wildPetMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const companionPetMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const onPickDroppedItemRef = useRef(onPickDroppedItem);
  onPickDroppedItemRef.current = onPickDroppedItem;

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

  const lastCameraPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastVisionPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // ==========================================
  // 1. INICIALIZACIÓN DEL MAPA WEBGL
  // ==========================================
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [center.lng, center.lat],
      zoom: 16.5,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });

    map.on('load', () => {
      isMapLoadedRef.current = true;
      setMapLoaded(true);

      // 1. Capa estática: Área de juego
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
          'fill-opacity': 0.05,
        },
      });

      map.addLayer({
        id: 'play-area-outline',
        type: 'line',
        source: 'play-area',
        paint: {
          'line-color': '#00f0ff',
          'line-width': 2.5,
          'line-opacity': 0.7,
          'line-dasharray': [3, 2],
        },
      });

      // 2. Capa estática: Zona del cofre del tesoro (20m)
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
          'fill-opacity': 0.22,
        },
      });

      map.addLayer({
        id: 'treasure-zone-outline',
        type: 'line',
        source: 'treasure-zone',
        paint: {
          'line-color': '#ffaa00',
          'line-width': 2,
          'line-opacity': 0.9,
        },
      });

      // 3. Capa dinámica: Radio de visión del jugador
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
        paint: {
          'line-color': '#00ff88',
          'line-width': 1.5,
          'line-opacity': 0.4,
          'line-dasharray': [2, 3],
        },
      });

      // 4. Capas dinámicas: Radio de interacción de suministros (40m)
      map.addSource('crates-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'crates-zones-fill',
        type: 'fill',
        source: 'crates-zones',
        paint: {
          'fill-color': '#00ffaa',
          'fill-opacity': 0.08,
        },
      });

      map.addLayer({
        id: 'crates-zones-outline',
        type: 'line',
        source: 'crates-zones',
        paint: {
          'line-color': '#00ffaa',
          'line-width': 1.5,
          'line-opacity': 0.35,
          'line-dasharray': [2, 2],
        },
      });

      // 5. Capas tácticas: Zonas de estructuras (Hospital y Refugios)
      map.addSource('structures-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'structures-zones-fill',
        type: 'fill',
        source: 'structures-zones',
        paint: {
          'fill-color': ['match', ['get', 'type'], 'hospital', '#10b981', '#06b6d4'],
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'structures-zones-outline',
        type: 'line',
        source: 'structures-zones',
        paint: {
          'line-color': ['match', ['get', 'type'], 'hospital', '#34d399', '#22d3ee'],
          'line-width': 1.8,
          'line-opacity': 0.8,
          'line-dasharray': [3, 2],
        },
      });
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
      if (monsterMarkerRef.current) {
        monsterMarkerRef.current.remove();
        monsterMarkerRef.current = null;
      }
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
    if (!map || !isMapLoadedRef.current) return;

    const playAreaSource = map.getSource('play-area') as maplibregl.GeoJSONSource;
    if (playAreaSource) {
      playAreaSource.setData(createGeoJsonCircle(center, playAreaRadius));
    }

    const treasureSource = map.getSource('treasure-zone') as maplibregl.GeoJSONSource;
    if (treasureSource) {
      treasureSource.setData(createGeoJsonCircle(treasureLocation, 20));
    }
  }, [center.lat, center.lng, playAreaRadius, treasureLocation.lat, treasureLocation.lng]);

  // ==========================================
  // 3. ACTUALIZACIÓN EFICIENTE DEL RADIO DE VISIÓN (Throttled por desplazamiento)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

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
    const visionSource = map.getSource('player-vision') as maplibregl.GeoJSONSource;
    if (visionSource) {
      visionSource.setData(createGeoJsonCircle({ lat: myLat, lng: myLng }, Math.min(visionRadius, playAreaRadius)));
    }
  }, [
    myPlayer.lat,
    myPlayer.lng,
    myPlayer.role,
    isRadarActive,
    playAreaRadius,
    center.lat,
    center.lng,
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
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!chestMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'treasure-marker cursor-pointer flex flex-col items-center select-none';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 bg-amber-500/20 rounded-full animate-ping"></div>
          <div class="w-10 h-10 bg-amber-500 border-2 border-yellow-200 rounded-lg shadow-lg shadow-amber-500/50 flex items-center justify-center text-xl text-black font-black">
            👑
          </div>
        </div>
        <span class="mt-1 px-2 py-0.5 text-[10px] font-bold bg-hud-dark/90 border border-amber-500/60 text-amber-300 rounded uppercase tracking-wider">
          Tesoro
        </span>
      `;

      chestMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([treasureLocation.lng, treasureLocation.lat])
        .addTo(map);
    } else {
      chestMarkerRef.current.setLngLat([treasureLocation.lng, treasureLocation.lat]);
    }
  }, [treasureLocation.lat, treasureLocation.lng]);

  // ==========================================
  // 6. MARCADORES Y RADIOS DE CAJAS DE SUMINISTROS (AIRDROPS)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Actualizar zonas de interacción de 40m translúcidas en el mapa
    if (isMapLoadedRef.current) {
      const source = map.getSource('crates-zones') as maplibregl.GeoJSONSource;
      if (source) {
        const activeCrates = crates.filter((c) => !c.opened);
        const features = activeCrates.map(
          (c) => createGeoJsonCircle({ lat: c.lat, lng: c.lng }, 40)
        );
        source.setData({
          type: 'FeatureCollection',
          features,
        });
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
        el.className = 'crate-marker flex flex-col items-center select-none cursor-pointer';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 ${info.glowColor} rounded-full animate-ping"></div>
            <div class="w-9 h-9 ${info.badgeBg} border-2 ${info.borderColor} rounded-lg shadow-lg flex items-center justify-center text-lg">
              ${info.icon}
            </div>
          </div>
          <span class="mt-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-hud-dark/95 border ${info.borderColor} ${info.textColor} rounded uppercase tracking-wider whitespace-nowrap shadow-md">
            ${info.label} (40m)
          </span>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([crate.lng, crate.lat])
          .addTo(map);

        crateMarkersRef.current.set(crate.id, marker);
      } else {
        crateMarkersRef.current.get(crate.id)?.setLngLat([crate.lng, crate.lat]);
      }
    });
  }, [crates]);

  // ==========================================
  // 6.5. MARCADORES Y RADIOS DE ESTRUCTURAS TÁCTICAS (Hospital y Refugios)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Actualizar zonas de interacción en el mapa
    if (isMapLoadedRef.current) {
      const source = map.getSource('structures-zones') as maplibregl.GeoJSONSource;
      if (source) {
        const features = structures.map((s) => {
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
      const icon = isHospital ? '🏥' : '🏠';
      const aura = isHospital ? 'bg-emerald-500/25 animate-ping' : 'bg-cyan-500/20';
      const label = isHospital ? `HOSPITAL (${structure.radius}m)` : `${structure.name.toUpperCase()} (${structure.radius}m)`;

      if (!structureMarkersRef.current.has(structure.id)) {
        const el = document.createElement('div');
        el.className = `structure-marker-${structure.id} flex flex-col items-center select-none pointer-events-none`;
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-12 h-12 ${aura} rounded-full"></div>
            <div class="w-10 h-10 ${isHospital ? 'bg-emerald-950/90' : 'bg-cyan-950/90'} border-2 ${badgeBorder} rounded-xl shadow-lg flex items-center justify-center text-xl">
              ${icon}
            </div>
          </div>
          <span class="mt-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-hud-dark/95 border ${badgeBorder} ${badgeText} rounded uppercase tracking-wider whitespace-nowrap shadow-md">
            ${label}
          </span>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([structure.lng, structure.lat])
          .addTo(map);

        structureMarkersRef.current.set(structure.id, marker);
      } else {
        structureMarkersRef.current.get(structure.id)?.setLngLat([structure.lng, structure.lat]);
      }
    });
  }, [structures]);

  // ==========================================
  // 6.6. MARCADORES DE OBJETOS DESCARTADOS EN EL MAPA
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentDroppedIds = new Set(droppedItems.map((d) => d.id));
    droppedItemMarkersRef.current.forEach((marker, id) => {
      if (!currentDroppedIds.has(id)) {
        marker.remove();
        droppedItemMarkersRef.current.delete(id);
      }
    });

    const getTierStyle = (tier: number) => {
      switch (tier) {
        case 7:
          return { border: 'border-red-500', bg: 'bg-red-950/90', text: 'text-red-300', aura: 'bg-red-500/30', icon: '🚀' };
        case 6:
          return { border: 'border-orange-500', bg: 'bg-orange-950/90', text: 'text-orange-300', aura: 'bg-orange-500/30', icon: '💣' };
        case 5:
          return { border: 'border-cyan-400', bg: 'bg-cyan-950/90', text: 'text-cyan-300', aura: 'bg-cyan-500/30', icon: '🎯' };
        case 4:
          return { border: 'border-purple-400', bg: 'bg-purple-950/90', text: 'text-purple-300', aura: 'bg-purple-500/30', icon: '💥' };
        case 3:
          return { border: 'border-blue-400', bg: 'bg-blue-950/90', text: 'text-blue-300', aura: 'bg-blue-500/30', icon: '⚡' };
        case 2:
          return { border: 'border-amber-400', bg: 'bg-amber-950/90', text: 'text-amber-300', aura: 'bg-amber-500/30', icon: '🪓' };
        default:
          return { border: 'border-emerald-400', bg: 'bg-emerald-950/90', text: 'text-emerald-300', aura: 'bg-emerald-500/30', icon: '🗡️' };
      }
    };

    droppedItems.forEach((dropped) => {
      if (!droppedItemMarkersRef.current.has(dropped.id)) {
        const style = getTierStyle(dropped.item.tier);
        const el = document.createElement('div');
        el.className = `dropped-item-${dropped.id} flex flex-col items-center select-none cursor-pointer group`;
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-10 h-10 ${style.aura} rounded-full animate-ping"></div>
            <div class="w-8 h-8 ${style.bg} border-2 ${style.border} rounded-lg shadow-lg flex items-center justify-center text-sm transition-transform group-hover:scale-110">
              ${style.icon}
            </div>
          </div>
          <span class="mt-0.5 px-1 py-0.5 text-[8px] font-mono font-bold bg-hud-dark/95 border ${style.border} ${style.text} rounded uppercase tracking-wider whitespace-nowrap shadow-md">
            ${dropped.item.name} (T${dropped.item.tier})
          </span>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onPickDroppedItemRef.current?.(dropped);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([dropped.lng, dropped.lat])
          .addTo(map);

        droppedItemMarkersRef.current.set(dropped.id, marker);
      } else {
        droppedItemMarkersRef.current.get(dropped.id)?.setLngLat([dropped.lng, dropped.lat]);
      }
    });
  }, [droppedItems]);

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
        el.className = `wild-pet-marker-${wp.id} flex flex-col items-center select-none cursor-pointer animate-bounce`;
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.25s ease-out';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-emerald-400/20 animate-ping absolute"></div>
            <div class="w-8 h-8 rounded-full bg-emerald-950/90 border-2 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)] flex items-center justify-center text-base">
              ${wp.pet.icon}
            </div>
          </div>
          <span class="mt-0.5 px-1 py-0.5 text-[8px] font-mono font-bold bg-hud-dark/95 border border-emerald-500/70 text-emerald-300 rounded uppercase tracking-wider whitespace-nowrap shadow-md">
            ${wp.pet.name}
          </span>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([wp.lng, wp.lat])
          .addTo(map);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.opacity = '1';
          });
        });

        wildPetMarkersRef.current.set(wp.id, marker);
      } else {
        wildPetMarkersRef.current.get(wp.id)?.setLngLat([wp.lng, wp.lat]);
      }
    });
  }, [wildPets, mapLoaded, center.lat, center.lng]);

  // ==========================================
  // 7. MARCADOR DEL MONSTRUO (Anclaje nativo MapLibre GL y niebla de guerra)
  // ==========================================
  const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
  const distToMonster = getDistanceMeters(myCoords, monster);
  const hasActiveDrone = (myPlayer.pets || []).some((p) => p.type === 'drone' && !p.isWounded);
  const visionRadius = getVisionRadius(myPlayer.role, isRadarActive, hasActiveDrone);
  const isMonsterVisible =
    (distToMonster <= visionRadius || isRadarActive) &&
    monster.state !== 'dead' &&
    monster.hp > 0;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Crear el elemento DOM del marcador una sola vez
    if (!monsterMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'monster-map-marker select-none pointer-events-none';
      el.innerHTML = `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div class="w-12 h-12 bg-red-600/30 rounded-full animate-ping absolute"></div>
          <div class="w-10 h-10 bg-red-950 border-2 border-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/50">
            <span class="text-xl">👹</span>
          </div>
          <div class="absolute -top-4 w-14 bg-black/80 rounded h-1.5 overflow-hidden border border-red-500/40">
            <div id="monster-hp-bar" class="bg-red-500 h-full transition-all duration-300" style="width: 100%"></div>
          </div>
        </div>
      `;

      monsterMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([monster.lng, monster.lat])
        .addTo(map);
    } else {
      // Actualizar posición de forma fluida sin recrear el DOM
      monsterMarkerRef.current.setLngLat([monster.lng, monster.lat]);
      const hpBar = document.getElementById('monster-hp-bar');
      if (hpBar) {
        hpBar.style.width = `${Math.max(0, (monster.hp / monster.maxHp) * 100)}%`;
      }
    }

    // Visibilidad condicionada a la niebla de guerra
    const element = monsterMarkerRef.current.getElement();
    if (element) {
      element.style.display = isMonsterVisible ? 'block' : 'none';
    }
  }, [monster.lat, monster.lng, monster.hp, monster.maxHp, isMonsterVisible]);

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
        marker.remove();
        playerMarkersRef.current.delete(id);
      }
    });

    const roleIcons: Record<PlayerRole, string> = {
      medic: '✚',
      tank: '🛡',
      scout: '👁',
      marksman: '🎯',
    };

    const roleColors: Record<PlayerRole, string> = {
      medic: 'border-emerald-400 bg-emerald-700',
      tank: 'border-blue-400 bg-blue-700',
      scout: 'border-amber-400 bg-amber-700',
      marksman: 'border-red-400 bg-red-700',
    };

    allPlayers.forEach((p) => {
      const lat = p.lat ?? center.lat;
      const lng = p.lng ?? center.lng;
      const isMe = p.id === myPlayer.id;
      const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
      const isCriticallyWounded = p.isCriticallyWounded || p.status === 'critically_wounded';
      const isInside = !!p.insideBuildingId;

      const avatarIconContent = isCriticallyWounded
        ? '🩸'
        : p.isAlive
        ? roleIcons[p.role]
        : '🪦';

      const avatarClasses = isCriticallyWounded
        ? 'bg-red-900 border-red-500 animate-pulse'
        : p.isAlive
        ? roleColors[p.role]
        : 'bg-gray-700 border-gray-400';

      const statusLabel = isCriticallyWounded
        ? `${p.nickname} [HERIDO]`
        : isInside
        ? `${p.nickname} [${p.insideBuildingType === 'hospital' ? 'HOSPITAL' : 'A CUBIERTO'}]`
        : `${p.nickname}${isMe ? ' (Tú)' : ''}`;

      if (!playerMarkersRef.current.has(p.id)) {
        const el = document.createElement('div');
        el.className = `player-marker-${p.id} flex flex-col items-center select-none cursor-pointer transition-opacity duration-300`;
        if (isMe && isInside) {
          el.style.display = 'none';
        } else if (!isMe && isInside) {
          el.style.opacity = '0.75';
        }

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${isMe ? '<div class="absolute w-12 h-12 bg-cyan-400/20 rounded-full animate-ping"></div>' : ''}
            <div id="avatar-icon-${p.id}" class="w-9 h-9 rounded-full ${avatarClasses} border-2 shadow-lg flex items-center justify-center text-sm font-bold text-white">
              ${avatarIconContent}
            </div>
          </div>
          <div class="mt-0.5 px-1.5 py-0.5 bg-hud-dark/95 border ${isMe ? 'border-cyan-400' : isCriticallyWounded ? 'border-red-500' : 'border-hud-border'} rounded shadow text-center min-w-[50px]">
            <span id="player-label-${p.id}" class="block text-[10px] font-bold ${isMe ? 'text-cyan-300' : isCriticallyWounded ? 'text-red-400 font-black' : 'text-slate-200'} truncate max-w-[85px]">
              ${statusLabel}
            </span>
            <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
              <div id="hp-bar-${p.id}" class="h-full ${isCriticallyWounded ? 'bg-red-500 animate-pulse' : p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}" style="width: ${hpPercent}%"></div>
            </div>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);

        playerMarkersRef.current.set(p.id, marker);
      } else {
        const marker = playerMarkersRef.current.get(p.id);
        marker?.setLngLat([lng, lat]);
        const el = marker?.getElement();
        if (el) {
          if (isMe && isInside) {
            el.style.display = 'none';
          } else {
            el.style.display = 'flex';
            el.style.opacity = !isMe && isInside ? '0.75' : '1';
          }
        }
        const hpBar = document.getElementById(`hp-bar-${p.id}`);
        if (hpBar) {
          hpBar.style.width = `${hpPercent}%`;
          hpBar.className = `h-full ${isCriticallyWounded ? 'bg-red-500 animate-pulse' : p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}`;
        }
        const avatarIcon = document.getElementById(`avatar-icon-${p.id}`);
        if (avatarIcon) {
          avatarIcon.className = `w-9 h-9 rounded-full ${avatarClasses} border-2 shadow-lg flex items-center justify-center text-sm font-bold text-white`;
          avatarIcon.textContent = avatarIconContent;
        }
        const playerLabel = document.getElementById(`player-label-${p.id}`);
        if (playerLabel) {
          playerLabel.textContent = statusLabel;
          playerLabel.className = `block text-[10px] font-bold ${isMe ? 'text-cyan-300' : isCriticallyWounded ? 'text-red-400 font-black' : 'text-slate-200'} truncate max-w-[85px]`;
        }
      }
    });
  }, [players, myPlayer, mapLoaded, center.lat, center.lng]);

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

        // Dispersión cosmética alrededor del jugador (2 a 3 metros de offset)
        // 1 metro de latitud ~ 0.000009 grados
        const angle = (index * (360 / Math.max(1, pPets.length))) * (Math.PI / 180);
        const offsetMeters = 2.5;
        const petLat = pLat + (Math.sin(angle) * offsetMeters * 0.000009);
        const cosLat = Math.cos((pLat * Math.PI) / 180);
        const petLng = pLng + (Math.cos(angle) * offsetMeters * 0.000009) / (cosLat !== 0 ? cosLat : 1);

        if (isNaN(petLat) || isNaN(petLng) || (petLat === 0 && petLng === 0)) {
          return;
        }

        if (!companionPetMarkersRef.current.has(markerKey)) {
          const el = document.createElement('div');
          el.className = `companion-pet-${markerKey} flex flex-col items-center select-none pointer-events-none transition-all duration-300`;
          el.style.opacity = '0';
          el.style.transition = 'opacity 0.25s ease-out';
          if (isInside) {
            el.style.display = 'none';
          }

          el.innerHTML = `
            <div id="pet-avatar-${markerKey}" class="w-6 h-6 rounded-full bg-slate-900/90 border ${
              pet.isWounded ? 'border-gray-500 grayscale opacity-60' : 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
            } flex items-center justify-center text-xs">
              ${pet.icon}
            </div>
            ${pet.isWounded ? '<span class="text-[8px] animate-spin">💫</span>' : ''}
          `;

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([petLng, petLat])
            .addTo(map);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.opacity = '1';
            });
          });

          companionPetMarkersRef.current.set(markerKey, marker);
        } else {
          const marker = companionPetMarkersRef.current.get(markerKey);
          marker?.setLngLat([petLng, petLat]);
          const el = marker?.getElement();
          if (el) {
            el.style.display = isInside ? 'none' : 'flex';
            const avatar = el.querySelector(`#pet-avatar-${markerKey}`);
            if (avatar) {
              avatar.className = `w-6 h-6 rounded-full bg-slate-900/90 border ${
                pet.isWounded ? 'border-gray-500 grayscale opacity-60' : 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
              } flex items-center justify-center text-xs`;
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
  }, [players, myPlayer, mapLoaded, center.lat, center.lng]);

  // ==========================================
  // 9. MARCADORES DE PINGS DE FANTASMA
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    ghostPings.forEach((ping) => {
      if (!pingMarkersRef.current.has(ping.id)) {
        const el = document.createElement('div');
        el.className = 'ping-marker select-none flex flex-col items-center pointer-events-none';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-12 h-12 bg-cyan-500/40 rounded-full animate-ping"></div>
            <div class="w-6 h-6 bg-cyan-400 border border-white rounded-full flex items-center justify-center text-xs font-black text-black">
              !
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
  }, [ghostPings]);

  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-hud-dark ${inCombat ? 'pointer-events-none' : ''}`}>
      <div ref={mapContainerRef} id="map" className="w-full h-full" />

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
        className={`absolute bottom-28 right-4 z-20 p-3 rounded-full border shadow-xl backdrop-blur-md transition-all ${
          followPlayer
            ? 'bg-hud-cyan/20 border-hud-cyan text-hud-cyan shadow-hud-cyan/30'
            : 'bg-hud-card/80 border-hud-border text-hud-muted hover:text-white'
        }`}
        title="Centrar en mi posición"
      >
        <Locate className="w-6 h-6" />
      </button>

      {/* BRÚJULA / COMPÁS HUD TÁCTICO */}
      <div className="absolute top-20 right-4 z-20 pointer-events-none flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-hud-dark/80 border border-hud-cyan/40 backdrop-blur-sm flex items-center justify-center shadow-lg">
          <Compass className="w-6 h-6 text-hud-cyan animate-pulse" />
        </div>
        <span className="text-[9px] font-mono font-bold text-hud-cyan tracking-widest mt-0.5">
          NORTE
        </span>
      </div>

      {/* AVISO TAP-TO-MOVE */}
      {movementMode === 'manual' && myPlayer.isAlive && (
        <div className="absolute top-20 left-4 z-20 bg-hud-dark/80 border border-hud-cyan/40 backdrop-blur-sm px-2.5 py-1 rounded text-[11px] font-mono text-hud-cyan shadow pointer-events-none">
          👆 Toca el mapa para moverte ({PLAYER_SPEED_MPS[playerSpeed].toFixed(1)} m/s)
        </div>
      )}
    </div>
  );
};

export const GameMap = React.memo<GameMapProps>(GameMapComponent);
