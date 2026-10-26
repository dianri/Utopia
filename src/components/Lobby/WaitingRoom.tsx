import React, { useState } from 'react';
import type { GameRoom, Player, PlayerRole } from '../../types/game';
import { Copy, Check, Play, LogOut, Users, Shield, HeartPulse, Eye, Crosshair } from 'lucide-react';

interface WaitingRoomProps {
  room: GameRoom;
  players: Player[];
  myPlayerId: string;
  isHost: boolean;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  room,
  players,
  myPlayerId,
  isHost,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const shareUrl = `${window.location.origin}/?room=${room.code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const roleIcons: Record<PlayerRole, React.ReactNode> = {
    medic: <HeartPulse className="w-4 h-4 text-emerald-400" />,
    tank: <Shield className="w-4 h-4 text-blue-400" />,
    scout: <Eye className="w-4 h-4 text-amber-400" />,
    marksman: <Crosshair className="w-4 h-4 text-red-400" />,
  };

  return (
    <div className="fixed inset-0 z-40 bg-hud-dark flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-xl mx-auto w-full flex flex-col gap-5 my-auto">
        {/* CABECERA */}
        <div className="flex items-center justify-between border-b border-hud-border pb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📡</span>
            <div>
              <h1 className="text-lg sm:text-xl font-mono font-black text-white uppercase tracking-wider">
                Sala de Despliegue
              </h1>
              <span className="text-xs font-mono text-hud-muted">
                {room.name || 'Las Meriendas: Monster Hunt'}
              </span>
            </div>
          </div>

          <button
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-hud-panel border border-hud-border rounded-lg text-xs font-mono text-hud-muted hover:text-white"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </div>

        {/* TARJETA DE CÓDIGO Y ENLACE DE COMPARTIR */}
        <div className="bg-hud-panel border-2 border-hud-cyan/40 p-4 rounded-2xl shadow-xl shadow-hud-cyan/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col text-center sm:text-left">
            <span className="text-[10px] font-mono font-bold text-hud-muted uppercase tracking-widest">
              CÓDIGO DE ACCESO DIRECTO
            </span>
            <span className="text-3xl font-mono font-black text-hud-cyan tracking-widest">
              {room.code}
            </span>
          </div>

          <button
            onClick={handleCopyLink}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-hud-dark border border-hud-cyan/60 hover:border-hud-cyan text-xs font-mono font-bold text-hud-cyan flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">¡Enlace Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Enlace de Invitación</span>
              </>
            )}
          </button>
        </div>

        {/* PARÁMETROS DE LA MISIÓN */}
        <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-hud-panel/60 border border-hud-border p-3 rounded-xl">
          <div>
            <span className="text-hud-muted block text-[11px]">Área de Combate:</span>
            <span className="text-white font-bold">{room.playAreaRadius}m radio</span>
          </div>
          <div>
            <span className="text-hud-muted block text-[11px]">Control:</span>
            <span className="text-hud-cyan font-bold">
              {room.movementMode === 'gps' ? 'GPS Real' : 'Tap-to-Move'}
            </span>
          </div>
          <div>
            <span className="text-hud-muted block text-[11px]">Visibilidad:</span>
            <span className={`font-bold ${room.isPublic ? 'text-emerald-400' : 'text-amber-400'}`}>
              {room.isPublic ? '🌐 Pública' : '🔒 Privada'}
            </span>
          </div>
        </div>

        {/* LISTA DE JUGADORES (ESCUADRA) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono text-hud-muted px-1">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-hud-cyan" />
              <span>Escuadra Conectada ({players.length}/4)</span>
            </div>
            <span>Estado: En espera</span>
          </div>

          <div className="flex flex-col gap-2">
            {players.map((p) => (
              <div
                key={p.id}
                className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                  p.id === myPlayerId
                    ? 'border-hud-cyan/60 bg-hud-cyan/5 shadow-md shadow-hud-cyan/10'
                    : 'border-hud-border bg-hud-panel'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-hud-dark border border-hud-border flex items-center justify-center">
                    {roleIcons[p.role]}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-white">
                        {p.nickname}
                      </span>
                      {p.id === myPlayerId && (
                        <span className="text-[9px] font-mono bg-hud-cyan/20 text-hud-cyan px-1.5 py-0.2 rounded border border-hud-cyan/40">
                          Tú
                        </span>
                      )}
                      {p.userId === room.hostId && (
                        <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/40">
                          Líder
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-hud-muted uppercase">
                      Clase: {p.role}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs font-mono text-emerald-400">Listo</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOTÓN INICIAR PARTIDA (SOLO HOST) */}
        {isHost ? (
          <button
            onClick={onStartGame}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-hud-cyan via-teal-400 to-emerald-400 text-black font-mono font-black text-base uppercase tracking-wider shadow-xl shadow-hud-cyan/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Comenzar Operación de Caza</span>
          </button>
        ) : (
          <div className="w-full py-3.5 bg-hud-panel border border-hud-border rounded-xl text-center text-xs font-mono text-hud-muted animate-pulse">
            Esperando a que el líder inicie la partida...
          </div>
        )}
      </div>
    </div>
  );
};
