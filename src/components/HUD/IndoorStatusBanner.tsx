import React from 'react';
import type { MapStructure } from '../../types/game';
import { ShieldCheck, HeartPulse } from 'lucide-react';

interface IndoorStatusBannerProps {
  building: MapStructure | null;
}

export const IndoorStatusBanner: React.FC<IndoorStatusBannerProps> = ({ building }) => {
  if (!building) return null;

  const isHospital = building.type === 'hospital';

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-full max-w-sm px-4">
      <div
        className={`px-3.5 py-2 rounded-2xl border-2 shadow-2xl backdrop-blur-md flex items-center gap-3 ${
          isHospital
            ? 'bg-emerald-950/90 border-emerald-400 shadow-emerald-900/60'
            : 'bg-cyan-950/90 border-cyan-400 shadow-cyan-900/60'
        }`}
      >
        <div
          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
            isHospital
              ? 'bg-emerald-800/40 border-emerald-400 text-emerald-300'
              : 'bg-cyan-800/40 border-cyan-400 text-cyan-300'
          }`}
        >
          {isHospital ? (
            <HeartPulse className="w-5 h-5 text-emerald-300 animate-pulse" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-cyan-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className={`block text-[11px] font-mono font-black uppercase tracking-wider ${
              isHospital ? 'text-emerald-300' : 'text-cyan-300'
            }`}
          >
            {isHospital ? 'EN EL INTERIOR: HOSPITAL' : `REFUGIADO: ${building.name.toUpperCase()}`}
          </span>
          <span className="block text-[10px] font-mono text-slate-200">
            {isHospital
              ? 'Recuperando salud (+10 HP/s)'
              : 'A cubierto: El monstruo no puede verte'}
          </span>
        </div>
      </div>
    </div>
  );
};
