import React from 'react';
import { Navigation, AlertTriangle } from 'lucide-react';
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
  const distToHospital = hospital
    ? Math.round(getDistanceMeters(playerCoord, { lat: hospital.lat, lng: hospital.lng }))
    : null;

  const bearingToHospital = hospital
    ? Math.round(getBearing(playerCoord, { lat: hospital.lat, lng: hospital.lng }))
    : 0;

  return (
    <>
      {/* 1. VIÑETA ROJA PULSANTE EN LOS BORDES DE LA PANTALLA */}
      <div className="fixed inset-0 z-40 pointer-events-none border-[10px] sm:border-[16px] border-red-600/70 shadow-[inset_0_0_90px_rgba(220,38,38,0.65)] animate-pulse" />

      {/* 2. ALERTA CRÍTICA Y GUÍA DE EMERGENCIA HACIA EL HOSPITAL */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-sm px-4">
        <div className="bg-red-950/95 border-2 border-red-500 rounded-2xl p-3.5 shadow-2xl shadow-red-900/80 backdrop-blur-md flex flex-col gap-2 animate-bounce">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/40 border border-red-400 flex items-center justify-center text-xl shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-300 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-xs font-mono font-black text-red-300 uppercase tracking-wider">
                ¡HERIDO DE MUERTE!
              </span>
              <span className="block text-[11px] font-mono text-red-100 font-bold leading-tight">
                Ve al Hospital de Campaña para salvarte
              </span>
            </div>
          </div>

          {/* BRÚJULA DIRECCIONAL Y DISTANCIA AL HOSPITAL */}
          {hospital && distToHospital !== null && (
            <div className="flex items-center justify-between bg-black/60 border border-red-500/50 rounded-xl px-3 py-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏥</span>
                <span className="text-xs font-mono font-bold text-red-200">
                  HOSPITAL: <span className="text-white font-black">{distToHospital}m</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-red-900/50 border border-red-400 px-2 py-1 rounded-lg">
                <Navigation
                  className="w-4 h-4 text-red-300"
                  style={{ transform: `rotate(${bearingToHospital}deg)` }}
                />
                <span className="text-[10px] font-mono font-black text-white">
                  {bearingToHospital}°
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
