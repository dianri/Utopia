import React, { useState, useEffect, useRef } from 'react';
import type { Player, Pet, PlayerStatus } from '../../types/game';
import { soundEffects } from '../../services/soundEffects';
import {
  HeartPulse,
  Shield,
  Heart,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  Activity,
} from 'lucide-react';

interface HospitalModalProps {
  isOpen: boolean;
  myPlayer?: Player;
  player?: Player;
  onClose: () => void;
  onHealTick?: (
    newHp: number,
    newStatus: PlayerStatus,
    isCriticallyWounded: boolean,
    newPets: Pet[]
  ) => void;
  onDischargeComplete?: (
    finalHp: number,
    finalStatus: PlayerStatus,
    finalPets: Pet[]
  ) => void;
  onUpdatePlayer?: (player: Player | ((prev: Player | null) => Player | null)) => void;
  onUpdatePets?: (pets: Pet[]) => void;
  onAddLog?: (message: string, type?: 'info' | 'combat' | 'warning' | 'loot') => void;
}

interface FloatingHeal {
  id: number;
  text: string;
  isPet?: boolean;
}

export const HospitalModal: React.FC<HospitalModalProps> = ({
  isOpen,
  myPlayer,
  player,
  onClose,
  onHealTick,
  onDischargeComplete,
  onUpdatePlayer,
  onUpdatePets,
  onAddLog,
}) => {
  const activePlayer = player || myPlayer;
  const handleExitHospital = onClose;

  // Estado local para animación continua e interpolación
  const [currentHp, setCurrentHp] = useState<number>(activePlayer?.hp ?? 100);
  const [currentStatus, setCurrentStatus] = useState<PlayerStatus>(activePlayer?.status || 'active');
  const [isWounded, setIsWounded] = useState<boolean>(
    Boolean(activePlayer?.isCriticallyWounded || activePlayer?.status === 'critically_wounded')
  );
  const [pets, setPets] = useState<Pet[]>(activePlayer?.pets || []);
  const [floatingHeals, setFloatingHeals] = useState<FloatingHeal[]>([]);
  const [pulseVignette, setPulseVignette] = useState<boolean>(false);
  const [justRecoveredPetIds, setJustRecoveredPetIds] = useState<string[]>([]);
  const [isDischarged, setIsDischarged] = useState<boolean>(false);

  // Referencias mutables para el bucle de curación por segundo
  const activePlayerRef = useRef<Player | undefined>(activePlayer);
  activePlayerRef.current = activePlayer;

  const currentHpRef = useRef<number>(currentHp);
  currentHpRef.current = currentHp;

  const currentStatusRef = useRef<PlayerStatus>(currentStatus);
  currentStatusRef.current = currentStatus;

  const isWoundedRef = useRef<boolean>(isWounded);
  isWoundedRef.current = isWounded;

  const petsRef = useRef<Pet[]>(pets);
  petsRef.current = pets;

  const onHealTickRef = useRef(onHealTick);
  onHealTickRef.current = onHealTick;

  const onDischargeCompleteRef = useRef(onDischargeComplete);
  onDischargeCompleteRef.current = onDischargeComplete;

  const onUpdatePlayerRef = useRef(onUpdatePlayer);
  onUpdatePlayerRef.current = onUpdatePlayer;

  const onUpdatePetsRef = useRef(onUpdatePets);
  onUpdatePetsRef.current = onUpdatePets;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const onAddLogRef = useRef(onAddLog);
  onAddLogRef.current = onAddLog;

  const isDischargedRef = useRef<boolean>(isDischarged);
  isDischargedRef.current = isDischarged;

  // Sincronizar props entrantes si cambian externamente o cuando se abre el modal
  useEffect(() => {
    if (!activePlayer) return;
    setCurrentHp(activePlayer.hp);
    setCurrentStatus(activePlayer.status || 'active');
    setIsWounded(Boolean(activePlayer.isCriticallyWounded || activePlayer.status === 'critically_wounded'));
    setPets(activePlayer.pets || []);
    if (isOpen) {
      setIsDischarged(false);
      isDischargedRef.current = false;
      setJustRecoveredPetIds([]);
    }
  }, [isOpen, activePlayer?.hp, activePlayer?.status, activePlayer?.isCriticallyWounded, activePlayer?.pets]);

  // ==========================================
  // CICLO DE REGENERACIÓN PROGRESIVA (TICKS MÉDICOS)
  // Cada 1s: +15 HP al jugador, +20 HP a mascotas dañadas/caídas
  // ==========================================
  useEffect(() => {
    if (!isOpen || !activePlayerRef.current) return;

    // Resetear explícitamente bandera de alta médica al abrir
    setIsDischarged(false);
    isDischargedRef.current = false;

    // Tick inicial inmediato de feedback de entrada
    soundEffects.playHeartbeat();
    soundEffects.playMedicalTick();

    const interval = window.setInterval(() => {
      if (isDischargedRef.current) return;

      const p = activePlayerRef.current;
      if (!p) return;

      const prevHp = currentHpRef.current;
      const maxHp = p.maxHp || 100;
      const prevWounded = isWoundedRef.current;
      const prevStatus = currentStatusRef.current;

      // 1. Curación del jugador (+15 HP/s)
      const nextHp = Math.min(maxHp, prevHp + 15);
      const healedPlayerAmount = nextHp - prevHp;
      const nowCured = prevWounded && nextHp >= 20;
      const nextWounded = nowCured ? false : prevWounded;
      const nextStatus = nowCured ? 'active' : prevStatus;

      // 2. Curación de mascotas (+20 HP/s)
      const prevPets = petsRef.current;
      const newlyRecoveredIds: string[] = [];
      let anyPetHealed = false;

      const nextPets = prevPets.map((pet) => {
        const petMaxHp = pet.maxHp || 100;
        const needsHealing = pet.hp < petMaxHp || pet.isWounded;

        if (needsHealing) {
          anyPetHealed = true;
          const updatedHp = Math.min(petMaxHp, pet.hp + 20);
          const isFullyRevived = updatedHp >= petMaxHp;
          if (isFullyRevived && pet.isWounded) {
            newlyRecoveredIds.push(pet.id);
          }
          return {
            ...pet,
            hp: updatedHp,
            isWounded: isFullyRevived ? false : pet.isWounded,
          };
        }
        return pet;
      });

      // 3. Audio & Hápticos
      soundEffects.playHeartbeat();
      soundEffects.playMedicalTick();

      // 4. Efecto de viñeta pulsante
      setPulseVignette(true);
      window.setTimeout(() => setPulseVignette(false), 450);

      // 5. Números flotantes de regeneración
      const newFloating: FloatingHeal[] = [];
      if (healedPlayerAmount > 0) {
        newFloating.push({
          id: Date.now() + Math.random(),
          text: `+${healedPlayerAmount} HP`,
        });
      }
      if (anyPetHealed) {
        newFloating.push({
          id: Date.now() + 1 + Math.random(),
          text: `+20 HP ESCUADRA`,
          isPet: true,
        });
      }
      if (newFloating.length > 0) {
        setFloatingHeals((prev) => [...prev.slice(-4), ...newFloating]);
        window.setTimeout(() => {
          setFloatingHeals((prev) => prev.filter((item) => !newFloating.some((nf) => nf.id === item.id)));
        }, 1100);
      }

      // 6. Si alguna mascota revivió en este tick
      if (newlyRecoveredIds.length > 0) {
        setJustRecoveredPetIds((prev) => [...prev, ...newlyRecoveredIds]);
        onAddLogRef.current?.('¡Mascota reanimada y lista para combate en el Hospital!', 'info');
      }

      // 7. Notificación si el jugador salió del estado crítico
      if (nowCured) {
        onAddLogRef.current?.('¡Constantes estabilizadas! Has salido del estado crítico.', 'info');
      }

      // Actualizar estados locales
      setCurrentHp(nextHp);
      setCurrentStatus(nextStatus);
      setIsWounded(nextWounded);
      setPets(nextPets);

      // Propagar al padre para sincronizar en Supabase & Realtime
      onHealTickRef.current?.(nextHp, nextStatus, nextWounded, nextPets);
      onUpdatePlayerRef.current?.((prev) =>
        prev
          ? {
              ...prev,
              hp: nextHp,
              status: nextStatus,
              isCriticallyWounded: nextWounded,
              pets: nextPets,
            }
          : null
      );
      onUpdatePetsRef.current?.(nextPets);

      // 8. Comprobación de Alta Médica Automática (Salida Exitosa)
      const isPlayerFull = nextHp >= maxHp && !nextWounded;
      const arePetsFull = nextPets.every((pet) => !pet.isWounded && pet.hp >= (pet.maxHp || 100));

      if (isPlayerFull && arePetsFull && !isDischargedRef.current) {
        setIsDischarged(true);
        isDischargedRef.current = true;
        soundEffects.playMedicalSuccess();
        onAddLogRef.current?.('TRATAMIENTO COMPLETADO: ESCUADRA 100% OPERATIVA', 'info');

        // Cerrar automáticamente tras 1.5s devolviendo el control al mapa
        window.setTimeout(() => {
          onDischargeCompleteRef.current?.(nextHp, nextStatus, nextPets);
          onCloseRef.current();
        }, 1500);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen || !activePlayer) return null;

  const playerMaxHp = activePlayer.maxHp || 100;
  const playerHpPercent = Math.max(0, Math.min(100, Math.round((currentHp / playerMaxHp) * 100)));
  const alivePetsCount = pets.filter((p) => !p.isWounded && p.hp > 0).length;

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto flex flex-col items-center justify-between p-3 sm:p-6 bg-slate-950/95 backdrop-blur-md overflow-hidden select-none">
      {/* 1. RESPLANDOR / VIÑETA ESMERALDA PERIMETRAL AL RITMO DE LA CURACIÓN */}
      <div
        className={`fixed inset-0 pointer-events-none transition-all duration-700 ease-out z-10 ${
          pulseVignette
            ? 'opacity-80 scale-100 shadow-[inset_0_0_120px_rgba(16,185,129,0.35)]'
            : 'opacity-25 scale-105 shadow-[inset_0_0_60px_rgba(6,182,212,0.15)]'
        }`}
      />

      {/* Trama táctica de fondo tipo grid médico */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.04)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* 2. CABECERA TÁCTICA */}
      <div className="w-full mx-auto flex max-w-xl items-center justify-between gap-4 rounded-xl border border-emerald-500/50 bg-slate-950/90 p-3 shadow-[0_0_20px_rgba(16,185,129,0.2)] backdrop-blur-md z-20">
        {/* 1. Bloque Izquierdo: Icono + Información */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Icono médico contenido */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-400/60 bg-emerald-950/80 p-1 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
            <img src="/assets/icons/structures/structure-hospital.png" alt="Hospital" className="w-7 h-7 object-contain" />
          </div>

          {/* Textos informativos */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-xs font-bold font-mono tracking-wider text-emerald-300 uppercase sm:text-sm">
                UNIDAD MÉDICA AVANZADA
              </h3>
              <span className="hidden rounded border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 sm:inline-block">
                BAHÍA DE REGENERACIÓN
              </span>
            </div>
            <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-400/80">
              <span className="animate-pulse">📈</span>
              <span>SOPORTE VITAL EN CURSO (+15 HP/s)</span>
            </p>
          </div>
        </div>

        {/* 2. Bloque Derecho: Botón Salir */}
        <button
          type="button"
          onClick={handleExitHospital}
          disabled={isDischarged}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 shadow hover:border-red-500/60 hover:bg-red-950/40 hover:text-red-300 transition-all disabled:opacity-50"
        >
          <span className="text-xs">✕</span>
          <span className="text-center leading-tight">SALIR DE LA BAHÍA</span>
        </button>
      </div>

      {/* 3. PANEL CENTRAL: POD DE REGENERACIÓN DEL JUGADOR */}
      <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center my-auto z-20 relative py-2">
        {/* Números de curación flotantes */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
          {floatingHeals.map((item) => (
            <span
              key={item.id}
              className={`absolute font-mono font-black animate-bounce text-xl sm:text-2xl ${
                item.isPet
                  ? 'text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.9)] -translate-y-8'
                  : 'text-emerald-400 drop-shadow-[0_0_14px_rgba(16,185,129,0.95)] -translate-y-12'
              }`}
            >
              {item.text}
            </span>
          ))}
        </div>

        {/* Carta Central del Jugador (Estilo pod bio-médico militar) */}
        <div className="w-full rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-emerald-950/60 border-2 border-emerald-500/60 shadow-[0_0_40px_rgba(16,185,129,0.25)] relative overflow-hidden flex flex-col">
          {/* Cabecera del Pod */}
          <div className="px-4 py-2.5 bg-black/60 border-b border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/assets/icons/structures/hospital-pod.png" alt="Cápsula" className="w-5 h-5 object-contain" />
              <span className="font-mono font-black text-sm text-emerald-100 uppercase tracking-wider">
                PACIENTE: {activePlayer.nickname}
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-bold border border-emerald-600/50 uppercase">
              ROL: {activePlayer.role}
            </span>
          </div>

          {/* Avatar del Jugador con Halo Bio-regenerativo Esmeralda */}
          <div className="relative h-44 sm:h-52 w-full bg-gradient-to-b from-emerald-950/30 via-black/80 to-slate-950 flex flex-col items-center justify-center overflow-hidden">
            {/* Halo de bio-regeneración */}
            <div className="absolute w-36 h-36 rounded-full bg-emerald-500/10 blur-xl animate-pulse pointer-events-none" />
            <div className="relative flex items-center justify-center">
              {/* Anillos concéntricos de escáner bio-médico */}
              <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-dashed border-emerald-400/40 animate-spin [animation-duration:12s]" />
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-emerald-400/80 bg-slate-900/90 shadow-[0_0_30px_rgba(16,185,129,0.5)] flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <img
                  src={isWounded ? '/assets/icons/roles/player-wounded.png' : `/assets/icons/roles/role-${activePlayer.role}.png`}
                  alt={activePlayer.nickname}
                  className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow"
                />
                {isWounded && (
                  <span className="absolute bottom-1 text-[11px] font-mono font-bold text-red-400 animate-pulse">
                    CRÍTICO
                  </span>
                )}
              </div>
            </div>

            {/* Indicador de estado */}
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-emerald-500/40">
              {isWounded ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="text-[11px] font-mono font-black text-amber-300 uppercase tracking-wider animate-pulse">
                    REANIMANDO CONSTANTES VITALES...
                  </span>
                </>
              ) : currentHp < playerMaxHp ? (
                <>
                  <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-mono font-black text-emerald-300 uppercase tracking-wider">
                    ESTABILIZANDO CONSTANTES...
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-mono font-black text-emerald-300 uppercase tracking-wider">
                    SIGNOS VITALES AL 100%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Barra de Vida Animada de Gran Tamaño */}
          <div className="p-4 bg-slate-950/95 border-t border-emerald-500/30 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-emerald-400 animate-pulse" />
                VITALIDAD DEL SUJETO
              </span>
              <span className="text-white font-black">
                {currentHp} / {playerMaxHp} HP <span className="text-emerald-400 font-mono text-[11px]">(+15 HP/s)</span>
              </span>
            </div>

            <div className="w-full h-4 rounded-full bg-slate-900 overflow-hidden border border-emerald-500/50 p-0.5 shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-emerald-600 via-emerald-400 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                style={{ width: `${playerHpPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. BAHÍA MÉDICA DE MASCOTAS (REACTIVACIÓN DE ESCUDOS/VITALIDAD) */}
      <div className="w-full max-w-xl bg-slate-900/90 border-2 border-emerald-500/50 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-md z-20 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-cyan-300 font-bold flex items-center gap-1.5 uppercase">
            <Heart className="w-3.5 h-3.5 text-cyan-400" />
            BAHÍA DE MASCOTAS // REACTIVACIÓN DE ESCUDOS ({alivePetsCount}/{pets.length})
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">+20 HP/s</span>
        </div>

        {pets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
            {pets.map((pet) => {
              const petMaxHp = pet.maxHp || 100;
              const petHpPercent = Math.max(0, Math.min(100, Math.round((pet.hp / petMaxHp) * 100)));
              const isWoundedPet = pet.isWounded || pet.hp <= 0;
              const isJustRecovered = justRecoveredPetIds.includes(pet.id);

              return (
                <div
                  key={pet.id}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs font-mono transition-all duration-300 ${
                    isJustRecovered
                      ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.7)]'
                      : isWoundedPet
                      ? 'bg-amber-950/40 border-amber-500/50 shadow-inner'
                      : 'bg-slate-950/70 border-emerald-500/30'
                  }`}
                >
                  <div className="relative text-2xl shrink-0">
                    <span>{pet.icon}</span>
                    {isWoundedPet && !isJustRecovered && (
                      <span className="absolute -top-1 -right-1 text-xs animate-spin">💫</span>
                    )}
                    {isJustRecovered && (
                      <span className="absolute -top-1 -right-1 text-xs">✨</span>
                    )}
                  </div>

                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] gap-1">
                      <span className="font-bold text-white truncate">{pet.name}</span>
                      <span className="text-[10px] text-cyan-300 font-mono">
                        {pet.hp}/{petMaxHp} HP
                      </span>
                    </div>

                    {/* Estado descriptivo de la mascota */}
                    <div className="text-[9px] font-mono tracking-tight">
                      {isJustRecovered ? (
                        <span className="text-emerald-300 font-bold flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                          ¡REPARADA / LISTA PARA COMBATE!
                        </span>
                      ) : isWoundedPet ? (
                        <span className="text-amber-400 font-bold flex items-center gap-1 animate-pulse">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          DESFIBRILACIÓN BIO-MÉDICA...
                        </span>
                      ) : petHpPercent < 100 ? (
                        <span className="text-cyan-300">REACTIVANDO SISTEMAS...</span>
                      ) : (
                        <span className="text-emerald-400 font-bold">ESCUDO 100% OPERATIVO</span>
                      )}
                    </div>

                    {/* Barra de progreso de la mascota */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 border border-slate-700/60">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isJustRecovered || petHpPercent >= 100
                            ? 'bg-emerald-400'
                            : isWoundedPet
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-cyan-400'
                        }`}
                        style={{ width: `${petHpPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-[11px] font-mono text-slate-400">
            ESCÁNER DE APOYO: Sin mascotas acompañantes registradas en el pelotón.
          </div>
        )}
      </div>

      {/* 5. OVERLAY CENTRAL DE ALTA MÉDICA AUTOMÁTICA (TRATAMIENTO COMPLETADO) */}
      {isDischarged && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-slate-900 border-2 border-emerald-400 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(16,185,129,0.7)] flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center p-2 shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-pulse">
              <img src="/assets/icons/structures/structure-hospital.png" alt="Hospital" className="w-10 h-10 object-contain drop-shadow" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono font-black text-lg sm:text-xl text-emerald-300 tracking-wider">
                TRATAMIENTO COMPLETADO
              </span>
              <span className="font-mono font-bold text-xs sm:text-sm text-cyan-200 uppercase tracking-widest mt-1">
                ESCUADRA 100% OPERATIVA
              </span>
            </div>
            <p className="text-xs font-mono text-slate-300">
              Constantes vitales restauradas al máximo. Reincorporándose al terreno de operaciones...
            </p>
            <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-emerald-400 animate-[pulse_1s_infinite]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
