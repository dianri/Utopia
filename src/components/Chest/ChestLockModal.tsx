import React, { useState, useEffect, useRef, useCallback } from 'react';
import { soundEffects } from '../../services/soundEffects';
import { KeyRound, ShieldAlert, CheckCircle2, Lock, Unlock, RotateCw, AlertTriangle, X } from 'lucide-react';

interface ChestLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhase: number; // 1, 2, 3
  currentStep: number;  // 0, 1
  currentChestIndex?: number;
  totalChests?: number;
  onStepSuccess: (nextPhase: number, nextStep: number) => void;
  onVictory: () => void;
  distToMonster: number;
  isMonsterAlive?: boolean;
}

export const ChestLockModal: React.FC<ChestLockModalProps> = ({
  isOpen,
  onClose,
  currentPhase,
  currentStep,
  currentChestIndex = 1,
  totalChests = 3,
  onStepSuccess,
  onVictory,
  distToMonster,
  isMonsterAlive = true,
}) => {
  // Estado local para mensajes de acierto/fallo
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'fail'>('idle');
  const [isVictorious, setIsVictorious] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setIsVictorious(false);
    }
  }, [isOpen]);

  // ==========================================
  // FASE 1: CERRADURA DE TIEMPO / QTE OSCILANTE
  // ==========================================
  const [qteCursorPos, setQteCursorPos] = useState<number>(0);
  const qteDirectionRef = useRef<number>(1);
  const qteTargetRange = useRef<{ min: number; max: number }>({ min: 38, max: 62 });

  useEffect(() => {
    if (!isOpen || currentPhase !== 1) return;

    let animId: number;
    let lastT = performance.now();

    const loop = (t: number) => {
      const dt = t - lastT;
      lastT = t;

      setQteCursorPos((prev) => {
        const speed = 0.08; // Velocidad de oscilación
        let next = prev + qteDirectionRef.current * speed * dt;
        if (next >= 100) {
          next = 100;
          qteDirectionRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          qteDirectionRef.current = 1;
        }
        return next;
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, currentPhase]);

  const handleQteClick = useCallback(() => {
    const { min, max } = qteTargetRange.current;
    if (qteCursorPos >= min && qteCursorPos <= max) {
      // ¡Éxito!
      setFeedback('success');
      soundEffects.playCrateLoot();
      soundEffects.vibrate([60, 40, 80]);

      setTimeout(() => {
        setFeedback('idle');
        if (currentStep === 0) {
          onStepSuccess(1, 1);
        } else {
          onStepSuccess(2, 0); // Pasa a Fase 2
        }
      }, 500);
    } else {
      // Fallo
      setFeedback('fail');
      soundEffects.playAlarm();
      soundEffects.vibrate(150);
      setTimeout(() => setFeedback('idle'), 600);
    }
  }, [qteCursorPos, currentStep, onStepSuccess]);

  // ==========================================
  // FASE 2: CERRADURA DE CÓDIGO (SIMÓN DICE)
  // ==========================================
  const LIGHT_COLORS = ['cyan', 'emerald', 'amber', 'purple'] as const;
  type LightColor = typeof LIGHT_COLORS[number];

  const [sequence, setSequence] = useState<LightColor[]>([]);
  const [userSequenceIndex, setUserSequenceIndex] = useState<number>(0);
  const [activeFlashingLight, setActiveFlashingLight] = useState<LightColor | null>(null);
  const [isShowingSequence, setIsShowingSequence] = useState<boolean>(false);

  const userFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingInputRef = useRef<boolean>(false);

  // Limpiar temporizadores al desmontar
  useEffect(() => {
    return () => {
      if (userFlashTimeoutRef.current) clearTimeout(userFlashTimeoutRef.current);
      if (sequenceIntervalRef.current) clearInterval(sequenceIntervalRef.current);
    };
  }, []);

  // Iniciar o reiniciar secuencia al entrar en Fase 2 o nuevo paso
  useEffect(() => {
    if (!isOpen || currentPhase !== 2) return;

    if (sequenceIntervalRef.current) {
      clearInterval(sequenceIntervalRef.current);
      sequenceIntervalRef.current = null;
    }
    if (userFlashTimeoutRef.current) {
      clearTimeout(userFlashTimeoutRef.current);
      userFlashTimeoutRef.current = null;
    }

    const seqLength = currentStep === 0 ? 3 : 4;
    const newSeq: LightColor[] = [];
    for (let i = 0; i < seqLength; i++) {
      newSeq.push(LIGHT_COLORS[Math.floor(Math.random() * LIGHT_COLORS.length)]);
    }
    setSequence(newSeq);
    setUserSequenceIndex(0);
    setIsShowingSequence(true);
    isProcessingInputRef.current = false;

    // Reproducir secuencia
    let stepIndex = 0;
    sequenceIntervalRef.current = setInterval(() => {
      if (stepIndex < newSeq.length) {
        const color = newSeq[stepIndex];
        setActiveFlashingLight(color);
        soundEffects.playColorTone(color);
        soundEffects.vibrate(40);
        setTimeout(() => setActiveFlashingLight(null), 450);
        stepIndex++;
      } else {
        if (sequenceIntervalRef.current) {
          clearInterval(sequenceIntervalRef.current);
          sequenceIntervalRef.current = null;
        }
        setIsShowingSequence(false);
      }
    }, 750);

    return () => {
      if (sequenceIntervalRef.current) {
        clearInterval(sequenceIntervalRef.current);
        sequenceIntervalRef.current = null;
      }
    };
  }, [isOpen, currentPhase, currentStep]);

  const handleLightPress = (color: LightColor) => {
    if (isShowingSequence || feedback !== 'idle' || isProcessingInputRef.current) return;

    // 1. Activar iluminación visual inmediata
    setActiveFlashingLight(color);

    // 2. Reproducir el tono sonoro correspondiente al botón
    soundEffects.playColorTone(color);

    // 3. Apagar la iluminación tras un pulso breve táctico (200ms)
    if (userFlashTimeoutRef.current) {
      clearTimeout(userFlashTimeoutRef.current);
    }
    userFlashTimeoutRef.current = setTimeout(() => {
      setActiveFlashingLight(null);
      userFlashTimeoutRef.current = null;
    }, 200);

    // 4. Procesar la validación de la secuencia del jugador
    if (color === sequence[userSequenceIndex]) {
      const nextIdx = userSequenceIndex + 1;
      if (nextIdx >= sequence.length) {
        // Bloquear nuevos toques mientras se resuelve el cerrojo
        isProcessingInputRef.current = true;
        // Breve retardo para que el jugador aprecie la iluminación del último botón
        setTimeout(() => {
          setFeedback('success');
          soundEffects.playCrateLoot();
          soundEffects.vibrate([60, 40, 80]);

          setTimeout(() => {
            setFeedback('idle');
            isProcessingInputRef.current = false;
            if (currentStep === 0) {
              onStepSuccess(2, 1);
            } else {
              onStepSuccess(3, 0); // Pasa a Fase 3
            }
          }, 600);
        }, 220);
      } else {
        setUserSequenceIndex(nextIdx);
      }
    } else {
      // Error en la secuencia
      isProcessingInputRef.current = true;
      setTimeout(() => {
        setFeedback('fail');
        soundEffects.playAlarm();
        soundEffects.vibrate(200);

        setTimeout(() => {
          setFeedback('idle');
          setUserSequenceIndex(0);
          // Volver a mostrar secuencia
          setIsShowingSequence(true);
          let stepIndex = 0;
          if (sequenceIntervalRef.current) clearInterval(sequenceIntervalRef.current);
          sequenceIntervalRef.current = setInterval(() => {
            if (stepIndex < sequence.length) {
              const c = sequence[stepIndex];
              setActiveFlashingLight(c);
              soundEffects.playColorTone(c);
              setTimeout(() => setActiveFlashingLight(null), 450);
              stepIndex++;
            } else {
              if (sequenceIntervalRef.current) {
                clearInterval(sequenceIntervalRef.current);
                sequenceIntervalRef.current = null;
              }
              setIsShowingSequence(false);
              isProcessingInputRef.current = false;
            }
          }, 750);
        }, 700);
      }, 220);
    }
  };

  // ==========================================
  // FASE 3: DIAL DE PRECISIÓN (CERRADURA ROTATORIA)
  // ==========================================
  const [dialValue, setDialValue] = useState<number>(50);
  const dialSweetSpotRef = useRef<number>(Math.floor(Math.random() * 70) + 15);

  useEffect(() => {
    if (currentPhase === 3) {
      dialSweetSpotRef.current = Math.floor(Math.random() * 70) + 15;
      setDialValue(50);
    }
  }, [currentPhase, currentStep]);

  const diffFromSweetSpot = Math.abs(dialValue - dialSweetSpotRef.current);
  const isInSweetSpot = diffFromSweetSpot <= 4;
  const isNearSweetSpot = diffFromSweetSpot <= 12;

  const handleConfirmDial = () => {
    if (isInSweetSpot) {
      setFeedback('success');
      soundEffects.playCrateLoot();
      soundEffects.vibrate([80, 50, 120]);

      if (currentStep === 0) {
        setTimeout(() => {
          setFeedback('idle');
          onStepSuccess(3, 1);
        }, 700);
      } else {
        // ¡PASO 6 COMPLETADO / SEXTO CERROJO RESUELTO!
        setIsVictorious(true);
        setTimeout(() => {
          setFeedback('idle');
          onVictory();
        }, 700);
      }
    } else {
      setFeedback('fail');
      soundEffects.playAlarm();
      soundEffects.vibrate(150);
      setTimeout(() => setFeedback('idle'), 600);
    }
  };

  if (!isOpen) return null;

  const totalLocksCompleted = isVictorious ? 6 : (currentPhase - 1) * 2 + currentStep;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md select-none">
      <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* AVISO DE PROXIMIDAD DEL MONSTRUO */}
        {isMonsterAlive && distToMonster <= 45 && (
          <div className="bg-red-950/90 border-b border-red-500 px-3 py-1.5 flex items-center justify-between text-red-200 animate-pulse text-xs font-mono font-black">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              ¡MONSTRUO ACERCÁNDOSE A DEFENDER EL COFRE!
            </span>
            <span className="bg-red-900/80 px-2 py-0.5 rounded text-white border border-red-500">
              {Math.round(distToMonster)}m
            </span>
          </div>
        )}

        {/* CABECERA: COFRE Y PROGRESO COOPERATIVO */}
        <div className="p-4 bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/70 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/60 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono font-black text-sm text-white uppercase tracking-wider">
                Desencriptando Cofre [{currentChestIndex}/{totalChests}]
              </span>
              <span className="text-[11px] font-mono text-amber-400">
                {isVictorious
                  ? (currentChestIndex >= totalChests ? '¡Fase Final Superada (6/6)!' : '¡Cofre Descifrado (6/6)!')
                  : `Fase ${currentPhase} de 3 • Cerrojo ${currentStep + 1}/2`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* INDICADOR DE PASOS COOPERATIVOS (6 CERROJOS) */}
        <div className="px-4 py-2.5 bg-black/40 border-b border-slate-800 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold text-slate-300">
            PROGRESO DE ESCUADRA:
          </span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isDone = idx < totalLocksCompleted;
              const isCurrent = idx === totalLocksCompleted;
              return (
                <div
                  key={idx}
                  className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[10px] font-black border transition-all ${
                    isDone
                      ? 'bg-emerald-500 border-emerald-300 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                      : isCurrent
                      ? 'bg-amber-500/30 border-amber-400 text-amber-300 animate-pulse'
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* CUERPO DEL MINIJUEGO ACTIVO SEGÚN LA FASE */}
        <div className="p-5 flex flex-col items-center justify-center min-h-[220px]">
          
          {/* ================================================= */}
          {/* FASE 1: QTE DE BARRA OSCILANTE */}
          {/* ================================================= */}
          {currentPhase === 1 && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className="text-center">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block">
                  Fase 1: Cerrojo de Frecuencia Temporal
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Pulsa cuando el cursor móvil caiga dentro de la zona verde
                </span>
              </div>

              {/* Barra de QTE */}
              <div className="w-full h-8 bg-slate-950 rounded-xl border border-slate-700 relative overflow-hidden p-1 shadow-inner">
                {/* Zona objetivo (verde) */}
                <div
                  className="absolute top-1 bottom-1 bg-emerald-500/40 border-x-2 border-emerald-400 rounded-sm"
                  style={{
                    left: `${qteTargetRange.current.min}%`,
                    width: `${qteTargetRange.current.max - qteTargetRange.current.min}%`,
                  }}
                />

                {/* Cursor móvil */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-2 bg-white rounded shadow-[0_0_10px_#fff]"
                  style={{ left: `${qteCursorPos}%` }}
                />
              </div>

              <button
                type="button"
                onClick={handleQteClick}
                className="w-full py-3.5 rounded-xl font-mono font-black text-sm uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/50 active:scale-95 transition-all"
              >
                ¡DESACTIVAR PERNO!
              </button>
            </div>
          )}

          {/* ================================================= */}
          {/* FASE 2: SIMÓN DICE / LUCES TÁCTICAS */}
          {/* ================================================= */}
          {currentPhase === 2 && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className="text-center">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block">
                  Fase 2: Cerradura de Código Encriptado
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {isShowingSequence
                    ? '¡Memoriza la secuencia de luces!'
                    : `Tu turno: Pulsa en orden (${userSequenceIndex}/${sequence.length})`}
                </span>
              </div>

              {/* Panel de 4 luces tácticas */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-[240px]">
                {LIGHT_COLORS.map((col) => {
                  const isFlashing = activeFlashingLight === col;
                  const colorStyles: Record<LightColor, { base: string; active: string }> = {
                    cyan: {
                      base: 'bg-cyan-950/60 border-cyan-700 text-cyan-400',
                      active: 'bg-cyan-400 border-white text-black shadow-[0_0_25px_#22d3ee] scale-105 brightness-125 ring-2 ring-cyan-200',
                    },
                    emerald: {
                      base: 'bg-emerald-950/60 border-emerald-700 text-emerald-400',
                      active: 'bg-emerald-400 border-white text-black shadow-[0_0_25px_#34d399] scale-105 brightness-125 ring-2 ring-emerald-200',
                    },
                    amber: {
                      base: 'bg-amber-950/60 border-amber-700 text-amber-400',
                      active: 'bg-amber-400 border-white text-black shadow-[0_0_25px_#fbbf24] scale-105 brightness-125 ring-2 ring-amber-200',
                    },
                    purple: {
                      base: 'bg-purple-950/60 border-purple-700 text-purple-400',
                      active: 'bg-purple-400 border-white text-black shadow-[0_0_25px_#c084fc] scale-105 brightness-125 ring-2 ring-purple-200',
                    },
                  };

                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={isShowingSequence}
                      onClick={() => handleLightPress(col)}
                      className={`h-16 rounded-xl border-2 font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center transition-all duration-100 ${
                        isFlashing ? colorStyles[col].active : colorStyles[col].base
                      } ${!isShowingSequence ? 'hover:brightness-125 active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================= */}
          {/* FASE 3: DIAL DE PRECISIÓN */}
          {/* ================================================= */}
          {currentPhase === 3 && (
            <div className="w-full flex flex-col items-center gap-4">
              <div className="text-center">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider block">
                  Fase 3: Sintonizador de Núcleo Magnético
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Gira el dial hasta encontrar la frecuencia verde exacta
                </span>
              </div>

              {/* Rueda / Dial Táctico */}
              <div className="flex flex-col items-center gap-3 w-full">
                <div
                  className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all shadow-xl ${
                    isInSweetSpot
                      ? 'border-emerald-400 bg-emerald-950/70 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.7)] scale-105'
                      : isNearSweetSpot
                      ? 'border-amber-400 bg-amber-950/60 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                      : 'border-slate-700 bg-slate-950 text-slate-500'
                  }`}
                >
                  <RotateCw className={`w-8 h-8 ${isInSweetSpot ? 'animate-spin' : ''}`} />
                </div>

                <div className="w-full flex flex-col gap-1.5 px-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dialValue}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDialValue(val);
                      if (Math.abs(val - dialSweetSpotRef.current) <= 4) {
                        soundEffects.vibrate(20);
                      }
                    }}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>0°</span>
                    <span className={isInSweetSpot ? 'text-emerald-400 font-bold' : ''}>
                      {isInSweetSpot ? '¡FRECUENCIA ALINEADA!' : isNearSweetSpot ? 'SEÑAL CERCANA' : 'BUSCANDO SEÑAL'}
                    </span>
                    <span>100°</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmDial}
                  className={`w-full py-3.5 rounded-xl font-mono font-black text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 ${
                    isInSweetSpot
                      ? 'bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-emerald-900/50 border border-emerald-400'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                  }`}
                >
                  CONFIRMAR FRECUENCIA
                </button>
              </div>
            </div>
          )}

          {/* FEEDBACK OVERLAY (ÉXITO O ERROR) */}
          {feedback !== 'idle' && (
            <div
              className={`absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-150 ${
                feedback === 'success' ? 'bg-emerald-950/80 text-emerald-300' : 'bg-red-950/80 text-red-300'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {feedback === 'success' ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                    <span className="font-mono font-black text-base uppercase tracking-wider text-center">
                      {isVictorious
                        ? (currentChestIndex >= totalChests ? '¡TESORO ASEGURADO! ¡MISIÓN CUMPLIDA!' : `¡COFRE [${currentChestIndex}/${totalChests}] DESCIFRADO!`)
                        : '¡CERROJO SUPERADO!'}
                    </span>
                    {isVictorious && (
                      <span className="text-xs font-mono text-emerald-200">
                        {currentChestIndex >= totalChests
                          ? 'Cerrojos 6/6 completados • Abriendo cofre final...'
                          : 'Cerrojos 6/6 completados • Desplegando siguiente cofre...'}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-12 h-12 text-red-400 animate-pulse" />
                    <span className="font-mono font-black text-base uppercase tracking-wider">
                      ¡ERROR DE SINCRONIZACIÓN!
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
