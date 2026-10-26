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
        return <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />;
      case 'Crosshair':
        return <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />;
      case 'Zap':
        return <Zap className="w-4 h-4 sm:w-5 sm:h-5" />;
      case 'Flame':
        return <Flame className="w-4 h-4 sm:w-5 sm:h-5" />;
      default:
        return <Target className="w-4 h-4 sm:w-5 sm:h-5" />;
    }
  };

  return (
    <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-2 sm:left-4 z-20 pointer-events-auto max-w-[calc(100vw-6.5rem)] sm:max-w-xs">
      <div
        className={`bg-hud-dark/95 border backdrop-blur-md px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl shadow-2xl flex items-center gap-2 sm:gap-3 transition-all ${
          isInRange
            ? 'border-hud-red shadow-hud-red/40 bg-red-950/40 ring-1 ring-hud-red'
            : 'border-hud-border/80'
        }`}
      >
        {/* ICONO DEL ARMA CON PULSO SI DISPARA */}
        <div
          className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
            isFiring
              ? 'bg-red-500/30 border-red-400 text-red-300 scale-105 animate-ping-slow'
              : isInRange
              ? 'bg-red-950/60 border-red-500/70 text-red-400'
              : 'bg-hud-card border-hud-border text-hud-cyan'
          }`}
        >
          {renderWeaponIcon(weapon.iconName)}
        </div>

        {/* DETALLES DE NOMBRE Y MUNICIÓN */}
        <div className="flex flex-col min-w-0 overflow-hidden flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] sm:text-xs font-mono font-black text-white uppercase tracking-wider truncate">
              {weapon.name}
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-hud-muted shrink-0">
              ({weapon.rangeMeters}m)
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-hud-amber truncate">
              {weapon.ammo === -1 ? '∞ Munición' : `${weapon.ammo}/${weapon.maxAmmo} Balas`}
            </span>
            {isInRange && (
              <span className="text-[9px] sm:text-[10px] font-black text-hud-red uppercase animate-pulse shrink-0">
                [EN ALCANCE]
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
