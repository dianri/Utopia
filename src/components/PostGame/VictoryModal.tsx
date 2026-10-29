import React, { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import type { Player } from '../../types/game';
import { soundEffects } from '../../services/soundEffects';
import { RotateCcw, BarChart3 } from 'lucide-react';

interface VictoryModalProps {
  players: Player[];
  myPlayer?: Player | null;
  currentUserId?: string | null;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
  startedAt?: string | null;
  winnerNickname?: string | null;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  players,
  myPlayer,
  currentUserId,
  onRestart,
  onOpenLeaderboard,
  startedAt,
  winnerNickname,
}) => {
  // Asegurar que myPlayer esté presente en la lista con sus estadísticas locales más actualizadas
  const allPlayers = useMemo(() => {
    let list = [...players];
    const isMeInList = myPlayer && list.some(
      (p) =>
        p.id === myPlayer.id ||
        (Boolean(myPlayer.userId) && p.userId === myPlayer.userId) ||
        p.nickname === myPlayer.nickname
    );

    if (myPlayer && !isMeInList) {
      list.push(myPlayer);
    }

    if (myPlayer) {
      list = list.map((p) => {
        const isThisPlayerMe =
          p.id === myPlayer.id ||
          (Boolean(myPlayer.userId) && p.userId === myPlayer.userId) ||
          p.nickname === myPlayer.nickname;

        if (isThisPlayerMe) {
          return {
            ...p,
            chests_opened: Math.max(p.chests_opened || 0, myPlayer.chests_opened || 0, myPlayer.chestsOpened || 0),
            chestsOpened: Math.max(p.chestsOpened || 0, myPlayer.chestsOpened || 0, myPlayer.chests_opened || 0),
            damageDealt: Math.max(p.damageDealt || 0, myPlayer.damageDealt || 0),
            monsterKills: Math.max(p.monsterKills || 0, myPlayer.monsterKills || 0),
          };
        }
        return p;
      });
    }
    return list;
  }, [players, myPlayer]);

  // Clasificación autoritaria según méritos competitivos:
  // 1º Cofres conquistados (chests_opened)
  // 2º Enemigos/Monstruos eliminados y bajas (kills / monsterKills / monsters_slain)
  // 3º Daño total infligido
  // 4º Menor cantidad de caídas a estado herido grave
  const rankedPlayers = useMemo(() => {
    return [...allPlayers].sort((a, b) => {
      // 1º Criterio: Cofres abiertos (el que más tiene gana)
      const chestsA = a.chests_opened ?? a.chestsOpened ?? 0;
      const chestsB = b.chests_opened ?? b.chestsOpened ?? 0;
      if (chestsB !== chestsA) return chestsB - chestsA;

      // 2º Criterio: Monstruos/Bajas eliminadas
      const killsA = (a as any).kills ?? (a as any).monsters_slain ?? a.monsterKills ?? 0;
      const killsB = (b as any).kills ?? (b as any).monsters_slain ?? b.monsterKills ?? 0;
      if (killsB !== killsA) return killsB - killsA;

      // 3º Criterio: Daño total infligido
      const dmgA = a.damageDealt ?? 0;
      const dmgB = b.damageDealt ?? 0;
      if (dmgB !== dmgA) return dmgB - dmgA;

      // 4º Criterio: Menor cantidad de caídas a estado herido grave
      const woundsA = (a as any).times_wounded ?? (a as any).timesWounded ?? (a.isCriticallyWounded ? 1 : 0);
      const woundsB = (b as any).times_wounded ?? (b as any).timesWounded ?? (b.isCriticallyWounded ? 1 : 0);
      return woundsA - woundsB;
    });
  }, [allPlayers]);

  // Determinar vencedor absoluto de la partida
  const absoluteWinner = useMemo(() => {
    if (winnerNickname) {
      const match = rankedPlayers.find((p) => p.nickname === winnerNickname);
      if (match) return match;
    }
    return rankedPlayers[0] || null;
  }, [rankedPlayers, winnerNickname]);

  // Comprobar si el usuario actual es el ganador
  const isMeWinner = useMemo(() => {
    if (!myPlayer || !absoluteWinner) return false;
    return (
      (Boolean(absoluteWinner.id) && absoluteWinner.id === myPlayer.id) ||
      (Boolean(absoluteWinner.userId) && Boolean(myPlayer.userId) && absoluteWinner.userId === myPlayer.userId) ||
      (Boolean(absoluteWinner.nickname) && Boolean(myPlayer.nickname) && absoluteWinner.nickname === myPlayer.nickname) ||
      (Boolean(currentUserId) && (absoluteWinner.id === currentUserId || absoluteWinner.userId === currentUserId))
    );
  }, [myPlayer, absoluteWinner, currentUserId]);

  const isCurrentPlayerMe = (p: Player) => {
    if (!myPlayer) return false;
    return (
      p.id === myPlayer.id ||
      (Boolean(myPlayer.userId) && p.userId === myPlayer.userId) ||
      p.nickname === myPlayer.nickname ||
      (Boolean(currentUserId) && (p.id === currentUserId || p.userId === currentUserId))
    );
  };

  // Posición del jugador local (1-indexed)
  const myRank = useMemo(() => {
    if (!myPlayer) return 1;
    const index = rankedPlayers.findIndex(isCurrentPlayerMe);
    return index >= 0 ? index + 1 : 1;
  }, [rankedPlayers, myPlayer, currentUserId]);

  useEffect(() => {
    soundEffects.playVictoryFanfare();

    // Lanzar confeti sólo si el jugador actual es el ganador de la sesión
    const duration = isMeWinner ? 3.5 * 1000 : 1.5 * 1000;
    const animationEnd = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: isMeWinner ? 5 : 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#00f0ff', '#ffaa00', '#00ff88', '#ff0055'],
      });
      confetti({
        particleCount: isMeWinner ? 5 : 2,
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
  }, [isMeWinner]);

  // Calcular tiempo de partida transcurrido
  const calculateDuration = () => {
    if (!startedAt) return '04:12';
    const start = new Date(startedAt).getTime();
    const end = Date.now();
    const seconds = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const gameDurationStr = calculateDuration();

  const getRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) return '🥇 1º';
    if (rankIndex === 1) return '🥈 2º';
    if (rankIndex === 2) return '🥉 3º';
    return `#${rankIndex + 1}`;
  };

  const getRowClassName = (p: Player, idx: number) => {
    const me = isCurrentPlayerMe(p);
    const isWinner = (absoluteWinner && (p.id === absoluteWinner.id || p.nickname === absoluteWinner.nickname)) || idx === 0;

    if (me && isWinner) {
      return 'bg-amber-950/40 border-2 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.25)]';
    }
    if (me) {
      return 'bg-cyan-950/40 border border-cyan-500/50 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)]';
    }
    if (isWinner) {
      return 'bg-amber-950/30 border border-amber-500/40 text-amber-100';
    }
    return 'bg-hud-panel/80 border-hud-border text-white';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-hud-dark border-2 border-yellow-500/80 rounded-2xl shadow-2xl shadow-yellow-500/20 p-6 flex flex-col gap-4 text-center my-auto">
        {/* CABECERA ADAPTADA SEGÚN EL DESTINATARIO */}
        {isMeWinner ? (
          <div className="flex flex-col items-center">
            <div className="text-4xl animate-bounce mb-1">👑</div>
            <h2 className="text-2xl font-mono font-black text-amber-400 tracking-wider uppercase">
              ¡VICTORIA ABSOLUTA!
            </h2>
            <p className="text-xs font-mono text-amber-200/80 mt-0.5">
              Has dominado la expedición: {absoluteWinner?.nickname || myPlayer?.nickname}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="text-3xl mb-1">🎖️</div>
            <h2 className="text-xl font-mono font-black text-slate-300 tracking-wider uppercase">
              OPERACIÓN FINALIZADA
            </h2>
            <p className="text-sm font-mono font-semibold text-amber-400 mt-0.5">
              VENCEDOR: <span className="font-bold underline">{absoluteWinner?.nickname || 'Agente Desconocido'}</span>
            </p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded bg-slate-800 text-xs font-mono font-bold text-slate-400">
              Tu clasificación: #{myRank > 0 ? myRank : '-'}
            </span>
          </div>
        )}

        {/* RESUMEN TÁCTICO */}
        <div className="grid grid-cols-3 gap-2 bg-slate-900/90 border border-yellow-500/40 p-2.5 rounded-xl font-mono text-center shadow-inner">
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Tiempo</span>
            <span className="text-xs font-black text-yellow-300">{gameDurationStr}</span>
          </div>
          <div className="flex flex-col border-x border-slate-800">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Cofres Totales</span>
            <span className="text-xs font-black text-emerald-400">3 / 3 (100%)</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Jugadores</span>
            <span className="text-xs font-black text-cyan-300">
              {rankedPlayers.length} Competidores
            </span>
          </div>
        </div>

        {/* PODIO DEL VENCEDOR DESTACADO */}
        {absoluteWinner && (
          <div className="bg-hud-panel border-2 border-amber-400 p-3.5 rounded-xl flex items-center justify-between shadow-[0_0_20px_rgba(250,204,21,0.25)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-black text-xl">
                👑
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                  CAMPEÓN DE LA OPERACIÓN
                </span>
                <span className="text-base font-mono font-black text-white truncate">
                  {absoluteWinner.nickname}
                </span>
              </div>
            </div>
            <div className="text-right font-mono shrink-0">
              <span className="text-xs font-black text-amber-300 block">
                {absoluteWinner.chests_opened ?? absoluteWinner.chestsOpened ?? 0} / 3 COFRES
              </span>
              <span className="text-[10px] text-gray-400">
                {absoluteWinner.damageDealt ?? 0} DMG
              </span>
            </div>
          </div>
        )}

        {/* TABLA DE CLASIFICACIÓN FINAL */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 text-[11px] font-mono text-hud-muted uppercase tracking-wider">
            <span>Clasificación Final</span>
            <span>{rankedPlayers.length} Agentes</span>
          </div>

          <div className="bg-slate-900/60 border border-hud-border rounded-xl p-1.5 flex flex-col gap-1">
            {/* Cabecera de columnas */}
            <div className="grid grid-cols-12 gap-1 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <span className="col-span-3 text-left"># POS</span>
              <span className="col-span-5 text-left">AGENTE</span>
              <span className="col-span-2 text-center">COFRES</span>
              <span className="col-span-2 text-right">BAJAS</span>
            </div>

            {/* Filas de competidores */}
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
              {rankedPlayers.map((p, idx) => {
                const me = isCurrentPlayerMe(p);
                const chests = p.chests_opened ?? p.chestsOpened ?? 0;
                const kills = (p as any).kills ?? (p as any).monsters_slain ?? p.monsterKills ?? 0;

                return (
                  <div
                    key={p.id || idx}
                    className={`grid grid-cols-12 gap-1 items-center px-2.5 py-2 rounded-lg text-xs font-mono transition-colors ${getRowClassName(p, idx)}`}
                  >
                    {/* Columna 1: # Posición */}
                    <span className="col-span-3 font-black text-left flex items-center gap-1">
                      {getRankBadge(idx)}
                    </span>

                    {/* Columna 2: Agente */}
                    <div className="col-span-5 flex items-center gap-1.5 min-w-0 text-left">
                      <span className="truncate font-black">{p.nickname}</span>
                      {me && (
                        <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-cyan-500 text-black shadow">
                          TÚ
                        </span>
                      )}
                    </div>

                    {/* Columna 3: Cofres */}
                    <div className="col-span-2 flex items-center justify-center font-bold text-amber-400">
                      <span className="mr-0.5">👑</span>
                      <span>{chests}/3</span>
                    </div>

                    {/* Columna 4: Bajas */}
                    <div className="col-span-2 flex items-center justify-end font-bold text-red-400">
                      <span className="mr-0.5">💀</span>
                      <span>{kills}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div className="flex flex-col gap-2 mt-1">
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
            <span>Volver al Lobby / Nueva Partida</span>
          </button>
        </div>
      </div>
    </div>
  );
};
