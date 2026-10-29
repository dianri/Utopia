import React, { useState, useEffect } from 'react';
import { Crown, AlertTriangle, KeyRound, ShieldAlert } from 'lucide-react';

interface ChestCountdownProps {
  currentPhase: number; // 1, 2, 3
  currentStep: number;  // 0, 1
  currentChestIndex?: number; // 1, 2, 3
  totalChests?: number; // default: 3
  isInChestZone: boolean;
  isMonsterInChestZone?: boolean;
  isMonsterDefending?: boolean;
  isMonsterAlive?: boolean;
  isChestInteracted: boolean;
  onOpenChestModal: () => void;
  // Fallbacks de compatibilidad
  secondsRemaining?: number;
  holdersCount?: number;
  requiredHolders?: number;
}

export const ChestCountdown: React.FC<ChestCountdownProps> = ({
  currentPhase,
  currentStep,
  currentChestIndex = 1,
  totalChests = 3,
  isInChestZone,
  isMonsterInChestZone = false,
  isMonsterDefending,
  isMonsterAlive = true,
  isChestInteracted,
  onOpenChestModal,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const isMonsterBlocking =
    (typeof isMonsterDefending === 'boolean' ? isMonsterDefending : isMonsterInChestZone) &&
    isMonsterAlive;

  const totalCompleted = (currentPhase - 1) * 2 + currentStep;
  const percent = Math.min(100, Math.round((totalCompleted / 6) * 100));

  const phaseNames: Record<number, string> = {
    1: 'Fase 1: Frecuencia Temporal',
    2: 'Fase 2: Código Encriptado',
    3: 'Fase 3: Sintonizador de Núcleo',
  };

  // Cierre automático del popover táctico en móvil tras 3 segundos
  useEffect(() => {
    if (!isPopoverOpen) return;
    const timer = setTimeout(() => {
      setIsPopoverOpen(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isPopoverOpen]);

  const handleMobilePillClick = () => {
    // Si está en zona del cofre y despejado, abrir directamente el modal de desencriptar
    if (isInChestZone && !isMonsterBlocking && totalCompleted < 6) {
      onOpenChestModal();
      return;
    }
    // De lo contrario, conmutar popover táctico temporal con los 6 cerrojos
    setIsPopoverOpen((prev) => !prev);
  };

  return (
    <div className="fixed left-3 top-[88px] sm:top-24 sm:left-4 z-20 pointer-events-auto select-none">
      {/* ==================================================== */}
      {/* 1. MÓVIL (< 640px): MICRO-PÍLDORA FLOTANTE COMPACTA */}
      {/* ==================================================== */}
      <div className="relative sm:hidden">
        <button
          type="button"
          onClick={handleMobilePillClick}
          className={`h-7 px-2.5 py-1 rounded-full bg-slate-950/85 backdrop-blur-md border shadow-lg flex items-center gap-2 active:scale-95 transition-all ${
            isInChestZone
              ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-emerald-950/40'
              : 'border-amber-500/60 shadow-amber-950/30'
          }`}
          title={
            isInChestZone && !isMonsterBlocking
              ? 'Toca para desencriptar cofre'
              : 'Toca para ver cerrojos del cofre'
          }
          aria-label="Progreso del cofre del tesoro"
        >
          <Crown
            className={`w-3.5 h-3.5 shrink-0 ${
              isInChestZone ? 'text-emerald-400 animate-bounce' : 'text-amber-400'
            }`}
          />
          <span className="text-[11px] font-mono font-bold text-amber-300">
            [{currentChestIndex}/{totalChests}] {totalCompleted}/6
          </span>

          {/* Micro-barra de progreso (anchura 40px, altura 3px) */}
          <div className="w-10 h-[3px] bg-slate-800 rounded-full overflow-hidden border border-amber-500/30">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Badge interactivo según estado */}
          {totalCompleted >= 6 ? (
            <span className="text-[8px] font-mono font-black text-emerald-400">✓</span>
          ) : isInChestZone ? (
            isMonsterBlocking ? (
              <span className="text-[8px] font-mono font-bold text-red-400 animate-pulse">⚠️</span>
            ) : (
              <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded-full bg-emerald-500 text-black animate-pulse shadow-sm">
                ABRIR
              </span>
            )
          ) : isChestInteracted ? (
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />
          ) : null}
        </button>

        {/* POPOVER TÁCTICO FLOTANTE TEMPORAL (Móvil) */}
        {isPopoverOpen && (
          <>
            {/* Backdrop invisible para cerrar al tocar fuera */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsPopoverOpen(false)}
            />
            <div className="absolute top-9 left-0 z-20 w-60 p-2.5 rounded-xl bg-slate-950/95 border border-amber-500/70 shadow-2xl backdrop-blur-lg flex flex-col gap-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-[11px] font-mono font-black text-amber-300 uppercase">
                    COFRE [{currentChestIndex}/{totalChests}] • ({totalCompleted}/6)
                  </span>
                </div>
                <span className="text-[9px] font-mono text-slate-400">
                  Fase {currentPhase}
                </span>
              </div>

              {/* 6 mini cerrojos */}
              <div className="flex items-center justify-between gap-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isDone = idx < totalCompleted;
                  const isCurrent = idx === totalCompleted;
                  return (
                    <div
                      key={idx}
                      className={`flex-1 h-5 rounded text-[9px] font-mono font-black flex items-center justify-center border ${
                        isDone
                          ? 'bg-emerald-500 border-emerald-300 text-black shadow-sm'
                          : isCurrent
                          ? 'bg-amber-500 border-amber-300 text-black animate-pulse'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </div>
                  );
                })}
              </div>

              {/* Detalle o acción en popover */}
              {totalCompleted >= 6 ? (
                <div className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-950/80 p-1 rounded border border-emerald-400 text-center">
                  🎉 ¡COFRE TOTALMENTE DESENCRIPTADO!
                </div>
              ) : isInChestZone ? (
                isMonsterBlocking ? (
                  <div className="flex items-center gap-1 text-[9px] font-mono text-red-300 bg-red-950/70 p-1 rounded border border-red-500/50 animate-pulse">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>¡MONSTRUO DEFENDIENDO EL COFRE!</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPopoverOpen(false);
                      onOpenChestModal();
                    }}
                    className="w-full py-1 px-2 rounded-lg font-mono font-black text-[10px] uppercase bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black flex items-center justify-center gap-1 active:scale-95 shadow"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>DESENCRIPTAR FASE {currentPhase}</span>
                  </button>
                )
              ) : (
                <div className="text-[9px] font-mono text-slate-400 text-center">
                  Dirígete al cofre (&lt;20m) para hackearlo
                </div>
              )}

              {isChestInteracted && (
                <div className="flex items-center gap-1 text-[8px] font-mono text-orange-400 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-500/30">
                  <AlertTriangle className="w-3 h-3 text-orange-400 animate-pulse shrink-0" />
                  <span>¡Compañero hackeando!</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ==================================================== */}
      {/* 2. ESCRITORIO (>= 640px): WIDGET DOCK LATERAL IZQ   */}
      {/* ==================================================== */}
      <div className="hidden sm:block w-56 bg-slate-950/80 backdrop-blur-sm border border-amber-500/40 rounded-lg p-2 shadow-xl shadow-amber-950/20">
        {/* Fila superior: 👑 COFRE [X/3] • Cerrojos (X/6) */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-mono font-semibold text-amber-400 truncate">
              COFRE [{currentChestIndex}/{totalChests}]
            </span>
          </div>
          <span className="text-xs font-mono font-semibold text-amber-400 shrink-0">
            Cerrojos ({totalCompleted}/6)
          </span>
        </div>

        {/* Fila de mini cerrojos */}
        <div className="flex items-center gap-1 mb-1.5">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isDone = idx < totalCompleted;
            const isCurrent = idx === totalCompleted;
            return (
              <div
                key={idx}
                className={`flex-1 h-3 rounded text-[8px] font-mono font-black flex items-center justify-center border ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-300 text-black shadow-sm'
                    : isCurrent
                    ? 'bg-amber-500 border-amber-300 text-black animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                {isDone ? '✓' : idx + 1}
              </div>
            );
          })}
        </div>

        {/* Barra delgada de 4px (h-1) */}
        <div className="w-full h-1 bg-amber-500/30 rounded overflow-hidden mb-1.5">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Estado / Acción según zona */}
        {totalCompleted >= 6 ? (
          <div className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/60 py-0.5 px-1.5 rounded border border-emerald-500/40 text-center">
            🎉 ¡DESENCRIPTADO!
          </div>
        ) : isInChestZone ? (
          isMonsterBlocking ? (
            <div className="flex items-center gap-1 text-[9px] font-mono text-red-300 bg-red-950/60 p-1 rounded border border-red-500/40 animate-pulse">
              <ShieldAlert className="w-3 h-3 text-red-400 shrink-0" />
              <span className="truncate">MONSTRUO DEFENDIENDO</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenChestModal}
              className="w-full py-1 px-2 rounded-lg font-mono font-black text-[10px] uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow border border-yellow-200 flex items-center justify-center gap-1 active:scale-95 transition-all"
            >
              <KeyRound className="w-3 h-3" />
              <span>DESENCRIPTAR FASE {currentPhase}</span>
            </button>
          )
        ) : (
          <div className="text-[9px] font-mono text-slate-400 text-center truncate">
            {phaseNames[currentPhase] || `Fase ${currentPhase}`}
          </div>
        )}

        {isChestInteracted && (
          <div className="flex items-center gap-1 text-[8px] font-mono text-orange-400 bg-orange-950/40 px-1 py-0.5 rounded border border-orange-500/30 mt-1">
            <AlertTriangle className="w-2.5 h-2.5 text-orange-400 animate-pulse shrink-0" />
            <span className="truncate">¡Compañero hackeando!</span>
          </div>
        )}
      </div>
    </div>
  );
};
