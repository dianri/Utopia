import React from 'react';
import type { InventoryItem, DroppedItem } from '../../types/game';
import { MAX_INVENTORY_SLOTS } from '../../types/game';
import { Package, X, Check, ArrowDownToLine, Flame, Zap, Target, ShieldAlert, Crosshair, Sparkles } from 'lucide-react';

interface BackpackModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  equippedItemId?: string | null;
  onEquipItem: (item: InventoryItem) => void;
  onDropItem: (item: InventoryItem) => void;
  nearbyDroppedItems?: DroppedItem[];
  onPickDroppedItem?: (dropped: DroppedItem) => void;
}

export const BackpackModal: React.FC<BackpackModalProps> = ({
  isOpen,
  onClose,
  inventory,
  equippedItemId,
  onEquipItem,
  onDropItem,
  nearbyDroppedItems = [],
  onPickDroppedItem,
}) => {
  if (!isOpen) return null;

  const getTierDetails = (tier: number) => {
    switch (tier) {
      case 7:
        return {
          label: 'TIER 7 (LEGENDARIO)',
          badgeBg: 'bg-red-500/20 border-red-500 text-red-300',
          cardBorder: 'border-red-500/60 shadow-red-950/50',
          icon: <Target className="w-5 h-5 text-red-400" />,
        };
      case 6:
        return {
          label: 'TIER 6 (ÉPICO)',
          badgeBg: 'bg-orange-500/20 border-orange-500 text-orange-300',
          cardBorder: 'border-orange-500/60 shadow-orange-950/50',
          icon: <Flame className="w-5 h-5 text-orange-400" />,
        };
      case 5:
        return {
          label: 'TIER 5 (SUPERIOR)',
          badgeBg: 'bg-cyan-500/20 border-cyan-400 text-cyan-300',
          cardBorder: 'border-cyan-500/60 shadow-cyan-950/50',
          icon: <Flame className="w-5 h-5 text-cyan-400" />,
        };
      case 4:
        return {
          label: 'TIER 4 (AVANZADO)',
          badgeBg: 'bg-purple-500/20 border-purple-400 text-purple-300',
          cardBorder: 'border-purple-500/60 shadow-purple-950/50',
          icon: <Target className="w-5 h-5 text-purple-400" />,
        };
      case 3:
        return {
          label: 'TIER 3 (MILITAR)',
          badgeBg: 'bg-blue-500/20 border-blue-400 text-blue-300',
          cardBorder: 'border-blue-500/60 shadow-blue-950/50',
          icon: <Zap className="w-5 h-5 text-blue-400" />,
        };
      case 2:
        return {
          label: 'TIER 2 (CONTUNDENTE)',
          badgeBg: 'bg-amber-500/20 border-amber-400 text-amber-300',
          cardBorder: 'border-amber-500/60 shadow-amber-950/50',
          icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
        };
      case 1:
      default:
        return {
          label: 'TIER 1 (BÁSICO)',
          badgeBg: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
          cardBorder: 'border-emerald-500/60 shadow-emerald-950/50',
          icon: <Crosshair className="w-5 h-5 text-emerald-400" />,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg bg-[#0a0f16]/95 border-2 border-hud-border/80 rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* CABECERA TÁCTICA */}
        <div className="p-4 border-b border-hud-border/60 bg-gradient-to-r from-hud-card via-[#111c29] to-hud-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-hud-cyan/10 border border-hud-cyan/40 flex items-center justify-center text-hud-cyan">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-mono font-black text-white uppercase tracking-wider">
                  Mochila Táctica
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-hud-dark border border-hud-cyan/40 text-hud-cyan font-bold">
                  {inventory.length} / {MAX_INVENTORY_SLOTS} SLOTS
                </span>
              </div>
              <p className="text-[11px] font-mono text-hud-muted">
                Gestiona tu equipamiento, cambia de arma o descarta al terreno
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-hud-dark/80 border border-hud-border hover:border-white/40 text-hud-muted hover:text-white transition-all cursor-pointer"
            title="Cerrar mochila"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* LISTADO DE ITEMS EN INVENTARIO */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block px-1">
              Armamento y Pertencias ({inventory.length}/{MAX_INVENTORY_SLOTS})
            </span>

            {inventory.map((item) => {
              const tierInfo = getTierDetails(item.tier);
              const isEquipped = item.id === equippedItemId;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border backdrop-blur-sm transition-all flex flex-col gap-2.5 ${tierInfo.cardBorder} ${
                    isEquipped
                      ? 'bg-hud-cyan/10 border-hud-cyan ring-1 ring-hud-cyan/40'
                      : 'bg-hud-dark/80 hover:bg-hud-dark/95'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-black/60 border border-hud-border flex items-center justify-center shrink-0">
                        {tierInfo.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-mono font-black text-white uppercase truncate">
                            {item.name}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${tierInfo.badgeBg}`}
                          >
                            T{item.tier}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {tierInfo.label}
                        </span>
                      </div>
                    </div>

                    {isEquipped && (
                      <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-hud-cyan/20 border border-hud-cyan text-hud-cyan uppercase tracking-wider shrink-0 flex items-center gap-1 animate-pulse">
                        <Check className="w-3 h-3" /> EQUIPADA
                      </span>
                    )}
                  </div>

                  {/* ESTADÍSTICAS TÁCTICAS */}
                  <div className="grid grid-cols-3 gap-2 bg-black/40 border border-hud-border/40 rounded-lg p-2 text-center text-[10px] font-mono">
                    <div>
                      <span className="text-hud-muted block text-[9px]">DAÑO</span>
                      <span className="font-bold text-white">{item.damage}</span>
                    </div>
                    <div>
                      <span className="text-hud-muted block text-[9px]">CADENCIA</span>
                      <span className="font-bold text-white">{(1000 / item.cadenceMs).toFixed(1)}/s</span>
                    </div>
                    <div>
                      <span className="text-hud-muted block text-[9px]">MUNICIÓN</span>
                      <span
                        className={`font-bold ${
                          item.isInfinite
                            ? 'text-emerald-400'
                            : item.ammo <= 5
                            ? 'text-red-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {item.isInfinite ? '∞ Infinita' : `${item.ammo}/${item.maxAmmo}`}
                      </span>
                    </div>
                  </div>

                  {/* BOTONES DE ACCIÓN */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-hud-border/30">
                    {!isEquipped && (
                      <button
                        onClick={() => onEquipItem(item)}
                        className="px-3 py-1.5 rounded-lg bg-hud-cyan/20 border border-hud-cyan hover:bg-hud-cyan/30 text-hud-cyan text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Equipar
                      </button>
                    )}

                    {!item.isInfinite ? (
                      <button
                        onClick={() => onDropItem(item)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-500/60 hover:bg-red-900/40 text-red-300 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title="Descartar arma en el terreno"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" /> Soltar
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500 italic px-2 py-1">
                        Arma básica indestructible
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* OBJETOS DESCARTADOS EN EL SUELO (A MENOS DE 15M) */}
          {nearbyDroppedItems.length > 0 && (
            <div className="pt-2 border-t border-hud-border/40 space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Objetos tirados en el suelo (&lt;15m)
              </span>

              <div className="space-y-2">
                {nearbyDroppedItems.map((dropped) => {
                  const tierInfo = getTierDetails(dropped.item.tier);
                  const isFull = inventory.length >= MAX_INVENTORY_SLOTS;

                  return (
                    <div
                      key={dropped.id}
                      className="p-2.5 rounded-xl bg-black/60 border border-amber-500/40 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-amber-950/40 border border-amber-500/60 flex items-center justify-center text-sm shrink-0">
                          {tierInfo.icon}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-mono font-bold text-white uppercase block truncate">
                            {dropped.item.name}
                          </span>
                          <span className="text-[9px] font-mono text-amber-300">
                            Tier {dropped.item.tier} • Munición: {dropped.item.ammo}/{dropped.item.maxAmmo}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onPickDroppedItem?.(dropped)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${
                          isFull
                            ? 'bg-amber-600 hover:bg-amber-500 text-black shadow-amber-500/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30'
                        }`}
                      >
                        {isFull ? 'Intercambiar' : 'Recoger'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* PIE DE PÁGINA */}
        <div className="p-3 bg-hud-dark border-t border-hud-border/60 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-hud-card hover:bg-hud-card/80 border border-hud-border rounded-xl text-xs font-mono font-bold text-slate-300 uppercase tracking-widest transition-all"
          >
            Cerrar Mochila
          </button>
        </div>
      </div>
    </div>
  );
};
