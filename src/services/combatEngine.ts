import type { Weapon, PlayerRole } from '../types/game';

export const WEAPON_REGISTRY: Record<string, Weapon> = {
  baseball_bat: {
    id: 'baseball_bat',
    name: 'Bate Reforzado',
    type: 'melee',
    damage: 24,
    rangeMeters: 15,
    fireRateMs: 650,
    ammo: -1,
    maxAmmo: -1,
    iconName: 'ShieldAlert',
  },
  tactical_knife: {
    id: 'tactical_knife',
    name: 'Cuchillo Táctico',
    type: 'melee',
    damage: 18,
    rangeMeters: 12,
    fireRateMs: 400,
    ammo: -1,
    maxAmmo: -1,
    iconName: 'Crosshair',
  },
  pistol_9mm: {
    id: 'pistol_9mm',
    name: 'Pistola 9mm',
    type: 'firearm',
    damage: 32,
    rangeMeters: 38,
    fireRateMs: 500,
    ammo: 36,
    maxAmmo: 36,
    iconName: 'Zap',
  },
  combat_shotgun: {
    id: 'combat_shotgun',
    name: 'Escopeta de Postas',
    type: 'firearm',
    damage: 75,
    rangeMeters: 26,
    fireRateMs: 950,
    ammo: 18,
    maxAmmo: 18,
    iconName: 'Target',
  },
  assault_rifle: {
    id: 'assault_rifle',
    name: 'Rifle Táctico',
    type: 'firearm',
    damage: 42,
    rangeMeters: 55,
    fireRateMs: 320,
    ammo: 90,
    maxAmmo: 90,
    iconName: 'Flame',
  },
};

export const DEFAULT_WEAPONS_BY_ROLE: Record<PlayerRole, Weapon> = {
  medic: { ...WEAPON_REGISTRY.pistol_9mm },
  tank: { ...WEAPON_REGISTRY.baseball_bat },
  scout: { ...WEAPON_REGISTRY.tactical_knife },
  marksman: { ...WEAPON_REGISTRY.assault_rifle },
};

/**
 * Aplica modificadores de rol al alcance y daño del arma
 */
export function getModifiedWeaponStats(weapon: Weapon, role: PlayerRole): { damage: number; rangeMeters: number } {
  let damage = weapon.damage;
  let rangeMeters = weapon.rangeMeters;

  if (role === 'marksman') {
    // Tirador: +35% de daño a distancia y mayor alcance
    damage = Math.round(damage * 1.35);
    rangeMeters = Math.round(rangeMeters * 1.35);
  }

  return { damage, rangeMeters };
}

/**
 * Retorna la vida máxima base según el rol
 */
export function getMaxHpForRole(role: PlayerRole): number {
  if (role === 'tank') {
    return 150; // Tanque: +50% HP base
  }
  return 100;
}

/**
 * Retorna el radio de visión de niebla de guerra en metros
 */
export function getVisionRadius(role: PlayerRole, isRadarActive: boolean): number {
  if (isRadarActive) return 9999; // Revelado global
  if (role === 'scout') return 105; // Explorador visión extendida
  return 60; // Estándar
}

/**
 * Retorna el tiempo requerido para revivir en segundos
 */
export function getReviveDurationSeconds(role: PlayerRole): number {
  if (role === 'medic') return 10; // Médico revivido en 10s
  return 20; // Estándar 20s
}

/**
 * Retorna la distancia máxima para poder revivir
 */
export function getReviveDistanceMeters(role: PlayerRole): number {
  if (role === 'medic') return 35; // Médico doble radio efectivo
  return 20; // Estándar 20m
}
