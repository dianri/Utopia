import React from 'react';
import type { MapStructure } from '../../types/game';
import { ShieldCheck, HeartPulse } from 'lucide-react';

interface IndoorStatusBannerProps {
  building: MapStructure | null;
  isFullyHealed?: boolean;
  onEnterHospital?: () => void;
}

export const IndoorStatusBanner: React.FC<IndoorStatusBannerProps> = ({
  building,
  isFullyHealed = false,
  onEnterHospital,
}) => {
  if (!building) return null;

  const isHospital = building.type === 'hospital';

  return (
    <div className="w-full pointer-events-auto">
      <div
        className={`px-3 py-1.5 sm:py-2 max-h-11 sm:max-h-none rounded-xl sm:rounded-2xl border-2 shadow-2xl backdrop-blur-md flex items-center justify-between gap-2.5 ${
          isHospital
            ? 'bg-emerald-950/90 border-emerald-400 shadow-emerald-900/60'
            : 'bg-cyan-950/90 border-cyan-400 shadow-cyan-900/60'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 ${
              isHospital
                ? 'bg-emerald-800/40 border-emerald-400 text-emerald-300'
                : 'bg-cyan-800/40 border-cyan-400 text-cyan-300'
            }`}
          >
            {isHospital ? (
              <HeartPulse
                className={`w-4 h-4 sm:w-5 sm:h-5 text-emerald-300 ${isFullyHealed ? '' : 'animate-pulse'}`}
              />
            ) : (
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span
              className={`block text-[10px] sm:text-[11px] font-mono font-black uppercase tracking-wider truncate ${
                isHospital ? 'text-emerald-300' : 'text-cyan-300'
              }`}
            >
              {isHospital
                ? isFullyHealed
                  ? 'SALUD AL 100%'
                  : 'EN HOSPITAL (+15 HP/s)'
                : `REFUGIADO: ${building.name.toUpperCase()}`}
            </span>
            <span className="hidden sm:block text-[10px] font-mono text-slate-200 truncate">
              {isHospital
                ? isFullyHealed
                  ? 'Todos los signos vitales se encuentran al 100%'
                  : 'Recuperando salud en instalación médica'
                : 'A cubierto: El monstruo no puede verte'}
            </span>
          </div>
        </div>

        {isHospital && onEnterHospital && !isFullyHealed && (
          <button
            type="button"
            onClick={onEnterHospital}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-[10px] sm:text-xs border border-emerald-300 shadow-md active:scale-95 transition-all animate-pulse"
          >
            INGRESAR
          </button>
        )}
      </div>
    </div>
  );
};
