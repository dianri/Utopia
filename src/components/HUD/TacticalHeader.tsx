import React from 'react';
import type { Player, Monster, PlayerRole } from '../../types/game';
import {
  Volume2,
  VolumeX,
  Radio,
  Users,
  Activity,
  Skull,
} from 'lucide-react';

interface TacticalHeaderProps {
  roomCode: string;
  myPlayer: Player;
  players: Player[];
  monster: Monster;
  isRadarActive: boolean;
  radarTimeRemaining: number;
  stealthMode: boolean;
  onToggleStealth: () => void;
  distToMonster: number;
}

export const TacticalHeader: React.FC<TacticalHeaderProps> = ({
  roomCode,
  myPlayer,
  players,
  monster,
  isRadarActive,
  radarTimeRemaining,
  stealthMode,
  onToggleStealth,
  distToMonster,
}) => {
  const hpPercent = Math.max(0, Math.min(100, (myPlayer.hp / myPlayer.maxHp) * 100));
  const alivePlayers = players.filter((p) => p.isAlive).length;

  const roleLabels: Record<PlayerRole, string> = {
    medic: 'MÉDICO',
    tank: 'TANQUE',
    scout: 'EXPLORADOR',
    marksman: 'TIRADOR',
  };

  const roleColors: Record<PlayerRole, string> = {
    medic: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    tank: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    scout: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    marksman: 'text-red-400 border-red-500/40 bg-red-500/10',
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-30 p-2 sm:p-3 pointer-events-none">
      <div className="max-w-4xl mx-auto flex flex-col gap-1.5 sm:gap-2">
        {/* FILA SUPERIOR: SALA, ROL, SIGILO Y CONECTADOS */}
        <div className="flex items-center justify-between bg-hud-dark/90 border border-hud-border/80 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl pointer-events-auto">
          {/* CÓDIGO DE SALA Y VIVOS */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-hud-muted tracking-wider">
                SALA
              </span>
              <span className="text-sm font-black font-mono text-hud-cyan tracking-widest bg-hud-cyan/10 border border-hud-cyan/30 px-1.5 py-0.2 rounded">
                {roomCode}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono text-slate-300">
              <Users className="w-3.5 h-3.5 text-hud-cyan" />
              <span>
                {alivePlayers}/{players.length}
              </span>
            </div>
          </div>

          {/* ROL DEL JUGADOR */}
          <div className={`px-2 py-0.5 rounded text-[11px] font-black tracking-wider border ${roleColors[myPlayer.role]}`}>
            {roleLabels[myPlayer.role]}
          </div>

          {/* TOGGLE MODO SIGILO / DISCRETO */}
          <button
            onClick={onToggleStealth}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-bold transition-all border ${
              stealthMode
                ? 'bg-hud-amber/20 border-hud-amber text-hud-amber shadow-lg shadow-hud-amber/20'
                : 'bg-hud-card border-hud-border text-hud-muted hover:text-white'
            }`}
            title="Alternar Modo Sigilo (Solo vibración háptica)"
          >
            {stealthMode ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-hud-amber" />
                <span className="hidden sm:inline text-[10px]">SIGILO ON</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[10px]">AUDIO ON</span>
              </>
            )}
          </button>
        </div>

        {/* BARRA DE VIDA DEL JUGADOR */}
        <div className="bg-hud-dark/90 border border-hud-border/80 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-1.5 min-w-[70px]">
            <Activity className={`w-4 h-4 ${myPlayer.isAlive ? (hpPercent < 30 ? 'text-hud-red animate-pulse' : 'text-hud-green') : 'text-hud-muted'}`} />
            <span className="text-xs font-mono font-bold">
              {myPlayer.isAlive ? `${myPlayer.hp}/${myPlayer.maxHp}` : 'CAÍDO'}
            </span>
          </div>

          <div className="flex-1 h-3 bg-gray-900 border border-gray-700/80 rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                myPlayer.isAlive
                  ? hpPercent < 30
                    ? 'bg-gradient-to-r from-red-600 to-rose-500 animate-pulse'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : 'bg-gray-700'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
            {hpPercent < 30 && myPlayer.isAlive && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black tracking-widest text-white uppercase drop-shadow animate-ping">
                CRÍTICO
              </span>
            )}
          </div>
        </div>

        {/* ALERTA DE PROXIMIDAD DEL MONSTRUO */}
        {distToMonster <= 100 && monster.state !== 'dead' && (
          <div
            className={`border backdrop-blur-md px-3 py-1 rounded-lg shadow-xl flex items-center justify-between pointer-events-auto transition-all ${
              distToMonster <= 30
                ? 'bg-red-950/80 border-red-500 text-red-200 animate-pulse'
                : 'bg-hud-dark/90 border-purple-500/50 text-purple-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Skull className={`w-4 h-4 ${distToMonster <= 30 ? 'text-red-400 animate-bounce' : 'text-purple-400'}`} />
              <span className="text-xs font-mono font-black uppercase tracking-wider">
                {distToMonster <= 30 ? '¡PELIGRO INMEDIATO!' : 'Monstruo detectado'}
              </span>
            </div>
            <div className="text-xs font-mono font-bold">
              {Math.round(distToMonster)} m
            </div>
          </div>
        )}

        {/* BANNER RADAR ACTIVO */}
        {isRadarActive && (
          <div className="bg-hud-cyan/20 border border-hud-cyan backdrop-blur-md px-3 py-1 rounded-lg shadow-lg shadow-hud-cyan/20 flex items-center justify-between text-hud-cyan pointer-events-auto animate-pulse">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-hud-cyan" />
              <span className="text-xs font-mono font-black uppercase tracking-widest">
                RADAR TÁCTICO ACTIVO
              </span>
            </div>
            <span className="text-xs font-mono font-black">
              {radarTimeRemaining}s
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
