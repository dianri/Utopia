import React from 'react';
import type { Weapon } from '../../types/game';
import { Crosshair, ShieldAlert, Zap, Flame, Target } from 'lucide-react';

interface WeaponWheelProps {
  weapon?: Weapon;
  distToMonster: number;
  isInRange: boolean;
  isFiring: boolean;
}

export const WeaponWheel: React.FC<WeaponWheelProps> = ({
  weapon,
  isInRange,
  isFiring,
}) => {
  if (!weapon) return null;

  const renderWeaponIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5" />;
      case 'Crosshair':
        return <Crosshair className="w-5 h-5" />;
      case 'Zap':
        return <Zap className="w-5 h-5" />;
      case 'Flame':
        return <Flame className="w-5 h-5" />;
      default:
        return <Target className="w-5 h-5" />;
    }
  };

  return (
    <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-auto">
      <div
        className={`bg-hud-dark/95 border backdrop-blur-md p-2.5 rounded-xl shadow-2xl flex items-center gap-3 transition-all ${
          isInRange
            ? 'border-hud-red shadow-hud-red/40 bg-red-950/30 ring-1 ring-hud-red'
            : 'border-hud-border/80'
        }`}
      >
        {/* ICONO DEL ARMA CON PULSO SI DISPARA */}
        <div
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-all ${
            isFiring
              ? 'bg-red-500/30 border-red-400 text-red-300 scale-110 animate-ping-slow'
              : isInRange
              ? 'bg-red-950/60 border-red-500/70 text-red-400'
              : 'bg-hud-card border-hud-border text-hud-cyan'
          }`}
        >
          {renderWeaponIcon(weapon.iconName)}
        </div>

        {/* DETALLES DE NOMBRE Y MUNICIÓN */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-black text-white uppercase tracking-wider">
              {weapon.name}
            </span>
            <span className="text-[10px] font-mono text-hud-muted">
              ({weapon.rangeMeters}m)
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono font-bold text-hud-amber">
              {weapon.ammo === -1 ? '∞ Munición' : `${weapon.ammo}/${weapon.maxAmmo} Balas`}
            </span>
            {isInRange && (
              <span className="text-[10px] font-black text-hud-red uppercase animate-pulse">
                [EN ALCANCE]
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
