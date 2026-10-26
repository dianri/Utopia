import React, { useState } from 'react';
import type { PlayerRole } from '../../types/game';
import { Shield, HeartPulse, Eye, Crosshair, LogIn } from 'lucide-react';

interface JoinRoomModalProps {
  initialCode?: string;
  onConfirm: (config: { code: string; nickname: string; role: PlayerRole }) => void;
  onCancel: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  initialCode = '',
  onConfirm,
  onCancel,
}) => {
  const [code, setCode] = useState<string>(initialCode.toUpperCase());
  const [nickname, setNickname] = useState<string>('');
  const [role, setRole] = useState<PlayerRole>('medic');

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
    if (!code.trim() || !nickname.trim()) return;

    onConfirm({
      code: code.trim().toUpperCase(),
      nickname: nickname.trim(),
      role,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-hud-dark border border-hud-border/80 w-full max-w-lg rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-5 my-auto">
        <div className="flex items-center justify-between border-b border-hud-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h2 className="text-lg font-mono font-black text-white uppercase tracking-wider">
              Unirse a Operación
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
          {/* CÓDIGO DE SALA Y APODO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-hud-muted mb-1">
                Código de Sala (6 Letras)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={6}
                className="w-full bg-hud-panel border border-hud-border rounded-lg px-3 py-2 text-base font-mono font-black text-hud-cyan tracking-widest text-center uppercase focus:outline-none focus:border-hud-cyan"
                placeholder="ABCDEF"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-hud-muted mb-1">
                Tu Apodo de Combate
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                maxLength={16}
                className="w-full bg-hud-panel border border-hud-border rounded-lg px-3 py-2 text-sm font-mono text-white font-bold focus:outline-none focus:border-hud-cyan"
                placeholder="Ej. Sombra_01"
              />
            </div>
          </div>

          {/* ELECCIÓN DE CLASE */}
          <div>
            <label className="block text-xs font-mono text-hud-muted mb-2">
              Selecciona tu Clase de Combate
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
            disabled={code.length < 4 || !nickname.trim()}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-mono font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/30 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Unirse a la Escuadra</span>
          </button>
        </form>
      </div>
    </div>
  );
};
