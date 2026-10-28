import React, { useState, useEffect } from 'react';
import type { InventoryItem, DroppedItem, Pet, PetType } from '../../types/game';
import {
  Package,
  X,
  Check,
  ArrowDownToLine,
  Flame,
  Zap,
  Target,
  ShieldAlert,
  Crosshair,
  Sparkles,
  PawPrint,
  Swords,
} from 'lucide-react';

interface BackpackModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  pets?: Pet[];
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
  pets = [],
  equippedItemId,
  onEquipItem,
  onDropItem,
  nearbyDroppedItems = [],
  onPickDroppedItem,
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'pets'>('inventory');

  // Al abrir el modal, la pestaña activa por defecto siempre debe ser 'inventory'
  useEffect(() => {
    if (isOpen) {
      setActiveTab('inventory');
    }
  }, [isOpen]);

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
        return {
          label: 'TIER 1 (BÁSICO)',
          badgeBg: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
          cardBorder: 'border-emerald-500/60 shadow-emerald-950/50',
          icon: <Crosshair className="w-5 h-5 text-emerald-400" />,
        };
      case 0:
      default:
        return {
          label: 'TIER 0 (CUERPO A CUERPO)',
          badgeBg: 'bg-zinc-500/20 border-zinc-500 text-zinc-300',
          cardBorder: 'border-zinc-500/60 shadow-zinc-950/50',
          icon: <ShieldAlert className="w-5 h-5 text-zinc-400" />,
        };
    }
  };

  const getPetTraitInfo = (type: PetType) => {
    switch (type) {
      case 'dog':
        return {
          title: 'Rastreo Avanzado',
          desc: 'Recoge suministros automáticamente en un radio ampliado de 25 metros.',
        };
      case 'drone':
        return {
          title: 'Apoyo Aéreo',
          desc: 'Inflige 10 DMG continuo a distancia y amplía el campo de visión táctica.',
        };
      case 'electric_mouse':
        return {
          title: 'Sobrecarga Eléctrica',
          desc: 'Descargas periódicas de 8 DMG que desestabilizan al monstruo.',
        };
      case 'rabbit':
        return {
          title: 'Avance Veloz',
          desc: 'Máxima velocidad de desplazamiento hacia suministros distantes.',
        };
      case 'cat':
        return {
          title: 'Reflejos Felinos',
          desc: 'Concede al jugador un +10% de evasión frente a los ataques del enemigo.',
        };
      case 'med_bot':
        return {
          title: 'Nanobots Médicos',
          desc: 'Regenera de forma pasiva +2 HP cada 5 segundos fuera de combate.',
        };
      default:
        return {
          title: 'Compañero Fiel',
          desc: 'Asiste activamente en la exploración y combate en Utopia.',
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
                  {activeTab === 'inventory'
                    ? `${inventory.length} OBJETOS (ILIMITADA)`
                    : `${pets.length} ACOMPAÑANTES`}
                </span>
              </div>
              <p className="text-[11px] font-mono text-hud-muted">
                {activeTab === 'inventory'
                  ? 'Gestiona tu equipamiento, cambia de arma o descarta al terreno'
                  : 'Escuadra de mascotas con habilidades pasivas y soporte en combate'}
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

        {/* SELECTOR SEGMENTADO DE PESTAÑAS (DISEÑO MILITAR/CIBERPUNK) */}
        <div className="px-4 pt-2.5 pb-0 bg-hud-card/70 border-b border-hud-border/40 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 py-2 px-3 rounded-t-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-t border-x transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-[#0a0f16] border-hud-cyan text-white shadow-[0_-2px_10px_rgba(0,240,255,0.15)] relative -mb-[1px] pb-2.5 z-10'
                : 'bg-black/30 border-transparent text-slate-400 hover:text-slate-200 hover:bg-black/50'
            }`}
          >
            <Swords className={`w-3.5 h-3.5 ${activeTab === 'inventory' ? 'text-hud-cyan' : 'text-slate-500'}`} />
            <span>EQUIPO / ARMAS</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'inventory'
                  ? 'bg-hud-cyan/20 text-hud-cyan border border-hud-cyan/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {inventory.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pets')}
            className={`flex-1 py-2 px-3 rounded-t-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-t border-x transition-all cursor-pointer ${
              activeTab === 'pets'
                ? 'bg-[#0a0f16] border-emerald-400 text-white shadow-[0_-2px_10px_rgba(52,211,153,0.15)] relative -mb-[1px] pb-2.5 z-10'
                : 'bg-black/30 border-transparent text-slate-400 hover:text-slate-200 hover:bg-black/50'
            }`}
          >
            <PawPrint className={`w-3.5 h-3.5 ${activeTab === 'pets' ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span>MASCOTAS</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'pets'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {pets.length}
            </span>
          </button>
        </div>

        {/* CONTENIDO SCROLLABLE FLUIDO */}
        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
          {/* PESTAÑA 1: ARMAMENTO Y EQUIPO */}
          {activeTab === 'inventory' && (
            <div className="space-y-4 animate-fade-in">
              {/* LISTADO DE ITEMS EN INVENTARIO */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block px-1">
                  Armamento y Pertenencias ({inventory.length} {inventory.length === 1 ? 'objeto' : 'objetos'})
                </span>

                {inventory.length === 0 && (
                  <div className="p-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-center space-y-1">
                    <p className="text-xs font-mono font-bold text-zinc-300 uppercase">Mochila vacía</p>
                    <p className="text-[11px] font-mono text-zinc-400">
                      Combatiendo con Puños (Tier 0). Recoge armas de cajas de suministros o del terreno.
                    </p>
                  </div>
                )}

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

                        <button
                          onClick={() => onDropItem(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-500/60 hover:bg-red-900/40 text-red-300 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                          title="Descartar en el terreno"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" /> Soltar
                        </button>
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
                                Tier {dropped.item.tier} • Munición:{' '}
                                {dropped.item.ammo === -1 ? '∞' : `${dropped.item.ammo}/${dropped.item.maxAmmo}`}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => onPickDroppedItem?.(dropped)}
                            className="px-3 py-1.5 rounded-lg text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/30 cursor-pointer"
                          >
                            Recoger
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PESTAÑA 2: ESCUADRA DE MASCOTAS */}
          {activeTab === 'pets' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  Escuadra de Acompañantes ({pets.length} {pets.length === 1 ? 'mascota' : 'mascotas'})
                </span>
                <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Asistencia Activa
                </span>
              </div>

              {pets.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950/40 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl shadow-inner">
                    🐾
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Sin mascotas asignadas
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                      Explora el mapa para encontrar animales o drones silvestres. Al aproximarte a menos de 25 metros, se unirán automáticamente a tu comitiva de combate.
                    </p>
                  </div>
                </div>
              ) : (
                pets.map((pet) => {
                  const traitInfo = getPetTraitInfo(pet.type);
                  const petHpPercent = Math.max(0, Math.min(100, Math.round((pet.hp / pet.maxHp) * 100)));

                  return (
                    <div
                      key={pet.id}
                      className={`p-3.5 rounded-xl border backdrop-blur-sm transition-all flex flex-col gap-3 ${
                        pet.isWounded
                          ? 'bg-red-950/20 border-red-500/40'
                          : 'bg-slate-950/80 border-emerald-500/50 shadow-lg shadow-emerald-950/30 hover:border-emerald-400'
                      }`}
                    >
                      {/* ENCABEZADO: AVATAR, NOMBRE Y ESTADO */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl shadow-lg shrink-0 ${
                            pet.isWounded
                              ? 'bg-slate-900 border-slate-700 grayscale opacity-60'
                              : 'bg-emerald-950/60 border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                          }`}
                        >
                          {pet.icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3
                              className={`text-sm font-mono font-black uppercase truncate ${
                                pet.isWounded ? 'text-slate-400' : 'text-white'
                              }`}
                            >
                              {pet.name}
                            </h3>
                            {pet.isWounded ? (
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-950/90 border border-red-500 text-red-300 uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-sm">
                                <span>💫</span> HERIDA / INACTIVA
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400 text-emerald-300 uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-sm animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ACTIVA / EN ÓRBITA
                              </span>
                            )}
                          </div>

                          {/* BARRA DE VIDA */}
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-slate-400">SALUD</span>
                              <span
                                className={`font-bold ${
                                  pet.isWounded
                                    ? 'text-red-400'
                                    : petHpPercent < 30
                                    ? 'text-amber-400'
                                    : 'text-emerald-300'
                                }`}
                              >
                                {pet.hp} / {pet.maxHp} HP
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-black/60 border border-hud-border/40 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  pet.isWounded
                                    ? 'bg-red-500/50'
                                    : petHpPercent < 30
                                    ? 'bg-red-500'
                                    : 'bg-emerald-400'
                                }`}
                                style={{ width: `${petHpPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* VENTAJA TÁCTICA / HABILIDAD PASIVA */}
                      <div className="p-2.5 rounded-lg bg-black/50 border border-hud-border/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{traitInfo.title}</span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-300 leading-relaxed">
                          {traitInfo.desc}
                        </p>
                      </div>

                      {/* ESTADÍSTICAS DE COMBATE */}
                      <div className="grid grid-cols-2 gap-2 bg-black/50 border border-hud-border/30 rounded-lg p-2 text-center text-[10px] font-mono">
                        <div>
                          <span className="text-hud-muted block text-[9px] uppercase">DAÑO EN COMBATE</span>
                          <span className="font-bold text-white text-xs">{pet.damage} DMG</span>
                        </div>
                        <div>
                          <span className="text-hud-muted block text-[9px] uppercase">CADENCIA</span>
                          <span className="font-bold text-white text-xs">{(1000 / pet.attackIntervalMs).toFixed(1)}/s</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* PIE DE PÁGINA */}
        <div className="p-3 bg-hud-dark border-t border-hud-border/60 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-hud-card hover:bg-hud-card/80 border border-hud-border rounded-xl text-xs font-mono font-bold text-slate-300 uppercase tracking-widest transition-all cursor-pointer"
          >
            Cerrar Mochila
          </button>
        </div>
      </div>
    </div>
  );
};
