import { useEffect, useRef, useState, useCallback } from 'react';
import type { Player, Monster, Coordinates, Weapon } from '../types/game';
import { getDistanceMeters } from '../services/geoUtils';
import {
  getModifiedWeaponStats,
  DEFAULT_WEAPONS_BY_ROLE,
  WEAPON_REGISTRY,
} from '../services/combatEngine';
import { soundEffects } from '../services/soundEffects';

interface UseCombatLoopOptions {
  isPlaying: boolean;
  myPlayer: Player | null;
  monster: Monster;
  roomCenter?: Coordinates;
  isRoleSkillActive?: boolean;
  onAttackMonster: (damage: number, newHp: number, weapon: Weapon, now: number) => void;
  onOutOfAmmo?: (fallbackWeapon: Weapon) => void;
  onLog?: (text: string, type: 'combat' | 'warning' | 'info') => void;
}

export function useCombatLoop({
  isPlaying,
  myPlayer,
  monster,
  roomCenter,
  isRoleSkillActive = false,
  onAttackMonster,
  onOutOfAmmo,
  onLog,
}: UseCombatLoopOptions) {
  const [isFiringWeapon, setIsFiringWeapon] = useState<boolean>(false);

  // Mantenemos referencias actualizadas para que el bucle de ataque sea totalmente
  // independiente de los re-renders generados por el movimiento o interpolación del avatar
  const myPlayerRef = useRef<Player | null>(myPlayer);
  myPlayerRef.current = myPlayer;

  const monsterRef = useRef<Monster>(monster);
  monsterRef.current = monster;

  const roomCenterRef = useRef<Coordinates | undefined>(roomCenter);
  roomCenterRef.current = roomCenter;

  const isRoleSkillActiveRef = useRef<boolean>(isRoleSkillActive);
  isRoleSkillActiveRef.current = isRoleSkillActive;

  const onAttackMonsterRef = useRef(onAttackMonster);
  onAttackMonsterRef.current = onAttackMonster;

  const onOutOfAmmoRef = useRef(onOutOfAmmo);
  onOutOfAmmoRef.current = onOutOfAmmo;

  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  const lastAttackTimeRef = useRef<number>(myPlayer?.lastAttackTime || 0);

  // Función atómica de ejecución de disparo (usada tanto en automático como manual)
  const performAttack = useCallback((isManual: boolean = false): boolean => {
    const player = myPlayerRef.current;
    const currentMonster = monsterRef.current;

    if (!player || !player.isAlive || currentMonster.hp <= 0 || currentMonster.state === 'dead') {
      setIsFiringWeapon(false);
      return false;
    }

    const center = roomCenterRef.current || { lat: 0, lng: 0 };
    const playerCoords: Coordinates = {
      lat: player.lat ?? center.lat,
      lng: player.lng ?? center.lng,
    };

    const dist = getDistanceMeters(playerCoords, currentMonster);
    const equippedWeapon = player.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[player.role];
    const baseStats = getModifiedWeaponStats(equippedWeapon, player.role);
    const isMarksmanBoosted = isRoleSkillActiveRef.current && player.role === 'marksman';
    const rangeMeters = isMarksmanBoosted ? Math.round(baseStats.rangeMeters * 1.5) : baseStats.rangeMeters;
    const damage = isMarksmanBoosted ? Math.round(baseStats.damage * 1.25) : baseStats.damage;

    // Verificar si el monstruo está en rango de disparo efectivo
    if (dist <= rangeMeters) {
      const now = Date.now();
      const lastAttack = lastAttackTimeRef.current || player.lastAttackTime || 0;

      if (now - lastAttack >= equippedWeapon.fireRateMs) {
        // Comprobar munición
        if (equippedWeapon.ammo !== -1 && equippedWeapon.ammo <= 0) {
          onOutOfAmmoRef.current?.(WEAPON_REGISTRY.baseball_bat);
          onLogRef.current?.('¡Sin munición! Cambiando a bate de emergencia', 'warning');
          return false;
        }

        // Efectos de disparo inmediatos sin frenar el desplazamiento del avatar
        lastAttackTimeRef.current = now;
        setIsFiringWeapon(true);
        setTimeout(() => setIsFiringWeapon(false), 200);

        soundEffects.playGunshot(equippedWeapon.type === 'melee' ? 'melee' : 'rifle');
        soundEffects.vibrate(30);

        const newHp = Math.max(0, currentMonster.hp - damage);
        onAttackMonsterRef.current(damage, newHp, equippedWeapon, now);
        return true;
      }
    } else if (isManual) {
      // Disparo manual fuera de alcance
      soundEffects.vibrate(20);
      onLogRef.current?.(
        `Monstruo fuera de alcance (${Math.round(dist)}m / alcance: ${rangeMeters}m)`,
        'warning'
      );
    } else {
      setIsFiringWeapon(false);
    }

    return false;
  }, []);

  // Bucle de combate a 200ms: independiente del ciclo de movimiento del jugador
  useEffect(() => {
    if (!isPlaying) {
      setIsFiringWeapon(false);
      return;
    }

    const interval = window.setInterval(() => {
      performAttack(false);
    }, 200);

    return () => {
      clearInterval(interval);
    };
  }, [isPlaying, performAttack]);

  const manualAttack = useCallback(() => {
    return performAttack(true);
  }, [performAttack]);

  return {
    isFiringWeapon,
    manualAttack,
  };
}
