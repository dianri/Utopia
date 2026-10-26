import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Player } from '../../types/game';
import { soundEffects } from '../../services/soundEffects';
import { Trophy, Medal, RotateCcw, BarChart3 } from 'lucide-react';

interface VictoryModalProps {
  players: Player[];
  onRestart: () => void;
  onOpenLeaderboard: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  players,
  onRestart,
  onOpenLeaderboard,
}) => {
  useEffect(() => {
    soundEffects.playVictoryFanfare();

    // Lanzar confeti estilo fuegos artificiales
    const duration = 3.5 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#00f0ff', '#ffaa00', '#00ff88', '#ff0055'],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#00f0ff', '#ffaa00', '#00ff88', '#ff0055'],
      });

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  // Encontrar el MVP (mayor daño infligido o revividos)
  const sortedPlayers = [...players].sort(
    (a, b) => b.damageDealt + b.revivesDone * 50 - (a.damageDealt + a.revivesDone * 50)
  );
  const mvp = sortedPlayers[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-hud-dark border-2 border-yellow-500/80 rounded-2xl shadow-2xl shadow-yellow-500/20 p-6 flex flex-col gap-5 text-center my-auto">
        {/* TROFEO */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center text-yellow-400 mb-2 shadow-xl shadow-yellow-500/40 animate-bounce">
            <Trophy className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-mono font-black text-yellow-300 tracking-wider uppercase">
            ¡MISIÓN CUMPLIDA!
          </h1>
          <p className="text-xs font-mono text-slate-300 mt-1">
            El tesoro de Las Meriendas ha sido asegurado con éxito.
          </p>
        </div>

        {/* MVP PODIO */}
        {mvp && (
          <div className="bg-hud-panel border border-yellow-500/50 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-black">
                <Medal className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-mono text-yellow-400 font-bold uppercase">
                  JUGADOR MVP DE LA PARTIDA
                </span>
                <span className="text-sm font-mono font-black text-white">
                  {mvp.nickname} ({mvp.role})
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-black text-hud-cyan">
                {mvp.damageDealt} DMG
              </span>
            </div>
          </div>
        )}

        {/* DESGLOSE DE ESTADÍSTICAS DEL EQUIPO */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono text-hud-muted uppercase tracking-wider text-left">
            Informe de Combate
          </span>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="bg-hud-panel/80 border border-hud-border p-2.5 rounded-lg flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{p.nickname}</span>
                  <span className="text-[10px] text-hud-muted uppercase">({p.role})</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-red-400">💥 {p.damageDealt}</span>
                  <span className="text-emerald-400">✚ {p.revivesDone}</span>
                  <span className="text-amber-400">📦 {p.cratesOpened}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex flex-col gap-2 mt-2">
          <button
            onClick={onOpenLeaderboard}
            className="w-full py-2.5 rounded-xl bg-hud-panel border border-hud-cyan/60 hover:border-hud-cyan text-xs font-mono font-black text-hud-cyan uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Ver Clasificación Histórica</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-black font-mono font-black text-sm uppercase tracking-wider shadow-lg shadow-yellow-500/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Volver a la Base</span>
          </button>
        </div>
      </div>
    </div>
  );
};
