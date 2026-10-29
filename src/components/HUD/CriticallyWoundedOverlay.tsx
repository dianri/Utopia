import React from 'react';
import { Navigation } from 'lucide-react';
import type { Coordinates, MapStructure } from '../../types/game';
import { getDistanceMeters, getBearing } from '../../services/geoUtils';

interface CriticallyWoundedOverlayProps {
  playerCoord: Coordinates;
  hospital: MapStructure | null;
}

export const CriticallyWoundedOverlay: React.FC<CriticallyWoundedOverlayProps> = ({
  playerCoord,
  hospital,
}) => {
  const hospitalDistance = hospital
    ? Math.round(getDistanceMeters(playerCoord, { lat: hospital.lat, lng: hospital.lng }))
    : null;

  const hospitalBearing = hospital
    ? Math.round(getBearing(playerCoord, { lat: hospital.lat, lng: hospital.lng }))
    : 0;

  return (
    <>
      {/* 1. VIÑETA ROJA PULSANTE EN LOS BORDES DE LA PANTALLA */}
      <div className="fixed inset-0 z-40 pointer-events-none border-[10px] sm:border-[16px] border-red-600/70 shadow-[inset_0_0_90px_rgba(220,38,38,0.65)] animate-pulse" />

      {/* 2. PÍLDORA TÁCTICA COMPACTA: ALERTA CRÍTICA Y TELEMETRÍA AL HOSPITAL */}
      <div className="fixed top-14 left-4 right-4 z-20 mx-auto max-w-md pointer-events-none">
        <div className="flex items-center justify-between gap-2.5 rounded-lg border border-red-500/70 bg-slate-950/90 px-3 py-1.5 shadow-[0_0_15px_rgba(239,68,68,0.5)] backdrop-blur-md pointer-events-auto">
          {/* 1. Indicador Crítico */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white animate-pulse">
              !
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-black tracking-wider text-red-400 uppercase leading-tight truncate font-mono">
                ¡HERIDO DE MUERTE!
              </span>
              <span className="text-[9px] font-medium text-red-200/80 leading-tight truncate font-mono">
                Dirígete al Hospital de Campaña
              </span>
            </div>
          </div>

          {/* 2. Datos de Telemetría al Hospital (Distancia y Rumbo) */}
          {hospitalDistance !== null && (
            <div className="flex shrink-0 items-center gap-2 border-l border-red-500/30 pl-2 text-[11px] font-bold text-red-300 font-mono">
              <div className="flex items-center gap-1">
                <span>🏥</span>
                <span>{hospitalDistance}m</span>
              </div>
              {hospitalBearing !== undefined && (
                <span className="flex items-center gap-1 rounded bg-red-950/80 px-1.5 py-0.5 text-[10px] text-red-400 border border-red-500/40">
                  <Navigation
                    className="w-3 h-3 text-red-400 shrink-0"
                    style={{ transform: `rotate(${hospitalBearing}deg)` }}
                  />
                  <span>{hospitalBearing}°</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
