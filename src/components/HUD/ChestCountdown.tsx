import React from 'react';
import { Crown, AlertTriangle } from 'lucide-react';

interface ChestCountdownProps {
  secondsRemaining: number;
  holdersCount: number;
  requiredHolders: number;
  isInChestZone: boolean;
}

export const ChestCountdown: React.FC<ChestCountdownProps> = ({
  secondsRemaining,
  holdersCount,
  requiredHolders,
  isInChestZone,
}) => {
  if (secondsRemaining >= 30 && !isInChestZone) return null;

  const percent = Math.max(0, Math.min(100, ((30 - secondsRemaining) / 30) * 100));

  return (
    <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-sm w-[90%]">
      <div className="bg-hud-dark/95 border-2 border-amber-500/80 backdrop-blur-md p-3 rounded-2xl shadow-2xl shadow-amber-500/30 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300">
              <Crown className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-mono font-black text-amber-300 tracking-wider uppercase">
                ¡ABRIENDO COFRE!
              </span>
              <span className="text-[10px] font-mono text-slate-300">
                Aliados en zona: {holdersCount}/{requiredHolders}
              </span>
            </div>
          </div>

          <div className="text-2xl font-mono font-black text-amber-400">
            {secondsRemaining}s
          </div>
        </div>

        {/* BARRA DE PROGRESO DE EXTRACCIÓN */}
        <div className="w-full h-3 bg-gray-900 border border-amber-500/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-300 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/30">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" />
          <span>¡El Monstruo cargará con furia hacia el cofre!</span>
        </div>
      </div>
    </div>
  );
};
