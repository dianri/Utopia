import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Check, Crosshair, Navigation, MapPin } from 'lucide-react';
import type { Coordinates } from '../../types/game';
import { MAP_STYLES } from '../GameMap';
import { createGeoJsonCircle } from '../../services/geoUtils';

export interface LocationPickerModalProps {
  isOpen: boolean;
  initialCenter: Coordinates;
  radiusMeters: number;
  onConfirm: (coords: Coordinates) => void;
  onCancel: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  initialCenter,
  radiusMeters,
  onConfirm,
  onCancel,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [selectedCoords, setSelectedCoords] = useState<Coordinates>(initialCenter);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Sincronizar coordenadas seleccionadas con el centro inicial cuando se abre
  useEffect(() => {
    if (isOpen) {
      setSelectedCoords(initialCenter);
    }
  }, [isOpen, initialCenter]);

  // Inicializar mapa MapLibre GL
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Calcular zoom adecuado para visualizar todo el perímetro del radio
    const calculatedZoom = Math.max(
      12,
      Math.min(17, Math.round(16 - Math.log2(radiusMeters / 300)))
    );

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.satellite,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: calculatedZoom,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Crear elemento visual táctico personalizado para el marcador
    const markerEl = document.createElement('div');
    markerEl.className = 'tactical-location-marker relative flex flex-col items-center cursor-grab active:cursor-grabbing select-none';
    markerEl.style.touchAction = 'none';
    markerEl.innerHTML = `
      <div class="relative flex items-center justify-center">
        <span class="absolute -inset-2 rounded-full bg-cyan-400/30 animate-ping pointer-events-none"></span>
        <div class="w-9 h-9 rounded-full bg-slate-950/90 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.7)]">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </div>
      </div>
      <div class="w-0.5 h-3 bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]"></div>
      <div class="w-1.5 h-1.5 rounded-full bg-cyan-300"></div>
    `;

    const marker = new maplibregl.Marker({
      element: markerEl,
      draggable: true,
      anchor: 'bottom',
    })
      .setLngLat([initialCenter.lng, initialCenter.lat])
      .addTo(map);

    markerRef.current = marker;

    const updateCoordsAndRadius = (coords: Coordinates) => {
      setSelectedCoords(coords);
      const source = map.getSource('picker-radius-source') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(createGeoJsonCircle(coords, radiusMeters, 64));
      }
    };

    // Al arrastrar el pin sobre el mapa
    marker.on('drag', () => {
      const lngLat = marker.getLngLat();
      updateCoordsAndRadius({
        lat: Number(lngLat.lat.toFixed(6)),
        lng: Number(lngLat.lng.toFixed(6)),
      });
    });

    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      updateCoordsAndRadius({
        lat: Number(lngLat.lat.toFixed(6)),
        lng: Number(lngLat.lng.toFixed(6)),
      });
    });

    // Al tocar / hacer clic en cualquier punto del mapa
    map.on('click', (e) => {
      const clickedCoords: Coordinates = {
        lat: Number(e.lngLat.lat.toFixed(6)),
        lng: Number(e.lngLat.lng.toFixed(6)),
      };
      marker.setLngLat([clickedCoords.lng, clickedCoords.lat]);
      updateCoordsAndRadius(clickedCoords);
    });

    map.on('load', () => {
      if (!map.getSource('picker-radius-source')) {
        map.addSource('picker-radius-source', {
          type: 'geojson',
          data: createGeoJsonCircle(initialCenter, radiusMeters, 64),
        });

        map.addLayer({
          id: 'picker-radius-fill',
          type: 'fill',
          source: 'picker-radius-source',
          paint: {
            'fill-color': '#00f2fe',
            'fill-opacity': 0.15,
          },
        });

        map.addLayer({
          id: 'picker-radius-line',
          type: 'line',
          source: 'picker-radius-source',
          paint: {
            'line-color': '#00f2fe',
            'line-width': 2,
            'line-dasharray': [3, 2],
          },
        });
      }
    });

    // Asegurar redimensionamiento correcto si el modal se abre con animación
    const timer = setTimeout(() => {
      map.resize();
    }, 150);

    return () => {
      clearTimeout(timer);
      marker.remove();
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [isOpen, initialCenter.lat, initialCenter.lng, radiusMeters]);

  // Centrar el mapa en las coordenadas del marcador actual
  const handleRecenterOnMarker = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({
        center: [selectedCoords.lng, selectedCoords.lat],
        speed: 1.2,
      });
    }
  };

  // Obtener GPS del dispositivo y mover el selector a esa posición
  const handleDetectDeviceGps = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gpsCoords: Coordinates = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setSelectedCoords(gpsCoords);
        if (markerRef.current) {
          markerRef.current.setLngLat([gpsCoords.lng, gpsCoords.lat]);
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo({
            center: [gpsCoords.lng, gpsCoords.lat],
            speed: 1.5,
          });
          const source = mapInstanceRef.current.getSource(
            'picker-radius-source'
          ) as maplibregl.GeoJSONSource | undefined;
          if (source) {
            source.setData(createGeoJsonCircle(gpsCoords, radiusMeters, 64));
          }
        }
        setIsLocating(false);
      },
      (err) => {
        console.warn('Error al detectar GPS en modal:', err.message);
        setIsLocating(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col p-2 sm:p-4 animate-in fade-in duration-200">
      {/* CONTENEDOR TÁCTICO */}
      <div className="flex flex-col h-full max-w-4xl w-full mx-auto bg-hud-dark border border-hud-border/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* CABECERA */}
        <div className="flex items-center justify-between px-4 py-3 bg-hud-panel border-b border-hud-border/80">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗺️</span>
            <div>
              <h3 className="text-sm sm:text-base font-mono font-black text-white uppercase tracking-wider">
                Fijar Centro de Operaciones
              </h3>
              <p className="text-[11px] font-mono text-hud-muted hidden sm:block">
                Haz clic o arrastra el pin cian para situar el centro de la zona de juego
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MAPA INTERACTIVO */}
        <div className="relative flex-1 min-h-[320px] w-full bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* BADGE DE RADIO SUPERIOR IZQUIERDA */}
          <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col gap-1">
            <div className="bg-hud-dark/90 backdrop-blur-md border border-hud-cyan/40 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold text-hud-cyan shadow-lg">
              RADIO OPERATIVO: {radiusMeters}m
            </div>
            <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/60 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 max-w-[200px] sm:max-w-none">
              👆 Toca o arrastra para mover el centro
            </div>
          </div>

          {/* BOTONES FLOTANTES DE NAVEGACIÓN RÁPIDA */}
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRecenterOnMarker}
              className="bg-hud-dark/90 hover:bg-hud-dark border border-hud-border/80 text-hud-cyan p-2.5 rounded-xl shadow-lg backdrop-blur-md active:scale-95 transition-all flex items-center justify-center"
              title="Centrar vista en el marcador"
            >
              <Crosshair className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDetectDeviceGps}
              disabled={isLocating}
              className="bg-hud-dark/90 hover:bg-hud-dark border border-hud-border/80 text-hud-cyan p-2.5 rounded-xl shadow-lg backdrop-blur-md active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
              title="Ir a mi ubicación GPS actual"
            >
              <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* PIE DE PANEL Y ACCIONES */}
        <div className="p-3 sm:p-4 bg-hud-panel border-t border-hud-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono">
          {/* TELEMETRÍA EN VIVO */}
          <div className="flex items-center gap-2 bg-hud-dark/80 border border-hud-border/60 px-3 py-2 rounded-xl text-xs">
            <MapPin className="w-4 h-4 text-hud-cyan shrink-0" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
              <span>
                LAT: <strong className="text-hud-cyan">{selectedCoords.lat.toFixed(6)}</strong>
              </span>
              <span>
                LNG: <strong className="text-hud-cyan">{selectedCoords.lng.toFixed(6)}</strong>
              </span>
            </div>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-hud-border/80 text-hud-muted hover:text-white hover:bg-white/5 text-xs font-bold uppercase transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedCoords)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-hud-cyan to-teal-400 text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-hud-cyan/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Confirmar Ubicación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
