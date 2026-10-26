import React, { useEffect, useRef, useState, useCallback } from 'react';
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
} from '../types/game';
import { createGeoJsonCircle, getDistanceMeters } from '../services/geoUtils';
import { getVisionRadius } from '../services/combatEngine';
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
  isRadarActive: boolean;
  onMapClick: (coords: Coordinates) => void;
  onReviveAttempt?: (targetPlayer: Player) => void;
}

export const GameMap: React.FC<GameMapProps> = ({
  center,
  playAreaRadius,
  treasureLocation,
  myPlayer,
  players,
  monster,
  crates,
  ghostPings,
  movementMode,
  isRadarActive,
  onMapClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);

  // Marcadores HTML mantenidos en refs para actualización fluida a 60 FPS
  const playerMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const monsterMarkerRef = useRef<maplibregl.Marker | null>(null);
  const chestMarkerRef = useRef<maplibregl.Marker | null>(null);
  const crateMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const pingMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const [followPlayer, setFollowPlayer] = useState<boolean>(true);

  // ==========================================
  // INICIALIZACIÓN DEL MAPA
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

      // 1. CAPA DE ÁREA DE JUEGO
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

      // 2. CAPA DEL COFRE DEL TESORO (RADIO DE INTERACCIÓN 20m)
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

      // 3. CAPA DE NIEBLA DE GUERRA / RADIO DE VISIÓN DEL JUGADOR
      const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
      const visionRadius = getVisionRadius(myPlayer.role, isRadarActive);
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
    });

    // Control de clic para movimiento o pings
    map.on('click', (e) => {
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Desactivar seguimiento si el usuario arrastra el mapa manualmente
    map.on('dragstart', () => {
      setFollowPlayer(false);
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

      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
    };
  }, []);

  // ==========================================
  // ACTUALIZACIÓN DE RADIO DE VISIÓN, ÁREA DE JUEGO Y ZONA DEL TESORO
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    // Actualizar radio de visión del jugador
    const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
    const visionRadius = getVisionRadius(myPlayer.role, isRadarActive);
    const visionSource = map.getSource('player-vision') as maplibregl.GeoJSONSource;
    if (visionSource) {
      visionSource.setData(createGeoJsonCircle(myCoords, Math.min(visionRadius, playAreaRadius)));
    }

    // Actualizar polígono del área de juego
    const playAreaSource = map.getSource('play-area') as maplibregl.GeoJSONSource;
    if (playAreaSource) {
      playAreaSource.setData(createGeoJsonCircle(center, playAreaRadius));
    }

    // Actualizar zona del tesoro
    const treasureSource = map.getSource('treasure-zone') as maplibregl.GeoJSONSource;
    if (treasureSource) {
      treasureSource.setData(createGeoJsonCircle(treasureLocation, 20));
    }
  }, [
    myPlayer.lat,
    myPlayer.lng,
    myPlayer.role,
    isRadarActive,
    playAreaRadius,
    center.lat,
    center.lng,
    treasureLocation.lat,
    treasureLocation.lng,
  ]);

  // Si cambia el centro del juego y aún no hay jugador posicionado, reenfocar la cámara
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
  // MARCADOR DEL COFRE DEL TESORO
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
  }, [treasureLocation]);

  // ==========================================
  // MARCADORES DE CAJAS DE SUMINISTROS (AIRDROPS)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Eliminar marcadores que ya no existan o estén abiertos
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

      if (!crateMarkersRef.current.has(crate.id)) {
        const el = document.createElement('div');
        el.className = 'crate-marker flex flex-col items-center select-none cursor-pointer';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-9 h-9 bg-emerald-600 border-2 border-emerald-300 rounded-md shadow-md shadow-emerald-500/40 flex items-center justify-center text-white text-base">
              📦
            </div>
          </div>
          <span class="mt-0.5 px-1.5 py-0.2 text-[9px] font-bold bg-hud-dark/90 border border-emerald-500/50 text-emerald-300 rounded">
            Loot (40m)
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
  // MARCADOR DEL MONSTRUO (CON NIEBLA DE GUERRA Y ANCLAJE PRECISO)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const myCoords = { lat: myPlayer.lat ?? center.lat, lng: myPlayer.lng ?? center.lng };
    const distToMonster = getDistanceMeters(myCoords, monster);
    const visionRadius = getVisionRadius(myPlayer.role, isRadarActive);
    const isVisible = distToMonster <= visionRadius || isRadarActive;
    const isAlive = monster.state !== 'dead' && monster.hp > 0;

    // Si el monstruo no debe ser visible o está muerto, ocultar mediante style.display
    // (no destruimos el marcador para evitar desanclaje o recreaciones continuas)
    if (!isVisible || !isAlive) {
      if (monsterMarkerRef.current) {
        monsterMarkerRef.current.getElement().style.display = 'none';
      }
      return;
    }

    const hpPercent = Math.max(0, Math.min(100, (monster.hp / monster.maxHp) * 100));
    const isEnraged = monster.isEnraged || monster.state === 'enraged';

    // 1. Crear el marcador una única vez si no existe aún
    if (!monsterMarkerRef.current) {
      const el = document.createElement('div');
      // NOTA CRÍTICA: Jamás usar transition-transform en el contenedor del marcador
      // ya que rompe la sincronización del ciclo de proyección por transform de MapLibre GL
      // provocando que el monstruo flote o se deslice al arrastrar o hacer zoom.
      el.className = 'monster-marker flex flex-col items-center select-none pointer-events-none';
      el.id = 'monster-hud-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div id="monster-glow" class="absolute ${isEnraged ? 'w-16 h-16 bg-red-600/40 animate-ping' : 'w-14 h-14 bg-purple-600/30 animate-pulse'} rounded-full"></div>
          <div id="monster-avatar" class="w-12 h-12 ${isEnraged ? 'bg-red-700 border-2 border-red-400' : 'bg-purple-800 border-2 border-purple-400'} rounded-full shadow-2xl flex items-center justify-center text-2xl">
            👹
          </div>
        </div>
        <div class="w-16 mt-1 bg-hud-dark/90 p-0.5 rounded border border-red-500/50">
          <div class="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div id="monster-hp-bar" class="h-full ${isEnraged ? 'bg-red-500' : 'bg-purple-500'}" style="width: ${hpPercent}%"></div>
          </div>
          <span id="monster-status-text" class="block text-center text-[9px] font-black text-red-300 uppercase tracking-tighter">
            ${isEnraged ? 'Fase 2: Furia' : 'Monstruo'}
          </span>
        </div>
      `;

      monsterMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([monster.lng, monster.lat])
        .addTo(map);
    } else {
      // 2. Si ya existe, asegurar visibilidad, actualizar posición fija y actualizar atributos DOM
      const markerEl = monsterMarkerRef.current.getElement();
      markerEl.style.display = '';
      monsterMarkerRef.current.setLngLat([monster.lng, monster.lat]);

      const hpBar = markerEl.querySelector('#monster-hp-bar') as HTMLElement | null;
      if (hpBar) {
        hpBar.style.width = `${hpPercent}%`;
        hpBar.className = `h-full ${isEnraged ? 'bg-red-500' : 'bg-purple-500'}`;
      }

      const glow = markerEl.querySelector('#monster-glow');
      if (glow) {
        glow.className = `absolute ${isEnraged ? 'w-16 h-16 bg-red-600/40 animate-ping' : 'w-14 h-14 bg-purple-600/30 animate-pulse'} rounded-full`;
      }

      const avatar = markerEl.querySelector('#monster-avatar');
      if (avatar) {
        avatar.className = `w-12 h-12 ${isEnraged ? 'bg-red-700 border-2 border-red-400' : 'bg-purple-800 border-2 border-purple-400'} rounded-full shadow-2xl flex items-center justify-center text-2xl`;
      }

      const statusText = markerEl.querySelector('#monster-status-text');
      if (statusText) {
        statusText.textContent = isEnraged ? 'Fase 2: Furia' : 'Monstruo';
      }
    }
  }, [
    monster.lat,
    monster.lng,
    monster.hp,
    monster.maxHp,
    monster.state,
    monster.isEnraged,
    myPlayer.lat,
    myPlayer.lng,
    myPlayer.role,
    isRadarActive,
    center.lat,
    center.lng,
  ]);

  // ==========================================
  // MARCADORES DE JUGADORES (ALIADOS Y PROPIO)
  // ==========================================
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const allPlayers = players.map((p) => (p.id === myPlayer.id ? myPlayer : p));
    const activePlayerIds = new Set(allPlayers.map((p) => p.id));

    // Eliminar marcadores obsoletos
    playerMarkersRef.current.forEach((marker, id) => {
      if (!activePlayerIds.has(id)) {
        marker.remove();
        playerMarkersRef.current.delete(id);
      }
    });

    allPlayers.forEach((p) => {
      const lat = p.lat ?? center.lat;
      const lng = p.lng ?? center.lng;
      const isMe = p.id === myPlayer.id;
      const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));

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

      if (!playerMarkersRef.current.has(p.id)) {
        const el = document.createElement('div');
        el.className = `player-marker-${p.id} flex flex-col items-center select-none cursor-pointer`;

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${isMe ? '<div class="absolute w-12 h-12 bg-cyan-400/20 rounded-full animate-ping"></div>' : ''}
            <div class="w-9 h-9 rounded-full ${p.isAlive ? roleColors[p.role] : 'bg-gray-700 border-gray-400'} border-2 shadow-lg flex items-center justify-center text-sm font-bold text-white">
              ${p.isAlive ? roleIcons[p.role] : '🪦'}
            </div>
          </div>
          <div class="mt-0.5 px-1.5 py-0.5 bg-hud-dark/95 border ${isMe ? 'border-cyan-400' : 'border-hud-border'} rounded shadow text-center min-w-[50px]">
            <span class="block text-[10px] font-bold ${isMe ? 'text-cyan-300' : 'text-slate-200'} truncate max-w-[65px]">
              ${p.nickname}${isMe ? ' (Tú)' : ''}
            </span>
            <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
              <div id="hp-bar-${p.id}" class="h-full ${p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}" style="width: ${hpPercent}%"></div>
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
        const hpBar = document.getElementById(`hp-bar-${p.id}`);
        if (hpBar) {
          hpBar.style.width = `${hpPercent}%`;
          hpBar.className = `h-full ${p.isAlive ? (hpPercent < 30 ? 'bg-red-500' : 'bg-emerald-400') : 'bg-gray-600'}`;
        }
      }
    });

    // Centrar en el jugador propio si el seguimiento está activo
    if (followPlayer && myPlayer.lat && myPlayer.lng) {
      map.easeTo({
        center: [myPlayer.lng, myPlayer.lat],
        duration: 400,
      });
    }
  }, [players, myPlayer, followPlayer, center]);

  // ==========================================
  // MARCADORES DE PINGS DE FANTASMA
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

        // Auto-eliminar a los 8 segundos
        setTimeout(() => {
          marker.remove();
          pingMarkersRef.current.delete(ping.id);
        }, 8000);
      }
    });
  }, [ghostPings]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-hud-dark">
      <div ref={mapContainerRef} id="map" className="w-full h-full" />

      {/* BOTÓN DE CENTRAR CÁMARA */}
      <button
        onClick={() => {
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
          👆 Toca el mapa para moverte (1.4 m/s)
        </div>
      )}
    </div>
  );
};
