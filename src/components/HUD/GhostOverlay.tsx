import React from 'react';
import { AlertCircle, PackageCheck, HelpCircle } from 'lucide-react';
import type { GhostPing } from '../../types/game';

interface GhostOverlayProps {
  reviveProgressSeconds: number;
  reviveRequiredSeconds: number;
  isBeingRevived: boolean;
  isMonsterNearby: boolean;
  onSendPing: (type: GhostPing['type']) => void;
}

export const GhostOverlay: React.FC<GhostOverlayProps> = ({
  reviveProgressSeconds,
  reviveRequiredSeconds,
  isBeingRevived,
  isMonsterNearby,
  onSendPing,
}) => {
  const percent = Math.min(100, (reviveProgressSeconds / reviveRequiredSeconds) * 100);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 bg-red-950/20 backdrop-grayscale-[40%]">
      {/* BANNER SUPERIOR DE MODO FANTASMA */}
      <div className="max-w-md mx-auto w-full bg-hud-dark/95 border-2 border-red-500/80 p-3 rounded-2xl shadow-2xl backdrop-blur-md pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-400 flex items-center justify-center text-2xl">
            🪦
          </div>
          <div className="flex-1">
            <span className="block text-xs font-mono font-black text-red-400 uppercase tracking-wider">
              ESTÁS EN MODO FANTASMA (CAÍDO)
            </span>
            <span className="block text-[11px] font-mono text-slate-300">
              Un aliado debe permanecer a &lt;20m para reanimarte.
            </span>
          </div>
        </div>

        {/* PROGRESO DE REANIMACIÓN */}
        {isBeingRevived && (
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono font-bold text-emerald-400">
              <span>{isMonsterNearby ? '⚠️ REANIMACIÓN CONGELADA (Monstruo cerca)' : 'REANIMANDO...'}</span>
              <span>{Math.round(reviveProgressSeconds)}s / {reviveRequiredSeconds}s</span>
            </div>
            <div className="w-full h-2.5 bg-gray-900 border border-emerald-500/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isMonsterNearby ? 'bg-amber-500 animate-pulse' : 'bg-emerald-400'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* PANEL INFERIOR: BOTONES DE PING TÁCTICO */}
      <div className="max-w-md mx-auto w-full bg-hud-dark/95 border border-hud-border/80 p-3 rounded-2xl shadow-2xl backdrop-blur-md pointer-events-auto flex items-center justify-around gap-2">
        <button
          onClick={() => onSendPing('danger')}
          className="flex-1 flex flex-col items-center gap-1 p-2 bg-red-950/40 border border-red-500/50 rounded-xl text-red-300 hover:bg-red-900/60 active:scale-95 transition-all"
        >
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-[10px] font-mono font-black">PELIGRO</span>
        </button>

        <button
          onClick={() => onSendPing('assist')}
          className="flex-1 flex flex-col items-center gap-1 p-2 bg-cyan-950/40 border border-hud-cyan/50 rounded-xl text-hud-cyan hover:bg-cyan-900/60 active:scale-95 transition-all"
        >
          <HelpCircle className="w-5 h-5 text-hud-cyan" />
          <span className="text-[10px] font-mono font-black">AYUDA</span>
        </button>

        <button
          onClick={() => onSendPing('loot')}
          className="flex-1 flex flex-col items-center gap-1 p-2 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-emerald-300 hover:bg-emerald-900/60 active:scale-95 transition-all"
        >
          <PackageCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-[10px] font-mono font-black">LOOT</span>
        </button>
      </div>
    </div>
  );
};
