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
        return <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />;
      case 'Crosshair':
        return <Crosshair className="w-5 h-5 sm:w-6 sm:h-6" />;
      case 'Zap':
        return <Zap className="w-5 h-5 sm:w-6 sm:h-6" />;
      case 'Flame':
        return <Flame className="w-5 h-5 sm:w-6 sm:h-6" />;
      default:
        return <Target className="w-5 h-5 sm:w-6 sm:h-6" />;
    }
  };

  return (
    <div className="fixed bottom-6 left-4 z-30 flex items-end gap-2 pb-[env(safe-area-inset-bottom,1rem)] max-w-[calc(100vw-7.5rem)] sm:max-w-xs pointer-events-auto">
      <div
        className={`bg-hud-dark/95 border backdrop-blur-md px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 sm:gap-3 transition-all w-full ${
          isInRange
            ? 'border-hud-red shadow-hud-red/40 bg-red-950/40 ring-1 ring-hud-red'
            : 'border-hud-border/80'
        }`}
      >
        {/* ICONO DEL ARMA CON PULSO SI DISPARA */}
        <div
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
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
            <span className="text-xs sm:text-sm font-mono font-black text-white uppercase tracking-wider truncate">
              {weapon.name}
            </span>
            <span className="text-[10px] sm:text-xs font-mono text-hud-muted shrink-0">
              ({weapon.rangeMeters}m)
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0">
            <span className="text-[11px] sm:text-xs font-mono font-bold text-hud-amber truncate">
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
