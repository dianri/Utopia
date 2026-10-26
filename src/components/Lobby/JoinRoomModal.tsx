import React, { useState, useEffect } from 'react';
import type { PlayerRole } from '../../types/game';
import { supabase, ensureAnonymousAuth } from '../../lib/supabase';
import { soundEffects } from '../../services/soundEffects';
import { Shield, HeartPulse, Eye, Crosshair, LogIn, RefreshCw, Lock, ShieldAlert } from 'lucide-react';

interface JoinRoomModalProps {
  initialCode?: string;
  targetPrivateGame?: { id: string; code: string; name?: string } | null;
  onConfirm: (config: { code: string; nickname: string; role: PlayerRole }) => void;
  onCancel: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  initialCode = '',
  targetPrivateGame = null,
  onConfirm,
  onCancel,
}) => {
  const [code, setCode] = useState<string>(initialCode.toUpperCase());
  const [nickname, setNickname] = useState<string>('');
  const [role, setRole] = useState<PlayerRole>('medic');
  const [isExistingMember, setIsExistingMember] = useState<boolean>(false);
  const [existingNickname, setExistingNickname] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase());
      setAccessError(null);
    }
  }, [initialCode]);

  // Comprobar si el usuario actual ya pertenece a esta sala para facilitar reconexión
  useEffect(() => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length === 6) {
      let isMounted = true;
      ensureAnonymousAuth().then(async (uid) => {
        try {
          const { data: g } = await (supabase.from('games') as any)
            .select('id')
            .eq('code', cleanCode)
            .in('status', ['lobby', 'playing'])
            .maybeSingle();

          if (g && isMounted) {
            const { data: p } = await (supabase.from('players') as any)
              .select('nickname, role')
              .eq('game_id', g.id)
              .eq('user_id', uid)
              .maybeSingle();

            if (p && isMounted) {
              setIsExistingMember(true);
              setExistingNickname(p.nickname);
              if (p.role) setRole(p.role as PlayerRole);
              if (!nickname) setNickname(p.nickname);
              return;
            }
          }
        } catch (err) {
          console.warn('Error al verificar membresía existente:', err);
        }
        if (isMounted) {
          setIsExistingMember(false);
          setExistingNickname(null);
        }
      });

      return () => {
        isMounted = false;
      };
    } else {
      setIsExistingMember(false);
      setExistingNickname(null);
    }
  }, [code]);

  const roleOptions: { id: PlayerRole; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'medic',
      label: 'Médico',
      desc: 'Reanima en 10s (vs 20s) y doble radio de auxilio',
      icon: <HeartPulse className="w-5 h-5" />,
      color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    },
    {
      id: 'tank',
      label: 'Tanque',
      desc: '+50% HP (150 HP) y atrae la atención del monstruo',
      icon: <Shield className="w-5 h-5" />,
      color: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
    },
    {
      id: 'scout',
      label: 'Explorador',
      desc: 'Visión extendida (105m) y Radar Táctico de 10s',
      icon: <Eye className="w-5 h-5" />,
      color: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
    },
    {
      id: 'marksman',
      label: 'Tirador',
      desc: '+35% de daño a distancia y mayor alcance de tiro',
      icon: <Crosshair className="w-5 h-5" />,
      color: 'border-red-500/50 bg-red-500/10 text-red-300',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    // Validación estricta de código para operaciones privadas
    if (targetPrivateGame && code.trim().toUpperCase() !== targetPrivateGame.code.toUpperCase()) {
      setAccessError('Código de acceso incorrecto. Verifica la clave con el anfitrión.');
      try {
        soundEffects.playAlarm();
      } catch (err) {
        console.warn('No se pudo reproducir alarma:', err);
      }
      return;
    }

    setAccessError(null);
    const finalNick = nickname.trim() || existingNickname || 'Cazador';

    onConfirm({
      code: code.trim().toUpperCase(),
      nickname: finalNick,
      role,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-hud-dark border border-hud-border/80 w-full max-w-lg rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 my-auto">
        <div className="flex items-center justify-between border-b border-hud-border pb-3">
          <div className="flex items-center gap-2">
            {isExistingMember ? (
              <span className="text-xl">🔄</span>
            ) : targetPrivateGame ? (
              <Lock className="w-5 h-5 text-amber-400" />
            ) : (
              <span className="text-xl">🎯</span>
            )}
            <h2 className="text-lg font-mono font-black text-white uppercase tracking-wider">
              {isExistingMember
                ? 'Reconectar a Operación'
                : targetPrivateGame
                ? 'Acceso Restringido: Desbloquear Sala'
                : 'Unirse a Operación'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="text-hud-muted hover:text-white font-mono text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* AVISO DE SALA PRIVADA */}
          {targetPrivateGame && !isExistingMember && (
            <div className="bg-amber-500/10 border border-amber-500/40 p-3 rounded-xl flex items-center gap-2.5 text-xs font-mono text-amber-300">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-white uppercase tracking-wider">
                  {targetPrivateGame.name || 'Operación Privada'}
                </span>
                <span className="text-[11px] text-amber-200/80">
                  Introduce el código de 6 letras para desbloquear el acceso a esta operación táctica.
                </span>
              </div>
            </div>
          )}

          {/* MENSAJE DE ERROR DE ACCESO / CÓDIGO INCORRECTO */}
          {accessError && (
            <div className="bg-red-500/15 border border-red-500/60 p-3 rounded-xl flex items-center gap-2.5 text-xs font-mono text-red-300">
              <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="font-semibold">{accessError}</span>
            </div>
          )}

          {/* AVISO DE JUGADOR REGISTRADO PREVIAMENTE */}
          {isExistingMember && (
            <div className="bg-emerald-500/10 border border-emerald-500/40 p-3 rounded-xl flex items-center justify-between text-xs font-mono text-emerald-300">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>
                  Registro encontrado como: <strong className="text-white">{existingNickname}</strong>
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200">
                Reconexión Activa
              </span>
            </div>
          )}

          {/* CÓDIGO DE SALA Y APODO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-hud-muted mb-1">
                {targetPrivateGame ? 'Introduce Clave (6 Letras)' : 'Código de Sala (6 Letras)'}
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (accessError) setAccessError(null);
                }}
                required
                maxLength={6}
                className="w-full bg-hud-panel border border-hud-border rounded-lg px-3 py-2 text-base font-mono font-black text-hud-cyan tracking-widest text-center uppercase focus:outline-none focus:border-hud-cyan"
                placeholder="ABCDEF"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-hud-muted mb-1">
                {isExistingMember ? 'Apodo Registrado' : 'Tu Apodo de Combate'}
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required={!isExistingMember}
                maxLength={16}
                className="w-full bg-hud-panel border border-hud-border rounded-lg px-3 py-2 text-sm font-mono text-white font-bold focus:outline-none focus:border-hud-cyan"
                placeholder="Ej. Sombra_01"
              />
            </div>
          </div>

          {/* ELECCIÓN DE CLASE */}
          <div>
            <label className="block text-xs font-mono text-hud-muted mb-2">
              {isExistingMember ? 'Clase Asignada (Confirmar)' : 'Selecciona tu Clase de Combate'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roleOptions.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    role === r.id
                      ? `${r.color} ring-1 ring-current scale-[1.01]`
                      : 'border-hud-border bg-hud-panel/60 text-hud-muted hover:border-hud-border/80'
                  }`}
                >
                  <div className="mt-0.5">{r.icon}</div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-black uppercase">
                      {r.label}
                    </span>
                    <span className="text-[10px] font-mono opacity-80 leading-tight mt-0.5">
                      {r.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* BOTÓN ENTRAR */}
          <button
            type="submit"
            disabled={code.length < 6 || (!isExistingMember && !nickname.trim())}
            className={`w-full mt-2 py-3 rounded-xl text-black font-mono font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              targetPrivateGame && !isExistingMember
                ? 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-amber-500/30'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-emerald-500/30'
            }`}
          >
            {isExistingMember ? (
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
            ) : targetPrivateGame ? (
              <Lock className="w-4 h-4" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>
              {isExistingMember
                ? 'Reconectar a la Misión'
                : targetPrivateGame
                ? 'Desbloquear y Unirse'
                : 'Unirse a la Escuadra'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
