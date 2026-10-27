import React from 'react';
import { Crown, AlertTriangle, KeyRound, Lock, Unlock, ShieldAlert } from 'lucide-react';

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

  return (
    <div className="w-full pointer-events-auto animate-fade-in">
      <div className="bg-slate-950/95 border-2 border-amber-500/80 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-2xl shadow-amber-500/30 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 shrink-0">
              <Crown className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-xs font-mono font-black text-amber-300 tracking-wider uppercase truncate">
                COFRE DEL TESORO (VICTORIA)
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-slate-300 truncate">
                {phaseNames[currentPhase] || `Fase ${currentPhase}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isDone = idx < totalCompleted;
              const isCurrent = idx === totalCompleted;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded text-[9px] font-mono font-black flex items-center justify-center border ${
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
        </div>

        {/* BARRA DE PROGRESO DE DESENCRIPTACIÓN */}
        <div className="w-full h-2.5 bg-slate-900 border border-amber-500/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-yellow-400 to-emerald-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* ACCIÓN SEGÚN UBICACIÓN DEL JUGADOR Y DEL MONSTRUO */}
        {isInChestZone ? (
          isMonsterBlocking ? (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-red-300 bg-red-950/70 p-1.5 rounded border border-red-500/50 animate-pulse">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>¡MONSTRUO DEFENDIENDO EL COFRE! Elimínalo o aléjalo para abrir.</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenChestModal}
              className="w-full py-2 px-3 rounded-xl font-mono font-black text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow-md shadow-amber-500/40 border border-yellow-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <KeyRound className="w-4 h-4" />
              <span>DESENCRIPTAR COFRE (FASE {currentPhase})</span>
            </button>
          )
        ) : (
          <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
            <span>Dirígete al cofre en el mapa para hackearlo</span>
            <span className="text-amber-400 font-bold">{totalCompleted}/6 cerrojos</span>
          </div>
        )}

        {isChestInteracted && (
          <div className="flex items-center gap-1 text-[9px] font-mono text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/30">
            <AlertTriangle className="w-3 h-3 text-orange-400 animate-pulse" />
            <span>¡Compañero hackeando! El monstruo cargará furioso al cofre.</span>
          </div>
        )}
      </div>
    </div>
  );
};
