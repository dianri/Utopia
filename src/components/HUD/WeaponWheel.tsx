import React from 'react';
import type { Weapon } from '../../types/game';
import { getWeaponIcon } from '../../services/combatEngine';
import { Crosshair, ShieldAlert } from 'lucide-react';

interface WeaponWheelProps {
  weapon?: Weapon;
  distToMonster: number;
  isInRange: boolean;
  isFiring: boolean;
  isCriticallyWounded?: boolean;
  backpackItemCount?: number;
  onOpenBackpack?: () => void;
  onAttack?: () => void;
  className?: string;
}

export const WeaponWheel: React.FC<WeaponWheelProps> = ({
  weapon,
  isInRange,
  isFiring,
  isCriticallyWounded = false,
  backpackItemCount,
  onOpenBackpack,
  onAttack,
  className,
}) => {
  if (!weapon) return null;

  if (isCriticallyWounded) {
    return (
      <div className={`flex-1 min-w-0 flex items-center gap-2 pointer-events-auto ${className || ''}`}>
        {onOpenBackpack && (
          <button
            type="button"
            onClick={onOpenBackpack}
            className="w-12 h-12 rounded-xl bg-hud-dark/95 border-2 border-hud-border/80 hover:border-hud-cyan text-slate-300 hover:text-hud-cyan shadow-2xl backdrop-blur-md transition-all active:scale-95 flex flex-col items-center justify-center shrink-0 relative cursor-pointer group"
            title="Abrir Mochila Táctica"
            aria-label="Abrir Mochila"
          >
            <img src="/assets/icons/hud/hud-backpack.png" alt="Mochila" className="w-5 h-5 object-contain transition-transform group-hover:scale-110" />
            <span className="text-[8px] font-mono font-bold uppercase tracking-tighter mt-0.5">
              MOCHILA
            </span>
            {backpackItemCount !== undefined && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-hud-cyan text-black font-black font-mono text-[9px] rounded-full shadow flex items-center justify-center">
                {backpackItemCount}
              </span>
            )}
          </button>
        )}
        <div className="bg-red-950/95 border-2 border-red-500 backdrop-blur-md px-3 py-2 rounded-xl shadow-2xl shadow-red-900/50 flex items-center gap-2.5 flex-1 min-w-0 select-none animate-pulse">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 border-red-400 bg-red-900/80 flex items-center justify-center shrink-0 text-red-200">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[11px] sm:text-xs font-mono font-black text-red-300 uppercase tracking-wider truncate">
              [BLOQUEADO: HERIDO]
            </span>
            <span className="text-[9px] sm:text-[10px] font-mono text-red-200/80 truncate">
              Arma inhabilitada. Ve al Hospital.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 pointer-events-auto ${className || ''}`}>
      {/* BOTÓN DE MOCHILA / INVENTARIO */}
      {onOpenBackpack && (
        <button
          type="button"
          onClick={onOpenBackpack}
          className="w-12 h-12 rounded-xl bg-hud-dark/95 border-2 border-hud-border/80 hover:border-hud-cyan text-slate-300 hover:text-hud-cyan shadow-2xl backdrop-blur-md transition-all active:scale-95 flex flex-col items-center justify-center shrink-0 relative cursor-pointer group"
          title="Abrir Mochila Táctica"
          aria-label="Abrir Mochila"
        >
          <img src="/assets/icons/hud/hud-backpack.png" alt="Mochila" className="w-5 h-5 object-contain transition-transform group-hover:scale-110" />
          <span className="text-[8px] font-mono font-bold uppercase tracking-tighter mt-0.5">
            MOCHILA
          </span>
          {backpackItemCount !== undefined && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-hud-cyan text-black font-black font-mono text-[9px] rounded-full shadow flex items-center justify-center">
              {backpackItemCount}
            </span>
          )}
        </button>
      )}

      {/* TARJETA DE ARMA EQUIPADA */}
      <div
        onClick={onAttack}
        role="button"
        tabIndex={0}
        title={isInRange ? 'Pulsar para disparar arma' : 'Monstruo fuera de alcance'}
        className={`bg-hud-dark/95 border backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-2xl flex items-center justify-between gap-2 sm:gap-2.5 transition-all flex-1 min-w-0 cursor-pointer select-none active:scale-95 ${
          isInRange
            ? 'border-hud-red shadow-hud-red/40 bg-red-950/40 ring-1 ring-hud-red hover:bg-red-950/60'
            : 'border-hud-border/80 hover:border-hud-border'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* ICONO DEL ARMA CON PULSO SI DISPARA */}
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg border flex items-center justify-center p-1 shrink-0 transition-all ${
              isFiring
                ? 'bg-red-500/40 border-red-400 text-red-200 scale-105 animate-ping-slow'
                : isInRange
                ? 'bg-red-950/60 border-red-500/70 text-red-400'
                : 'bg-hud-card border-hud-border text-hud-cyan'
            }`}
          >
            <img src={getWeaponIcon(weapon.weaponType)} alt={weapon.name} className="w-6 h-6 object-contain" />
          </div>

          {/* DETALLES DE NOMBRE Y MUNICIÓN */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] sm:text-xs font-mono font-black text-white uppercase tracking-wider truncate">
                {weapon.name}
              </span>
              {weapon.tier && (
                <span className="text-[8px] font-mono font-black px-1 rounded bg-black/60 border border-hud-border text-hud-cyan shrink-0">
                  T{weapon.tier}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-mono font-bold text-hud-amber truncate">
                {weapon.ammo === -1 ? '∞ Munición' : `${weapon.ammo}/${weapon.maxAmmo}`}
              </span>
              <span className="text-[9px] font-mono text-hud-muted shrink-0">
                ({weapon.rangeMeters}m)
              </span>
              {isInRange && (
                <span className="hidden xs:inline text-[8px] font-black text-hud-red uppercase animate-pulse shrink-0">
                  [ALCANCE]
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
            className={`px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-lg font-mono font-black text-[9px] sm:text-[10px] uppercase tracking-wider flex items-center gap-1 shrink-0 transition-all shadow-md active:scale-90 ${
              isFiring
                ? 'bg-red-500 text-white scale-105 shadow-red-500/50'
                : isInRange
                ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-red-600/40 animate-pulse'
                : 'bg-hud-panel border border-hud-border text-hud-muted opacity-50 cursor-not-allowed'
            }`}
            title={isInRange ? 'Disparar arma' : 'Fuera de alcance'}
          >
            <Crosshair className={`w-3.5 h-3.5 ${isFiring ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">{isFiring ? 'FUEGO!' : 'FUEGO'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
