import React, { useEffect } from 'react';
import type { Player } from '../../types/game';
import { soundEffects } from '../../services/soundEffects';
import { Skull, RotateCcw, BarChart3 } from 'lucide-react';

interface DefeatModalProps {
  players: Player[];
  onRestart: () => void;
  onOpenLeaderboard: () => void;
}

export const DefeatModal: React.FC<DefeatModalProps> = ({
  players,
  onRestart,
  onOpenLeaderboard,
}) => {
  useEffect(() => {
    soundEffects.playDefeat();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-hud-dark border-2 border-red-600/80 rounded-2xl shadow-2xl shadow-red-600/30 p-6 flex flex-col gap-5 text-center my-auto">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center text-red-500 mb-2 shadow-xl shadow-red-600/40 animate-pulse">
            <Skull className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-mono font-black text-red-400 tracking-wider uppercase">
            ESCUADRA ELIMINADA
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            El Monstruo de Las Meriendas ha acabado con todos los miembros del equipo.
          </p>
        </div>

        {/* ESTADÍSTICAS */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono text-hud-muted uppercase tracking-wider text-left">
            Bajas del Escuadrón
          </span>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="bg-hud-panel border border-hud-border p-2.5 rounded-lg flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{p.nickname}</span>
                  <span className="text-[10px] text-hud-muted uppercase">({p.role})</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-red-400">💥 {p.damageDealt}</span>
                  <span className="text-emerald-400">✚ {p.revivesDone}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ACCIONES */}
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onOpenLeaderboard}
            className="w-full py-2.5 rounded-xl bg-hud-panel border border-hud-border hover:border-hud-cyan text-xs font-mono font-black text-hud-muted hover:text-hud-cyan uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Ver Clasificación Histórica</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 text-white font-mono font-black text-sm uppercase tracking-wider shadow-lg shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reintentar Operación</span>
          </button>
        </div>
      </div>
    </div>
  );
};
