import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Player, Weapon, Pet, Monster } from '../../types/game';
import { DEFAULT_WEAPONS_BY_ROLE, getModifiedWeaponStats, getWeaponIcon } from '../../services/combatEngine';
import { soundEffects } from '../../services/soundEffects';
import { usePvPCombat } from '../../hooks/usePvPCombat';
import { supabase } from '../../lib/supabase';
import { Swords, ShieldAlert, Crosshair, Zap, Shield, Skull, Heart, Footprints, AlertTriangle } from 'lucide-react';

interface PvPArenaProps {
  isOpen: boolean;
  combatId: string;
  myPlayer: Player;
  opponentPlayer: Player;
  queuedMonster?: Monster | null;
  isRoleSkillActive?: boolean;
  onPlayerDamaged: (newHp: number, attackerNickname: string) => void;
  onOpponentDamaged?: (newHp: number) => void;
  onPvPVictory: (opponent: Player) => void;
  onPvPDefeat: (opponent: Player) => void;
  onFlee: () => void;
  onClose: () => void;
}

interface PvPDamageItem {
  id: number;
  text?: string;
  label?: string;
  icon?: string;
  isCrit: boolean;
  isPet?: boolean;
  isIncoming?: boolean;
}

export const PvPArena: React.FC<PvPArenaProps> = ({
  isOpen,
  combatId,
  myPlayer,
  opponentPlayer,
  queuedMonster,
  isRoleSkillActive = false,
  onPlayerDamaged,
  onOpponentDamaged,
  onPvPVictory,
  onPvPDefeat,
  onFlee,
  onClose,
}) => {
  const [opponentHp, setOpponentHp] = useState<number>(opponentPlayer.hp || 100);
  const [myHp, setMyHp] = useState<number>(myPlayer.hp || 100);
  const [isAttacking, setIsAttacking] = useState<boolean>(false);
  const [screenShake, setScreenShake] = useState<boolean>(false);
  const [cardHitAnim, setCardHitAnim] = useState<boolean>(false);
  const [attackCooldown, setAttackCooldown] = useState<number>(0);
  const [duelOutcome, setDuelOutcome] = useState<'ongoing' | 'victory' | 'defeat' | 'fled'>('ongoing');
  const [damageNumbers, setDamageNumbers] = useState<PvPDamageItem[]>([]);

  const myPlayerRef = useRef<Player>(myPlayer);
  myPlayerRef.current = myPlayer;

  const opponentPlayerRef = useRef<Player>(opponentPlayer);
  opponentPlayerRef.current = opponentPlayer;

  const opponentHpRef = useRef<number>(opponentHp);
  opponentHpRef.current = opponentHp;

  const myHpRef = useRef<number>(myHp);
  myHpRef.current = myHp;

  const lastAttackTimeRef = useRef<number>(0);

  const equippedWeapon: Weapon = myPlayer.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[myPlayer.role];
  const weaponStats = getModifiedWeaponStats(equippedWeapon, myPlayer.role);
  const isMarksmanBoosted = isRoleSkillActive && myPlayer.role === 'marksman';
  const effectiveDamage = isMarksmanBoosted ? Math.round(weaponStats.damage * 1.25) : weaponStats.damage;

  // Sound upon entering arena
  useEffect(() => {
    if (isOpen) {
      soundEffects.playAlarm();
      soundEffects.vibrate([100, 50, 100]);
      setOpponentHp(opponentPlayer.hp || 100);
      setMyHp(myPlayer.hp || 100);
      setDuelOutcome('ongoing');
    }
  }, [isOpen, opponentPlayer.hp, myPlayer.hp]);

  // Hook de combate PvP sincronizado
  const { sendAttack, sendPetAttack, sendHpSync, sendDefeat, sendFlee, isConnected } = usePvPCombat({
    combatId,
    myPlayerId: myPlayer.id,
    isOpen,
    onReceiveAttack: (payload) => {
      if (duelOutcome !== 'ongoing') return;
      const dmg = payload.damage;
      const nextHp = Math.max(0, myHpRef.current - dmg);
      setMyHp(nextHp);
      myHpRef.current = nextHp;

      // Animación de impacto recibido
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 300);

      // Sonido y vibración de daño
      soundEffects.playDefeat();
      soundEffects.vibrate([120, 80, 150]);

      // Número de daño flotante entrante
      const numId = Date.now() + Math.random();
      setDamageNumbers((prev) => [
        ...prev,
        { id: numId, label: `-${dmg}`, text: `-${dmg}`, isCrit: dmg > 25, isIncoming: true },
      ]);
      setTimeout(() => {
        setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
      }, 900);

      onPlayerDamaged(nextHp, opponentPlayerRef.current.nickname);

      if (nextHp <= 0) {
        setDuelOutcome('defeat');
        const winnerId = opponentPlayerRef.current.id;
        const loserId = myPlayerRef.current.id;
        sendDefeat(winnerId, loserId);

        // Persistir inmediatamente estado abatido en Supabase
        supabase
          .from('players')
          .update({
            hp: 0,
            status: 'critically_wounded',
          })
          .eq('id', loserId)
          .then();

        setTimeout(() => {
          onPvPDefeat(opponentPlayerRef.current);
        }, 1500);
      }
    },
    onReceivePetAttack: (payload) => {
      if (duelOutcome !== 'ongoing') return;
      const dmg = payload.damage;
      const nextHp = Math.max(0, myHpRef.current - dmg);
      setMyHp(nextHp);
      myHpRef.current = nextHp;

      soundEffects.vibrate(80);
      const cleanIcon = payload.petIcon ? payload.petIcon.replace(/^\/+/, '/') : '/assets/icons/pets/pet-dog.png';
      const petLabel = payload.petName ? `${payload.petName}: -${dmg} HP` : `-${dmg} HP`;
      const numId = Date.now() + Math.random();
      setDamageNumbers((prev) => [
        ...prev,
        {
          id: numId,
          icon: cleanIcon,
          label: petLabel,
          text: `🐾 ${petLabel}`,
          isCrit: false,
          isPet: true,
          isIncoming: true,
        },
      ]);
      setTimeout(() => {
        setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
      }, 900);

      onPlayerDamaged(nextHp, opponentPlayerRef.current.nickname);

      if (nextHp <= 0) {
        setDuelOutcome('defeat');
        const winnerId = opponentPlayerRef.current.id;
        const loserId = myPlayerRef.current.id;
        sendDefeat(winnerId, loserId);

        supabase
          .from('players')
          .update({
            hp: 0,
            status: 'critically_wounded',
          })
          .eq('id', loserId)
          .then();

        setTimeout(() => {
          onPvPDefeat(opponentPlayerRef.current);
        }, 1500);
      }
    },
    onReceiveHpSync: (payload) => {
      if (payload.playerId === opponentPlayerRef.current.id) {
        setOpponentHp(payload.hp);
        opponentHpRef.current = payload.hp;
        if (payload.hp <= 0 && duelOutcome === 'ongoing') {
          setDuelOutcome('victory');
          soundEffects.playVictoryFanfare();
          setTimeout(() => {
            onPvPVictory(opponentPlayerRef.current);
          }, 1800);
        }
      }
    },
    onOpponentDefeated: (payload) => {
      if (payload.winnerId === myPlayerRef.current.id) {
        setOpponentHp(0);
        opponentHpRef.current = 0;
        setDuelOutcome('victory');
        soundEffects.playVictoryFanfare();
        soundEffects.vibrate([150, 100, 200]);
        setTimeout(() => {
          onPvPVictory(opponentPlayerRef.current);
        }, 1800);
      }
    },
    onOpponentFlee: () => {
      setDuelOutcome('victory');
      soundEffects.playRadarPing();
      setTimeout(() => {
        onClose();
      }, 1500);
    },
  });

  const getRoleAvatar = (role?: string) => {
    switch (role) {
      case 'tank':
        return '/assets/icons/roles/role-tank.png';
      case 'scout':
        return '/assets/icons/roles/role-scout.png';
      case 'marksman':
        return '/assets/icons/roles/role-marksman.png';
      case 'medic':
        return '/assets/icons/roles/role-medic.png';
      default:
        return '/assets/icons/roles/role-scout.png';
    }
  };

  const isOpponentHit = cardHitAnim;

  // Manejador de ataque del jugador (pulsación sobre avatar central o botón inferior)
  const handleExecuteAttackOnOpponent = useCallback(() => {
    if (!isOpen || duelOutcome !== 'ongoing' || opponentHpRef.current <= 0) return;

    const now = Date.now();
    const fireInterval = equippedWeapon.cadenceMs || equippedWeapon.fireRateMs || 400;

    if (now - lastAttackTimeRef.current < fireInterval) {
      return;
    }

    lastAttackTimeRef.current = now;
    setIsAttacking(true);
    setCardHitAnim(true);
    setAttackCooldown(fireInterval);

    // Audio del arma
    const soundType = equippedWeapon.weaponType === 'knife' || equippedWeapon.weaponType === 'axe' || equippedWeapon.type === 'melee'
      ? 'melee'
      : (equippedWeapon.weaponType as any) || 'pistol';
    soundEffects.playGunshot(soundType);
    soundEffects.vibrate(50);

    const dmg = effectiveDamage;
    const nextOpponentHp = Math.max(0, opponentHpRef.current - dmg);
    setOpponentHp(nextOpponentHp);
    opponentHpRef.current = nextOpponentHp;

    // Daño flotante saliente
    const numId = Date.now() + Math.random();
    setDamageNumbers((prev) => [
      ...prev,
      { id: numId, label: `-${dmg}`, text: `-${dmg}`, isCrit: dmg > 25, isIncoming: false },
    ]);
    setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
    }, 900);

    // Emitir por Realtime
    sendAttack(dmg, equippedWeapon.id);
    onOpponentDamaged?.(nextOpponentHp);

    if (nextOpponentHp <= 0) {
      setDuelOutcome('victory');
      const winnerId = myPlayerRef.current.id;
      const loserId = opponentPlayerRef.current.id;
      sendDefeat(winnerId, loserId);

      // Persistir de forma atómica en Supabase para el oponente derrotado
      supabase
        .from('players')
        .update({
          hp: 0,
          status: 'critically_wounded',
        })
        .eq('id', loserId)
        .then();

      soundEffects.playVictoryFanfare();
      soundEffects.vibrate([150, 100, 200]);
      setTimeout(() => {
        onPvPVictory(opponentPlayerRef.current);
      }, 1800);
    }

    setTimeout(() => {
      setIsAttacking(false);
      setCardHitAnim(false);
    }, 200);
  }, [isOpen, duelOutcome, equippedWeapon, effectiveDamage, sendAttack, onOpponentDamaged, sendDefeat, onPvPVictory]);

  const handleAttack = handleExecuteAttackOnOpponent;

  // Barra de cooldown de ataque
  useEffect(() => {
    if (attackCooldown <= 0) return;
    const interval = setInterval(() => {
      setAttackCooldown((prev) => Math.max(0, prev - 40));
    }, 40);
    return () => clearInterval(interval);
  }, [attackCooldown]);

  // Ataque automático de mascotas activas
  useEffect(() => {
    if (!isOpen || duelOutcome !== 'ongoing' || opponentHpRef.current <= 0) return;

    const activePets = (myPlayer.pets || []).filter((p) => !p.isWounded && p.hp > 0);
    if (activePets.length === 0) return;

    const intervals = activePets.map((pet) => {
      return setInterval(() => {
        if (!isOpen || opponentHpRef.current <= 0) return;
        const dmg = pet.damage;
        const nextOpponentHp = Math.max(0, opponentHpRef.current - dmg);
        setOpponentHp(nextOpponentHp);
        opponentHpRef.current = nextOpponentHp;

        // Daño flotante de mascota
        const cleanIcon = pet.icon ? pet.icon.replace(/^\/+/, '/') : '/assets/icons/pets/pet-dog.png';
        const numId = Date.now() + Math.random();
        setDamageNumbers((prev) => [
          ...prev,
          {
            id: numId,
            icon: cleanIcon,
            label: `${pet.name}: -${dmg} HP`,
            text: `🐾 ${pet.name}: -${dmg} HP`,
            isCrit: false,
            isPet: true,
            isIncoming: false,
          },
        ]);
        setTimeout(() => {
          setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
        }, 900);

        sendPetAttack(dmg, pet.id, pet.name, cleanIcon);
        onOpponentDamaged?.(nextOpponentHp);

        if (nextOpponentHp <= 0) {
          setDuelOutcome('victory');
          const winnerId = myPlayerRef.current.id;
          const loserId = opponentPlayerRef.current.id;
          sendDefeat(winnerId, loserId);

          supabase
            .from('players')
            .update({
              hp: 0,
              status: 'critically_wounded',
            })
            .eq('id', loserId)
            .then();

          soundEffects.playVictoryFanfare();
          setTimeout(() => {
            onPvPVictory(opponentPlayerRef.current);
          }, 1800);
        }
      }, pet.attackIntervalMs || 2200);
    });

    return () => {
      intervals.forEach((id) => clearInterval(id));
    };
  }, [isOpen, duelOutcome, myPlayer.pets, sendPetAttack, onOpponentDamaged, sendDefeat, onPvPVictory]);

  const handleFlee = () => {
    sendFlee();
    setDuelOutcome('fled');
    soundEffects.vibrate(100);
    setTimeout(() => {
      onFlee();
    }, 300);
  };

  if (!isOpen) return null;

  const opponentMaxHp = opponentPlayer.maxHp || 100;
  const opponentHpPct = Math.max(0, Math.min(100, Math.round((opponentHp / opponentMaxHp) * 100)));
  const myMaxHp = myPlayer.maxHp || 100;
  const myHpPct = Math.max(0, Math.min(100, Math.round((myHp / myMaxHp) * 100)));

  return (
    <div
      role="dialog"
      aria-label="Arena de Combate PvP"
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md select-none ${
        screenShake ? 'animate-pulse' : ''
      }`}
    >
      <div className="relative w-full max-w-lg rounded-2xl border-2 border-red-500/60 bg-gradient-to-b from-gray-950 via-gray-900 to-black p-4 sm:p-6 shadow-[0_0_50px_rgba(239,68,68,0.3)] overflow-hidden flex flex-col gap-3">
        {/* Cabecera Táctica del Duelo */}
        <div className="flex items-center justify-between border-b border-red-500/30 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-500/20 text-red-400 animate-pulse border border-red-500/40">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-widest text-red-400 uppercase">
                DUELO TÁCTICO PVP
              </h2>
              <p className="text-[10px] text-gray-400 font-mono tracking-tight">
                ENFRENTAMIENTO POR CONQUISTA DE COFRE • CANAL {combatId.slice(-6)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-[10px] font-mono text-red-300">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
            EN VIVO
          </div>
        </div>

        {/* Notificación de Cola de Monstruo si hay uno acechando fuera */}
        {queuedMonster && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-300 text-xs font-mono animate-pulse">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Burbuja Táctica Activa:</strong> {queuedMonster.name || 'Monstruo'} acecha en espera exterior. Duelo protegido.
            </span>
          </div>
        )}

        {/* 1. SECCIÓN DEL RIVAL: BARRA DE SALUD SUPERIOR + AVATAR CENTRAL INTERACTIVO */}
        <div className="flex flex-col gap-2 relative">
          {/* Cabecera y Barra de Vida del Rival */}
          <div className="rounded-xl border border-red-500/40 bg-gray-950/80 p-3 sm:p-3.5 shadow-lg">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <img src={getRoleAvatar(opponentPlayer.role)} alt={opponentPlayer.nickname} className="w-5 h-5 object-contain" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base font-black text-white tracking-wide">
                      {opponentPlayer.nickname}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 uppercase border border-red-500/30 font-bold">
                      {opponentPlayer.role}
                    </span>
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-gray-400 flex items-center gap-1">
                    <span>Cofres conquistados:</span>
                    <span className="font-bold text-amber-400">
                      👑 {opponentPlayer.chests_opened || opponentPlayer.chestsOpened || 0}/3
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">SALUD RIVAL</span>
                <div className="text-sm sm:text-base font-black font-mono text-red-400">
                  {opponentHp} / {opponentMaxHp}
                </div>
              </div>
            </div>

            {/* Barra de Vida del Rival */}
            <div className="w-full h-3 bg-gray-900 rounded-full overflow-hidden border border-gray-700/80">
              <div
                className={`h-full transition-all duration-300 ${
                  opponentHpPct > 50
                    ? 'bg-gradient-to-r from-red-600 via-orange-500 to-red-400'
                    : opponentHpPct > 25
                    ? 'bg-gradient-to-r from-red-600 to-amber-500'
                    : 'bg-red-600 animate-pulse'
                }`}
                style={{ width: `${opponentHpPct}%` }}
              />
            </div>
          </div>

          {/* Avatar Central Interactivo del Rival (Tap-to-Attack) */}
          <div className="flex flex-col items-center justify-center gap-2.5 my-1 sm:my-2 relative">
            {/* Números de daño flotantes sobre el avatar */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30 overflow-hidden">
              {damageNumbers.map((d) => (
                <div
                  key={d.id}
                  className="floating-combat-effect absolute flex items-center gap-1.5 animate-floatUp px-3 py-1 rounded-full bg-slate-950/85 border border-slate-700/60 shadow-2xl backdrop-blur-sm"
                >
                  {d.icon && (
                    <img
                      src={d.icon.replace(/^\/+/, '/')}
                      alt=""
                      className="h-6 w-6 object-contain drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] select-none"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span
                    className={`font-mono font-black text-sm sm:text-base tracking-wide whitespace-nowrap ${
                      d.isIncoming
                        ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]'
                        : d.isPet
                        ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]'
                        : 'text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.9)]'
                    }`}
                  >
                    {d.label || d.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Contenedor Clicable / Táctil del Rival */}
            <button
              type="button"
              onClick={handleExecuteAttackOnOpponent}
              onTouchStart={(e) => {
                e.preventDefault();
                handleExecuteAttackOnOpponent();
              }}
              disabled={isAttacking || opponentHp <= 0 || duelOutcome !== 'ongoing'}
              aria-label={`Atacar a ${opponentPlayer.nickname}`}
              className={`group relative flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full border-2 transition-all duration-150 select-none focus:outline-none cursor-pointer ${
                isOpponentHit
                  ? 'border-red-400 bg-red-900/60 shadow-[0_0_35px_rgba(239,68,68,0.85)] scale-95 animate-hitShake'
                  : 'border-red-500/80 bg-red-950/40 shadow-[0_0_25px_rgba(239,68,68,0.4)] hover:border-red-400 hover:shadow-[0_0_35px_rgba(239,68,68,0.7)] active:scale-90'
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              {/* Resplandor pulsante de combate */}
              <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping pointer-events-none" />

              {/* Avatar / Icono del Rival */}
              <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center transition-transform group-hover:scale-105">
                <img
                  src={getRoleAvatar(opponentPlayer.role)}
                  alt={opponentPlayer.nickname}
                  className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                />
              </div>

              {/* Efecto de impacto visual si recibe daño reciente */}
              {isOpponentHit && (
                <div className="absolute inset-0 rounded-full bg-white/40 animate-flash pointer-events-none" />
              )}
            </button>

            {/* Pista táctica inferior */}
            <span className="rounded-full border border-red-500/30 bg-slate-950/80 px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wider text-red-300 uppercase shadow-md flex items-center gap-1.5 animate-pulse">
              <Crosshair className="w-3.5 h-3.5 text-red-400" />
              <span>{attackCooldown > 0 ? 'RECARGANDO ARMA...' : 'TOCA EL OBJETIVO PARA ATACAR'}</span>
            </span>
          </div>
        </div>

        {/* Separador de Duelo */}
        <div className="flex items-center justify-center my-0.5">
          <div className="h-px bg-red-500/30 flex-1" />
          <span className="px-3 text-xs font-mono font-black text-red-400 uppercase tracking-wider">VS</span>
          <div className="h-px bg-red-500/30 flex-1" />
        </div>

        {/* Tarjeta de Mi Jugador */}
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center p-1 text-sm font-black text-cyan-300">
                <img src={getRoleAvatar(myPlayer.role)} alt={myPlayer.nickname} className="w-6 h-6 object-contain" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-cyan-200">{myPlayer.nickname} (Tú)</span>
                <div className="text-[10px] font-mono text-gray-400 uppercase">
                  Arma: <strong className="text-white">{equippedWeapon.name}</strong> • Daño: <strong className="text-cyan-300">{effectiveDamage}</strong>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-gray-400">TU SALUD</span>
              <div className="text-xs sm:text-sm font-black font-mono text-cyan-300">
                {myHp} / {myMaxHp}
              </div>
            </div>
          </div>

          {/* Barra de Vida de Mi Jugador */}
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700 mb-1">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${myHpPct}%` }}
            />
          </div>

          {/* Barra de Cooldown de Disparo */}
          <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all"
              style={{
                width: `${attackCooldown > 0 ? (attackCooldown / (equippedWeapon.cadenceMs || 400)) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Controles de Acción Inferiores */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleAttack}
            disabled={attackCooldown > 0 || duelOutcome !== 'ongoing'}
            className={`flex-1 py-3 px-4 rounded-xl font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2 shadow-lg ${
              attackCooldown > 0 || duelOutcome !== 'ongoing'
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                : 'bg-gradient-to-r from-red-600 to-amber-600 text-white hover:from-red-500 hover:to-amber-500 border border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-95'
            }`}
          >
            <img src={getWeaponIcon(equippedWeapon.weaponType)} alt={equippedWeapon.name} className="w-5 h-5 object-contain" />
            <span>{attackCooldown > 0 ? 'RECARGANDO...' : `DISPARAR (${effectiveDamage} DMG)`}</span>
          </button>

          <button
            type="button"
            onClick={handleFlee}
            disabled={duelOutcome !== 'ongoing'}
            className="px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
            title="Retirarse del combate a una zona segura"
          >
            <Footprints className="w-4 h-4 text-amber-400" />
            <span>Huir</span>
          </button>
        </div>

        {/* Overlay de Desenlace del Duelo */}
        {duelOutcome !== 'ongoing' && (
          <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            {duelOutcome === 'victory' && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center p-2 mb-3 shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                  <img src="/assets/icons/hud/hud-trophy.png" alt="Victoria" className="w-10 h-10 object-contain drop-shadow" />
                </div>
                <h3 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-1">
                  ¡VICTORIA EN DUELO TÁCTICO!
                </h3>
                <p className="text-sm text-gray-300 font-mono mb-4">
                  Has neutralizado a <strong className="text-white">{opponentPlayer.nickname}</strong>.
                  <br />
                  {queuedMonster
                    ? 'Iniciando enfrentamiento con el monstruo en cola...'
                    : 'Control del sector asegurado.'}
                </p>
              </>
            )}

            {duelOutcome === 'defeat' && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center p-2 mb-3 shadow-[0_0_30px_rgba(239,68,68,0.5)] animate-pulse">
                  <img src="/assets/icons/roles/player-wounded.png" alt="Derrota" className="w-10 h-10 object-contain drop-shadow" />
                </div>
                <h3 className="text-xl font-black text-red-500 uppercase tracking-widest mb-1">
                  CAÍDO EN DUELO TÁCTICO
                </h3>
                <p className="text-sm text-gray-300 font-mono mb-4">
                  Has sido neutralizado por <strong className="text-white">{opponentPlayer.nickname}</strong>.
                  <br />
                  Signos vitales críticos. Regresando a la base médica...
                </p>
              </>
            )}

            {duelOutcome === 'fled' && (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-3xl mb-3 shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                  🏃
                </div>
                <h3 className="text-lg font-black text-amber-400 uppercase tracking-widest mb-1">
                  RETIRADA TÁCTICA
                </h3>
                <p className="text-xs text-gray-300 font-mono mb-3">
                  Has roto contacto hostil. Inmunidad temporal concedida.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
