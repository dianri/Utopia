import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Player, Monster, Weapon, Pet } from '../../types/game';
import { DEFAULT_WEAPONS_BY_ROLE, getModifiedWeaponStats } from '../../services/combatEngine';
import { soundEffects } from '../../services/soundEffects';
import { ShieldAlert, Crosshair, Zap, Flame, Target, Footprints, Shield, Skull, Swords, AlertTriangle, Heart } from 'lucide-react';

interface CombatArenaProps {
  isOpen: boolean;
  myPlayer: Player;
  monster: Monster;
  isRoleSkillActive?: boolean;
  onAttack: (damage: number, newHp: number, weapon: Weapon) => void;
  onPlayerDamaged: (damage: number) => void;
  onPetDamaged?: (updatedPets: Pet[]) => void;
  onAddLog?: (message: string, type?: 'info' | 'combat' | 'warning' | 'loot') => void;
  onFlee: () => void;
  onClose: () => void;
}

export const CombatArena: React.FC<CombatArenaProps> = ({
  isOpen,
  myPlayer,
  monster,
  isRoleSkillActive = false,
  onAttack,
  onPlayerDamaged,
  onPetDamaged,
  onAddLog,
  onFlee,
  onClose,
}) => {
  const [isAttacking, setIsAttacking] = useState<boolean>(false);
  const [isMonsterAttacking, setIsMonsterAttacking] = useState<boolean>(false);
  const [screenShake, setScreenShake] = useState<boolean>(false);
  const [cardHitAnim, setCardHitAnim] = useState<boolean>(false);
  const [attackCooldown, setAttackCooldown] = useState<number>(0);
  const [damagedPetId, setDamagedPetId] = useState<string | null>(null);
  const [damageNumbers, setDamageNumbers] = useState<{ id: number; text: string; isCrit: boolean; isPet?: boolean }[]>([]);

  const monsterRef = useRef<Monster>(monster);
  monsterRef.current = monster;

  const myPlayerRef = useRef<Player>(myPlayer);
  myPlayerRef.current = myPlayer;

  const isRoleSkillActiveRef = useRef<boolean>(isRoleSkillActive);
  isRoleSkillActiveRef.current = isRoleSkillActive;

  const onPlayerDamagedRef = useRef(onPlayerDamaged);
  onPlayerDamagedRef.current = onPlayerDamaged;

  const onPetDamagedRef = useRef(onPetDamaged);
  onPetDamagedRef.current = onPetDamaged;

  const onAddLogRef = useRef(onAddLog);
  onAddLogRef.current = onAddLog;

  const onAttackRef = useRef(onAttack);
  onAttackRef.current = onAttack;

  const petsRef = useRef<Pet[]>(myPlayer.pets || []);
  petsRef.current = myPlayer.pets || [];

  const monsterHpRef = useRef<number>(monster.hp);
  monsterHpRef.current = monster.hp;

  const equippedWeapon = myPlayer.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[myPlayer.role];
  const equippedWeaponRef = useRef<Weapon>(equippedWeapon);
  equippedWeaponRef.current = equippedWeapon;

  const weaponStats = getModifiedWeaponStats(equippedWeapon, myPlayer.role);
  const isMarksmanBoosted = isRoleSkillActive && myPlayer.role === 'marksman';
  const effectiveDamage = isMarksmanBoosted ? Math.round(weaponStats.damage * 1.25) : weaponStats.damage;

  const monsterHpPercent = Math.max(0, Math.min(100, Math.round((monster.hp / monster.maxHp) * 100)));
  const playerHpPercent = Math.max(0, Math.min(100, Math.round((myPlayer.hp / myPlayer.maxHp) * 100)));

  const isMonsterAlive = monster.hp > 0 && monster.state !== 'dead';
  const isPlayerCriticallyWounded =
    myPlayer.status === 'critically_wounded' ||
    myPlayer.isCriticallyWounded ||
    myPlayer.hp <= 1;

  const lastAttackTimeRef = useRef<number>(0);

  // ==========================================
  // ATAQUE DEL JUGADOR (BOTÓN O TAP EN LA CARTA)
  // ==========================================
  const handlePlayerAttack = useCallback(() => {
    if (!isOpen || monster.hp <= 0 || monster.state === 'dead') return;

    const now = Date.now();
    const fireInterval = equippedWeapon.cadenceMs || equippedWeapon.fireRateMs || 400;

    if (now - lastAttackTimeRef.current < fireInterval) {
      return; // En cooldown de arma (respeta cadenceMs)
    }

    // Comprobar munición
    if (equippedWeapon.ammo !== -1 && equippedWeapon.ammo <= 0) {
      soundEffects.vibrate(20);
      return;
    }

    lastAttackTimeRef.current = now;

    // Animación visual de disparo e impacto
    setIsAttacking(true);
    setCardHitAnim(true);
    setAttackCooldown(fireInterval);

    // Audio y hápticos
    soundEffects.playGunshot(equippedWeapon.type === 'melee' ? 'melee' : 'rifle');
    soundEffects.vibrate(40);

    const isCrit = isMarksmanBoosted || Math.random() < 0.2;
    const finalDamage = isCrit ? Math.round(effectiveDamage * 1.3) : effectiveDamage;
    const newMonsterHp = Math.max(0, monster.hp - finalDamage);

    // Número de daño flotante
    const numId = Date.now() + Math.random();
    setDamageNumbers((prev) => [...prev, { id: numId, text: `-${finalDamage}`, isCrit }]);
    setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
    }, 900);

    onAttack(finalDamage, newMonsterHp, equippedWeapon);

    setTimeout(() => {
      setIsAttacking(false);
      setCardHitAnim(false);
    }, 200);
  }, [isOpen, monster.hp, monster.state, equippedWeapon, isMarksmanBoosted, effectiveDamage, onAttack]);

  // Barra de progreso de recarga / cooldown de ataque
  useEffect(() => {
    if (attackCooldown <= 0) return;
    const interval = setInterval(() => {
      setAttackCooldown((prev) => Math.max(0, prev - 50));
    }, 50);
    return () => clearInterval(interval);
  }, [attackCooldown]);

  // ==========================================
  // ATAQUE AUTOMÁTICO DE MASCOTAS ACTIVAS (CADA attackIntervalMs)
  // ==========================================
  useEffect(() => {
    if (!isOpen || !isMonsterAlive) return;

    const currentPets = (myPlayerRef.current.pets || []).filter((p) => !p.isWounded && p.hp > 0);
    if (currentPets.length === 0) return;

    const intervals = currentPets.map((pet) => {
      return setInterval(() => {
        const curMonster = monsterRef.current;
        if (!isOpen || curMonster.hp <= 0 || curMonster.state === 'dead') return;

        const dmg = pet.damage;
        const newHp = Math.max(0, curMonster.hp - dmg);

        // Efecto visual y daño flotante de mascota
        const numId = Date.now() + Math.random();
        setDamageNumbers((prev) => [
          ...prev,
          { id: numId, text: `${pet.icon} -${dmg}`, isCrit: false, isPet: true },
        ]);
        setTimeout(() => {
          setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
        }, 800);

        // Pequeño sonido de impacto asistido
        soundEffects.playGunshot('melee');
        onAttackRef.current(dmg, newHp, equippedWeaponRef.current);
      }, pet.attackIntervalMs || 2000);
    });

    return () => {
      intervals.forEach(clearInterval);
    };
  }, [isOpen, isMonsterAlive]);

  // ==========================================
  // BUCLE PERIÓDICO CONTINUO DE ATAQUE DEL MONSTRUO (2.5S NORMAL / 1.8S EN FURIA)
  // ==========================================
  useEffect(() => {
    if (!isOpen || !isMonsterAlive || isPlayerCriticallyWounded) {
      return;
    }

    // Cadencia normal: 2.5s. Si está en furia: ataque más rápido (1.8s)
    const attackCadenceMs = monster.isEnraged ? 1800 : 2500;
    // Daño normal (24) o potenciado en furia (34)
    const baseDamage = 24;
    const currentDamage = monster.isEnraged ? Math.round(baseDamage * 1.4) : baseDamage;

    const attackInterval = setInterval(() => {
      const curMonster = monsterRef.current;
      const curPlayer = myPlayerRef.current;

      if (!isOpen || curMonster.hp <= 0 || curMonster.state === 'dead') {
        return;
      }

      if (
        curPlayer.status === 'critically_wounded' ||
        curPlayer.isCriticallyWounded ||
        curPlayer.hp <= 1
      ) {
        return;
      }

      // Habilidad pasiva del Gato Callejero: +10% evasión
      const hasActiveCat = (curPlayer.pets || []).some((p) => p.type === 'cat' && !p.isWounded && p.hp > 0);
      if (hasActiveCat && Math.random() < 0.1) {
        const numId = Date.now() + Math.random();
        setDamageNumbers((prev) => [
          ...prev,
          { id: numId, text: '🐈 ¡ESQUIVADO!', isCrit: true },
        ]);
        setTimeout(() => {
          setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
        }, 1000);
        return;
      }

      // Mitigación del rol Tanque
      const isShielded = isRoleSkillActiveRef.current && curPlayer.role === 'tank';
      const effectiveMonsterDamage = isShielded ? Math.max(1, Math.round(currentDamage * 0.5)) : currentDamage;

      // Buscar la primera mascota viva para actuar como escudo táctico secuencial
      const currentPets = curPlayer.pets || [];
      const activeShieldPetIndex = currentPets.findIndex((p) => !p.isWounded && p.hp > 0);

      if (activeShieldPetIndex !== -1 && onPetDamagedRef.current) {
        // --- 1. IMPACTO ABSORBIDO POR EL ESCUDO TÁCTICO DE MASCOTAS ---
        const targetPet = currentPets[activeShieldPetIndex];
        const newHp = Math.max(0, targetPet.hp - effectiveMonsterDamage);
        const isNowWounded = newHp <= 0;

        const updatedPets = currentPets.map((pet, idx) => {
          if (idx === activeShieldPetIndex) {
            return {
              ...pet,
              hp: newHp,
              isWounded: isNowWounded,
            };
          }
          return pet;
        });

        // Sincronizar estado de las mascotas
        onPetDamagedRef.current(updatedPets);

        // Feedback audiovisual de impacto en la mascota
        setIsMonsterAttacking(true);
        setScreenShake(true);
        setDamagedPetId(targetPet.id);
        setTimeout(() => setDamagedPetId(null), 600);

        if (curMonster.isEnraged) {
          soundEffects.playMonsterRoar();
        } else {
          soundEffects.playAlarm();
        }
        soundEffects.triggerDamageHaptics();

        // Indicador de daño flotante sobre el escudo
        const numId = Date.now() + Math.random();
        setDamageNumbers((prev) => [
          ...prev,
          {
            id: numId,
            text: `🛡️ ${targetPet.name}: -${effectiveMonsterDamage} HP`,
            isCrit: isNowWounded,
            isPet: true,
          },
        ]);
        setTimeout(() => {
          setDamageNumbers((prev) => prev.filter((n) => n.id !== numId));
        }, 1200);

        // Registro táctico en el log de combate
        onAddLogRef.current?.(
          `¡El monstruo atacó a ${targetPet.name} ${targetPet.icon}! (-${effectiveMonsterDamage} HP)`,
          'combat'
        );
        if (isNowWounded) {
          onAddLogRef.current?.(
            `¡${targetPet.name} ha caído herida (0 HP)! 💫 El escudo táctico pasa a la siguiente mascota.`,
            'warning'
          );
        }

        setTimeout(() => {
          setIsMonsterAttacking(false);
          setScreenShake(false);
        }, 400);
      } else {
        // --- 2. IMPACTO DIRECTO AL JUGADOR (SIN MASCOTAS VIVAS) ---
        setIsMonsterAttacking(true);
        setScreenShake(true);
        if (curMonster.isEnraged) {
          soundEffects.playMonsterRoar();
        } else {
          soundEffects.playAlarm();
        }
        soundEffects.triggerDamageHaptics();

        // Infligir daño continuo al jugador local (la mitigación de rol se aplica en el manejador central)
        onPlayerDamagedRef.current(currentDamage);

        setTimeout(() => {
          setIsMonsterAttacking(false);
          setScreenShake(false);
        }, 400);
      }
    }, attackCadenceMs);

    return () => {
      clearInterval(attackInterval);
    };
  }, [isOpen, isMonsterAlive, monster.isEnraged, isPlayerCriticallyWounded]);

  // Si los HP del jugador caen a 0 o entra en estado crítico, cerrar inmediatamente la arena
  useEffect(() => {
    if (isOpen && (myPlayer.hp <= 1 || myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded')) {
      onClose();
    }
  }, [isOpen, myPlayer.hp, myPlayer.isCriticallyWounded, myPlayer.status, onClose]);

  // Si el monstruo muere durante el combate, cerrar tras breve celebración
  useEffect(() => {
    if (isOpen && (monster.hp <= 0 || monster.state === 'dead')) {
      const timer = setTimeout(() => {
        onClose();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, monster.hp, monster.state, onClose]);

  if (!isOpen) return null;

  const renderWeaponIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShieldAlert':
        return <ShieldAlert className="w-5 h-5" />;
      case 'Crosshair':
        return <Crosshair className="w-5 h-5" />;
      case 'Zap':
        return <Zap className="w-5 h-5" />;
      case 'Flame':
        return <Flame className="w-5 h-5" />;
      default:
        return <Target className="w-5 h-5" />;
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-6 bg-slate-950/95 backdrop-blur-xl select-none overflow-hidden transition-all duration-100 ${
        screenShake ? 'translate-x-1.5 translate-y-1' : ''
      }`}
    >
      {/* VIGNETTE DE IMPACTO ROJO AL RECIBIR DAÑO */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${
          isMonsterAttacking
            ? 'opacity-100 bg-red-600/35 ring-[16px] ring-inset ring-red-500'
            : 'opacity-0'
        }`}
      />

      {/* 1. CABECERA TÁCTICA DEL COMBATE */}
      <div className="w-full max-w-md flex items-center justify-between z-20 pt-1">
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-md bg-red-950/80 border border-red-500/60 flex items-center gap-1.5 animate-pulse">
            <Swords className="w-4 h-4 text-red-400" />
            <span className="text-xs font-mono font-black tracking-wider text-red-200 uppercase">
              MODO ARENA TÁCTICA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {monster.isEnraged ? (
            <div className="px-2.5 py-1 rounded-md bg-orange-950/80 border border-orange-500 text-orange-300 flex items-center gap-1 text-[11px] font-mono font-bold animate-bounce">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>FURIA ACTIVA</span>
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-mono">
              AMENAZA: ALFA
            </div>
          )}
        </div>
      </div>

      {/* 2. CARTA CENTRAL DEL MONSTRUO (ESTILO POKÉMON / TÁCTICO) */}
      <div className="w-full max-w-sm flex-1 flex flex-col items-center justify-center my-auto z-20 relative">
        {/* Números de daño flotantes */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
          {damageNumbers.map((num) => (
            <span
              key={num.id}
              className={`absolute font-mono font-black animate-ping text-xl sm:text-2xl ${
                num.isPet
                  ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]'
                  : num.isCrit
                  ? 'text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                  : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]'
              }`}
            >
              {num.text}
            </span>
          ))}
        </div>

        <div
          onClick={handlePlayerAttack}
          role="button"
          tabIndex={0}
          className={`w-full max-w-[320px] rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-red-950/80 border-2 transition-transform duration-100 cursor-pointer shadow-2xl relative overflow-hidden group active:scale-95 ${
            cardHitAnim
              ? 'border-red-400 scale-95 shadow-[0_0_40px_rgba(239,68,68,0.7)]'
              : monster.isEnraged
              ? 'border-orange-500/80 shadow-[0_0_30px_rgba(249,115,22,0.4)]'
              : 'border-red-500/60 shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:border-red-400'
          }`}
        >
          {/* Cabecera de la carta: Nombre y Tipo */}
          <div className="px-4 py-2.5 bg-black/60 border-b border-red-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              <span className="font-mono font-black text-sm text-red-100 uppercase tracking-wider">
                Goliardus Rex
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-bold border border-red-700/50">
              NIVEL 4
            </span>
          </div>

          {/* Ilustración / Avatar del Monstruo */}
          <div className="relative h-44 sm:h-48 w-full bg-gradient-to-b from-red-950/40 via-black/80 to-slate-950 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.25)_0%,transparent_70%)]" />

            {/* Efecto de pulso en furia */}
            <div
              className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-red-500/50 flex items-center justify-center relative transition-all duration-300 ${
                cardHitAnim ? 'scale-110 bg-red-500/30' : 'bg-red-950/60'
              }`}
            >
              <Skull className={`w-16 h-16 sm:w-20 sm:h-20 transition-all ${
                monster.isEnraged ? 'text-orange-400 animate-pulse' : 'text-red-400'
              }`} />

              {/* Ojos brillantes */}
              <div className="absolute top-10 left-10 w-2.5 h-2.5 bg-red-400 rounded-full shadow-[0_0_8px_#f87171] animate-ping" />
              <div className="absolute top-10 right-10 w-2.5 h-2.5 bg-red-400 rounded-full shadow-[0_0_8px_#f87171] animate-ping" />
            </div>

            {/* Indicador de toque rápido */}
            <div className="absolute bottom-2 text-center w-full">
              <span className="text-[10px] font-mono text-red-300/80 uppercase tracking-widest bg-black/60 px-2 py-0.5 rounded border border-red-900/50">
                TOCA LA CARTA PARA ATACAR
              </span>
            </div>
          </div>

          {/* Barra de Vida Global del Monstruo */}
          <div className="p-3.5 bg-slate-950/90 border-t border-red-500/30 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-red-300 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                VITALIDAD COMPARTIDA
              </span>
              <span className="text-white font-black">
                {monster.hp} / {monster.maxHp} HP
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-red-900/60 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  monsterHpPercent <= 25
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 animate-pulse'
                    : 'bg-gradient-to-r from-red-700 to-red-500'
                }`}
                style={{ width: `${monsterHpPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. PANEL INFERIOR: ESTADO DEL JUGADOR, ARMA Y ACCIONES */}
      <div className="w-full max-w-md bg-slate-900/90 border-2 border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md z-20 flex flex-col gap-3">
        {/* Barra de Vida del Jugador */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              TU ESTADO ({myPlayer.nickname})
            </span>
            <span className={`font-black ${myPlayer.hp <= 30 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {myPlayer.hp} / {myPlayer.maxHp} HP
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                playerHpPercent <= 30 ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'
              }`}
              style={{ width: `${playerHpPercent}%` }}
            />
          </div>
        </div>

        {/* Tarjetas secundarias de Mascotas de Apoyo en Combate */}
        {myPlayer.pets && myPlayer.pets.length > 0 && (
          <div className="flex flex-col gap-1.5 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1 font-bold text-emerald-300">
                <Heart className="w-3 h-3 text-emerald-400" />
                MASCOTAS DE COMBATE ({myPlayer.pets.filter((p) => !p.isWounded).length}/{myPlayer.pets.length})
              </span>
              <span className="text-[10px] text-slate-500">Ataque Automático</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
              {myPlayer.pets.map((pet, idx) => {
                const petHpPercent = Math.max(0, Math.min(100, Math.round((pet.hp / pet.maxHp) * 100)));
                const firstAliveIndex = myPlayer.pets?.findIndex((p) => !p.isWounded && p.hp > 0);
                const isFrontlineShield = idx === firstAliveIndex;
                const isDamaged = damagedPetId === pet.id;

                return (
                  <div
                    key={pet.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono shrink-0 transition-all ${
                      isDamaged
                        ? 'bg-red-950/80 border-red-500 ring-2 ring-red-400 scale-105 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                        : isFrontlineShield
                        ? 'bg-emerald-950/70 border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                        : pet.isWounded
                        ? 'bg-slate-900/60 border-slate-800 opacity-50'
                        : 'bg-emerald-950/40 border-emerald-500/40 shadow-sm'
                    }`}
                  >
                    <span className="text-base">{pet.icon}</span>
                    <div className="flex flex-col min-w-[55px]">
                      <div className="flex items-center justify-between text-[10px] gap-1">
                        <span className={`font-bold truncate max-w-[65px] ${pet.isWounded ? 'text-slate-400' : 'text-emerald-200'}`}>
                          {pet.name}
                        </span>
                        {isFrontlineShield && (
                          <span className="text-[8px] bg-amber-500/30 text-amber-300 border border-amber-400/60 px-1 rounded font-bold whitespace-nowrap">
                            🛡️ ESCUDO
                          </span>
                        )}
                        {pet.isWounded && <span className="text-[9px]">💫</span>}
                      </div>
                      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                        <div
                          className={`h-full ${
                            pet.isWounded ? 'bg-gray-600' : petHpPercent < 30 ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${petHpPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Arma equipada y munición */}
        <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
              {renderWeaponIcon(equippedWeapon.iconName)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-mono font-black text-white uppercase">
                {equippedWeapon.name}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Daño: <b className="text-red-400">{effectiveDamage}</b> | Alcance: {equippedWeapon.rangeMeters}m
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-amber-400 block">
              {equippedWeapon.ammo === -1 ? '∞ Munición' : `${equippedWeapon.ammo}/${equippedWeapon.maxAmmo} Balas`}
            </span>
            {equippedWeapon.ammo === 0 && (
              <span className="text-[10px] font-mono text-red-400 uppercase font-black animate-pulse">
                ¡AGOTADA!
              </span>
            )}
          </div>
        </div>

        {/* BOTONES DE ACCIÓN: ATACAR Y HUIR */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Botón Principal: ATACAR */}
          <button
            type="button"
            onClick={handlePlayerAttack}
            disabled={attackCooldown > 0 || (equippedWeapon.ammo !== -1 && equippedWeapon.ammo <= 0)}
            className={`py-3.5 px-4 rounded-xl font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
              attackCooldown > 0
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-60'
                : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-red-500/40 border border-red-400/50'
            }`}
          >
            <Crosshair className={`w-4 h-4 ${isAttacking ? 'animate-spin' : ''}`} />
            <span>{isAttacking ? 'DISPARANDO' : 'ATACAR'}</span>
          </button>

          {/* Botón Secundario: HUIR */}
          <button
            type="button"
            onClick={onFlee}
            className="py-3.5 px-4 rounded-xl font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 bg-slate-800/90 hover:bg-slate-700/90 text-amber-300 border-2 border-amber-500/60 shadow-lg shadow-amber-950/40 transition-all active:scale-95"
          >
            <Footprints className="w-4 h-4 text-amber-400" />
            <span>HUIR (5s SPRINT)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
