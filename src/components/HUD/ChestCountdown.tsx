import React, { useState } from 'react';
import { Crown, AlertTriangle, KeyRound, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';

interface ChestCountdownProps {
  currentPhase: number; // 1, 2, 3
  currentStep: number;  // 0, 1
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
  isInChestZone,
  isMonsterInChestZone = false,
  isMonsterDefending,
  isMonsterAlive = true,
  isChestInteracted,
  onOpenChestModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isMonsterBlocking =
    (typeof isMonsterDefending === 'boolean' ? isMonsterDefending : isMonsterInChestZone) &&
    isMonsterAlive;

  const totalCompleted = (currentPhase - 1) * 2 + currentStep;
  const percent = Math.min(100, Math.round((totalCompleted / 6) * 100));

  const phaseNames: Record<number, string> = {
    1: 'Fase 1: Frecuencia Temporal (QTE)',
    2: 'Fase 2: Código Encriptado (Simón)',
    3: 'Fase 3: Sintonizador de Núcleo (Dial)',
  };

  // VISTA PLEGADA / MINIMIZADA (Para despejar el mapa en móvil)
  if (isCollapsed) {
    return (
      <div className="w-full pointer-events-auto animate-fade-in">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="w-full bg-slate-950/90 border border-amber-500/70 hover:border-amber-400 backdrop-blur-md px-2.5 py-1 rounded-xl shadow-lg flex items-center justify-between text-left active:scale-95 transition-all group"
          title="Toca para desplegar detalles del cofre"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-mono font-bold text-amber-300 truncate">
              COFRE {totalCompleted}/6
            </span>
            {isInChestZone && (
              <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-950/80 px-1 rounded border border-emerald-500/50">
                EN RANGO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-amber-500/40">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-400"
                style={{ width: `${percent}%` }}
              />
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full pointer-events-auto animate-fade-in">
      <div className="bg-slate-950/95 border-2 border-amber-500/80 backdrop-blur-md p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-2xl shadow-amber-500/30 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <div
            className="flex items-center gap-1.5 sm:gap-2 min-w-0 cursor-pointer"
            onClick={() => setIsCollapsed(true)}
            title="Toca para minimizar"
          >
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 shrink-0">
              <Crown className="w-3.5 h-3.5 sm:w-5 sm:h-5 animate-bounce" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sm:text-xs font-mono font-black text-amber-300 tracking-wider uppercase truncate">
                  <span className="sm:hidden">COFRE</span>
                  <span className="hidden sm:inline">COFRE DEL TESORO (VICTORIA)</span>
                </span>
                <span className="text-[9px] font-mono font-bold text-amber-400 sm:hidden">
                  {totalCompleted}/6
                </span>
              </div>
              <span className="hidden sm:block text-[9px] sm:text-[10px] font-mono text-slate-300 truncate">
                {phaseNames[currentPhase] || `Fase ${currentPhase}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-0.5 sm:gap-1">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isDone = idx < totalCompleted;
                const isCurrent = idx === totalCompleted;
                return (
                  <div
                    key={idx}
                    className={`w-3 h-3 sm:w-4 sm:h-4 rounded text-[7px] sm:text-[9px] font-mono font-black flex items-center justify-center border ${
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
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="text-slate-400 hover:text-white p-0.5 -mr-0.5 rounded transition-colors"
              title="Minimizar tarjeta"
              aria-label="Minimizar tarjeta de cofre"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* BARRA DE PROGRESO DE DESENCRIPTACIÓN */}
        <div className="w-full h-1.5 sm:h-2.5 bg-slate-900 border border-amber-500/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* ACCIÓN SEGÚN UBICACIÓN DEL JUGADOR Y DEL MONSTRUO */}
        {totalCompleted >= 6 ? (
          <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-xs font-mono font-black text-emerald-300 bg-emerald-950/80 p-1.5 sm:p-2 rounded-xl border border-emerald-400 shadow-md">
            <span>🎉 ¡COFRE DESENCRIPTADO (6/6)!</span>
          </div>
        ) : isInChestZone ? (
          isMonsterBlocking ? (
            <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono text-red-300 bg-red-950/70 p-1 sm:p-1.5 rounded border border-red-500/50 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="truncate sm:whitespace-normal">¡MONSTRUO DEFENDIENDO EL COFRE!</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenChestModal}
              className="w-full py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl font-mono font-black text-[10px] sm:text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow-md shadow-amber-500/40 border border-yellow-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>DESENCRIPTAR (FASE {currentPhase})</span>
            </button>
          )
        ) : (
          <div className="hidden sm:flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
            <span>Dirígete al cofre en el mapa para hackearlo</span>
            <span className="text-amber-400 font-bold">{totalCompleted}/6 cerrojos</span>
          </div>
        )}

        {isChestInteracted && (
          <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-mono text-orange-400 bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-500/30">
            <AlertTriangle className="w-3 h-3 text-orange-400 animate-pulse shrink-0" />
            <span className="truncate">¡Compañero hackeando! Monstruo en camino.</span>
          </div>
        )}
      </div>
    </div>
  );
};
