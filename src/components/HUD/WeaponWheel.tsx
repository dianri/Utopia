import React from 'react';
import type { Weapon } from '../../types/game';
import { Crosshair, ShieldAlert, Zap, Flame, Target } from 'lucide-react';

interface WeaponWheelProps {
  weapon?: Weapon;
  distToMonster: number;
  isInRange: boolean;
  isFiring: boolean;
  onAttack?: () => void;
}

export const WeaponWheel: React.FC<WeaponWheelProps> = ({
  weapon,
  isInRange,
  isFiring,
  onAttack,
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
        onClick={onAttack}
        role="button"
        tabIndex={0}
        title={isInRange ? 'Pulsar para disparar arma' : 'Monstruo fuera de alcance'}
        className={`bg-hud-dark/95 border backdrop-blur-md px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl shadow-2xl flex items-center justify-between gap-2.5 sm:gap-3 transition-all w-full cursor-pointer select-none active:scale-95 ${
          isInRange
            ? 'border-hud-red shadow-hud-red/40 bg-red-950/40 ring-1 ring-hud-red hover:bg-red-950/60'
            : 'border-hud-border/80 hover:border-hud-border'
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          {/* ICONO DEL ARMA CON PULSO SI DISPARA */}
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
              isFiring
                ? 'bg-red-500/40 border-red-400 text-red-200 scale-105 animate-ping-slow'
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

        {/* GATILLO / BOTÓN TÁCTICO DE DISPARO MANUAL */}
        {onAttack && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAttack();
            }}
            disabled={!isInRange}
            className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg font-mono font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all shadow-md active:scale-90 ${
              isFiring
                ? 'bg-red-500 text-white scale-105 shadow-red-500/50'
                : isInRange
                ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-red-600/40 animate-pulse'
                : 'bg-hud-panel border border-hud-border text-hud-muted opacity-50 cursor-not-allowed'
            }`}
            title={isInRange ? 'Disparar arma' : 'Fuera de alcance'}
          >
            <Crosshair className={`w-3.5 h-3.5 ${isFiring ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">{isFiring ? 'FUEGO!' : 'DISPARAR'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
