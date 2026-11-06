import React from 'react';
import type { PlayerRole } from '../../types/game';

export interface RoleConfig {
  id: PlayerRole;
  label: string;
  desc: string;
  imageSrc: string;
  color: string;
}

export const ROLE_OPTIONS: RoleConfig[] = [
  {
    id: 'scout',
    label: 'Explorador',
    desc: 'Visión extendida (105m) y Radar Táctico de 10s',
    imageSrc: '/assets/icons/roles/role-scout.png',
    color: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  },
  {
    id: 'medic',
    label: 'Médico de Campo',
    desc: 'Reanima en 10s (vs 20s) y doble radio de auxilio',
    imageSrc: '/assets/icons/roles/role-medic.png',
    color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  },
  {
    id: 'tank',
    label: 'Tanque',
    desc: '+50% HP (450 HP) y atrae la atención del monstruo',
    imageSrc: '/assets/icons/roles/role-tank.png',
    color: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  },
  {
    id: 'marksman',
    label: 'Tirador',
    desc: '+35% de daño a distancia y mayor alcance de tiro',
    imageSrc: '/assets/icons/roles/role-marksman.png',
    color: 'border-red-500/50 bg-red-500/10 text-red-300',
  },
];

interface RoleSelectorProps {
  selectedRole: PlayerRole;
  onSelectRole: (role: PlayerRole) => void;
  className?: string;
}

export const RoleSelectorGrid: React.FC<RoleSelectorProps> = ({
  selectedRole,
  onSelectRole,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${className}`}>
      {ROLE_OPTIONS.map((r) => (
        <div
          key={r.id}
          onClick={() => onSelectRole(r.id)}
          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
            selectedRole === r.id
              ? `${r.color} ring-2 ring-current scale-[1.01] shadow-lg`
              : 'border-hud-border bg-hud-panel/60 text-hud-muted hover:border-hud-border/80 hover:bg-hud-panel/80'
          }`}
        >
          <img
            src={r.imageSrc}
            alt={r.label}
            className="w-16 h-16 object-contain shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
          />
          <div className="flex flex-col">
            <span className="text-xs font-mono font-black uppercase text-white tracking-wider">
              {r.label}
            </span>
            <span className="text-[10px] font-mono opacity-80 leading-tight mt-0.5">
              {r.desc}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const RoleSelectionModal: React.FC<{
  isOpen: boolean;
  selectedRole: PlayerRole;
  onSelectRole: (role: PlayerRole) => void;
  onClose: () => void;
}> = ({ isOpen, selectedRole, onSelectRole, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-mono font-black text-white uppercase tracking-wider">
            Selecciona tu Clase de Combate
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-mono text-sm"
          >
            ✕
          </button>
        </div>
        <RoleSelectorGrid
          selectedRole={selectedRole}
          onSelectRole={(r) => {
            onSelectRole(r);
            onClose();
          }}
        />
      </div>
    </div>
  );
};
