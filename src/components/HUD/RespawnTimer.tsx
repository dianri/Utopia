import React from 'react';
import { Skull, Clock } from 'lucide-react';

interface RespawnTimerProps {
  secondsRemaining?: number;
}

export const RespawnTimer: React.FC<RespawnTimerProps> = ({ secondsRemaining }) => {
  if (secondsRemaining == null || secondsRemaining <= 0) return null;

  const percent = Math.max(0, Math.min(100, (secondsRemaining / 60) * 100));

  return (
    <div className="w-full pointer-events-auto animate-fade-in">
      <div className="bg-hud-dark/95 border border-purple-500/70 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-2xl flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400 flex items-center justify-center text-purple-300 shrink-0">
              <Skull className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-xs font-mono font-black text-purple-300 tracking-wider uppercase truncate">
                MONSTRUO ELIMINADO TEMPORALMENTE
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-slate-300 truncate">
                Reaparecerá en el cofre con vida completa
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-lg sm:text-xl font-mono font-black text-purple-400 shrink-0">
            <Clock className="w-4 h-4" />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        <div className="w-full h-1.5 sm:h-2 bg-gray-900 border border-purple-500/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-700 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
