import React from 'react';
import type { PlayerRole } from '../../types/game';
import { Radio, Shield, HeartPulse, Crosshair } from 'lucide-react';

interface RoleSkillButtonProps {
  role: PlayerRole;
  cooldownRemaining: number;
  isActive: boolean;
  onActivate: () => void;
  isAlive: boolean;
}

export const RoleSkillButton: React.FC<RoleSkillButtonProps> = ({
  role,
  cooldownRemaining,
  isActive,
  onActivate,
  isAlive,
}) => {
  if (!isAlive) return null;

  if (role === 'scout') {
    const isReady = cooldownRemaining <= 0;

    return (
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-2 sm:right-4 z-20 pointer-events-auto flex flex-col items-center">
        <button
          onClick={onActivate}
          disabled={!isReady}
          className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-2xl transition-all active:scale-95 ${
            isActive
              ? 'bg-hud-cyan/30 border-hud-cyan text-hud-cyan shadow-hud-cyan/50 ring-2 ring-hud-cyan animate-pulse'
              : isReady
              ? 'bg-gradient-to-br from-amber-600 to-yellow-500 border-yellow-300 text-black shadow-amber-500/50 hover:brightness-110'
              : 'bg-hud-card/90 border-hud-border text-hud-muted opacity-80 cursor-not-allowed'
          }`}
          title="Activar Radar Táctico (Revela el monstruo a todo el equipo)"
        >
          <Radio className={`w-6 h-6 sm:w-7 sm:h-7 ${isReady && !isActive ? 'animate-pulse' : ''}`} />
          <span className="text-[9px] font-mono font-black uppercase mt-0.5">
            {isActive ? 'ACTIVO' : isReady ? 'RADAR' : `${cooldownRemaining}s`}
          </span>

          {/* Anillo de cooldown */}
          {!isReady && (
            <div
              className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center font-mono font-black text-white text-base"
            >
              {cooldownRemaining}s
            </div>
          )}
        </button>
      </div>
    );
  }

  // Indicador pasivo para otros roles
  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-2 sm:right-4 z-20 pointer-events-none max-w-[calc(100vw-12rem)] sm:max-w-xs">
      <div className="bg-hud-dark/90 border border-hud-border/80 backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-xl flex items-center gap-2 overflow-hidden">
        {role === 'tank' && (
          <>
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0" />
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-blue-300 truncate">PASIVA: AGRO</span>
              <span className="text-[8px] sm:text-[9px] font-mono text-hud-muted truncate">+50% HP | Atrae Monstruo</span>
            </div>
          </>
        )}
        {role === 'medic' && (
          <>
            <HeartPulse className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-emerald-300 truncate">PASIVA: MÉDICO</span>
              <span className="text-[8px] sm:text-[9px] font-mono text-hud-muted truncate">Reanima en 10s | Doble radio</span>
            </div>
          </>
        )}
        {role === 'marksman' && (
          <>
            <Crosshair className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 shrink-0" />
            <div className="flex flex-col text-left min-w-0">
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-red-300 truncate">PASIVA: FRANCOTIRADOR</span>
              <span className="text-[8px] sm:text-[9px] font-mono text-hud-muted truncate">+35% Daño | Rango largo</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
