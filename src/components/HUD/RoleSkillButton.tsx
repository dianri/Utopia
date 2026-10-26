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
      <div className="absolute bottom-4 right-4 z-20 pointer-events-auto flex flex-col items-center">
        <button
          onClick={onActivate}
          disabled={!isReady}
          className={`relative w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-2xl transition-all active:scale-95 ${
            isActive
              ? 'bg-hud-cyan/30 border-hud-cyan text-hud-cyan shadow-hud-cyan/50 ring-2 ring-hud-cyan animate-pulse'
              : isReady
              ? 'bg-gradient-to-br from-amber-600 to-yellow-500 border-yellow-300 text-black shadow-amber-500/50 hover:brightness-110'
              : 'bg-hud-card/90 border-hud-border text-hud-muted opacity-80 cursor-not-allowed'
          }`}
          title="Activar Radar Táctico (Revela el monstruo a todo el equipo)"
        >
          <Radio className={`w-7 h-7 ${isReady && !isActive ? 'animate-pulse' : ''}`} />
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
    <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
      <div className="bg-hud-dark/90 border border-hud-border/80 backdrop-blur-md px-3 py-2 rounded-xl shadow-xl flex items-center gap-2">
        {role === 'tank' && (
          <>
            <Shield className="w-5 h-5 text-blue-400" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-mono font-bold text-blue-300">PASIVA: AGRO</span>
              <span className="text-[9px] font-mono text-hud-muted">+50% HP | Atrae al Monstruo</span>
            </div>
          </>
        )}
        {role === 'medic' && (
          <>
            <HeartPulse className="w-5 h-5 text-emerald-400" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-mono font-bold text-emerald-300">PASIVA: MÉDICO</span>
              <span className="text-[9px] font-mono text-hud-muted">Reanima en 10s | Doble radio</span>
            </div>
          </>
        )}
        {role === 'marksman' && (
          <>
            <Crosshair className="w-5 h-5 text-red-400" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-mono font-bold text-red-300">PASIVA: FRANCOTIRADOR</span>
              <span className="text-[9px] font-mono text-hud-muted">+35% Daño y Rango extendido</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
