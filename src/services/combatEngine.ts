import type {
  Weapon,
  PlayerRole,
  SupplyCrate,
  CrateType,
  WeaponType,
  InventoryItem,
} from '../types/game';

export const WEAPON_TIER_CONFIG: Record<WeaponType, Omit<InventoryItem, 'id'>> = {
  rocket_launcher: {
    type: 'rocket_launcher',
    name: 'Lanzacohetes RPG',
    category: 'weapon',
    tier: 7,
    damage: 250,
    cadenceMs: 2200,
    ammo: 3,
    maxAmmo: 3,
    durability: -1,
    isInfinite: false,
    rangeMeters: 60,
    iconName: 'Target',
  },
  grenade: {
    type: 'grenade',
    name: 'Granadas Tácticas',
    category: 'weapon',
    tier: 6,
    damage: 160,
    cadenceMs: 1600,
    ammo: 5,
    maxAmmo: 5,
    durability: -1,
    isInfinite: false,
    rangeMeters: 35,
    iconName: 'Flame',
  },
  rifle: {
    type: 'rifle',
    name: 'Fusil Táctico M4',
    category: 'weapon',
    tier: 5,
    damage: 45,
    cadenceMs: 280,
    ammo: 90,
    maxAmmo: 90,
    durability: -1,
    isInfinite: false,
    rangeMeters: 55,
    iconName: 'Flame',
  },
  shotgun: {
    type: 'shotgun',
    name: 'Escopeta de Postas',
    category: 'weapon',
    tier: 4,
    damage: 80,
    cadenceMs: 900,
    ammo: 20,
    maxAmmo: 20,
    durability: -1,
    isInfinite: false,
    rangeMeters: 26,
    iconName: 'Target',
  },
  pistol: {
    type: 'pistol',
    name: 'Pistola 9mm',
    category: 'weapon',
    tier: 3,
    damage: 32,
    cadenceMs: 450,
    ammo: 45,
    maxAmmo: 45,
    durability: -1,
    isInfinite: false,
    rangeMeters: 38,
    iconName: 'Zap',
  },
  axe: {
    type: 'axe',
    name: 'Hacha Táctica',
    category: 'weapon',
    tier: 2,
    damage: 55,
    cadenceMs: 650,
    ammo: 15,
    maxAmmo: 15,
    durability: 15,
    isInfinite: false,
    rangeMeters: 15,
    iconName: 'ShieldAlert',
  },
  knife: {
    type: 'knife',
    name: 'Cuchillo Táctico',
    category: 'weapon',
    tier: 1,
    damage: 22,
    cadenceMs: 380,
    ammo: -1,
    maxAmmo: -1,
    durability: -1,
    isInfinite: true,
    rangeMeters: 12,
    iconName: 'Crosshair',
  },
  fists: {
    type: 'fists',
    name: 'Puños',
    category: 'weapon',
    tier: 0,
    damage: 5,
    cadenceMs: 350,
    ammo: -1,
    maxAmmo: -1,
    durability: -1,
    isInfinite: true,
    rangeMeters: 10,
    iconName: 'ShieldAlert',
  },
};

export const FISTS_ITEM: InventoryItem = {
  ...WEAPON_TIER_CONFIG.fists,
  id: 'fists_base',
};

export const FISTS_WEAPON: Weapon = inventoryItemToWeapon(FISTS_ITEM);

/**
 * Crea una nueva instancia única de un objeto para el inventario
 */
export function createInventoryItem(type: WeaponType, customAmmo?: number): InventoryItem {
  const config = WEAPON_TIER_CONFIG[type];
  const ammo = customAmmo !== undefined ? customAmmo : config.ammo;
  return {
    ...config,
    id: crypto.randomUUID(),
    ammo,
    durability: config.durability !== -1 ? ammo : -1,
  };
}

/**
 * Convierte un InventoryItem al formato Weapon consumido por el bucle de combate
 */
export function inventoryItemToWeapon(item: InventoryItem): Weapon {
  return {
    id: item.id,
    name: item.name,
    type: (item.rangeMeters ?? 15) > 16 ? 'firearm' : 'melee',
    damage: item.damage,
    rangeMeters: item.rangeMeters ?? 15,
    fireRateMs: item.cadenceMs,
    cadenceMs: item.cadenceMs,
    ammo: item.ammo,
    maxAmmo: item.maxAmmo,
    iconName: item.iconName ?? 'Crosshair',
    tier: item.tier,
    weaponType: item.type as WeaponType,
    isInfinite: item.isInfinite,
    durability: item.durability,
  };
}

/**
 * Retorna el inventario inicial según el rol del jugador
 */
export function getDefaultInventoryForRole(role: PlayerRole): InventoryItem[] {
  const knife = createInventoryItem('knife');
  switch (role) {
    case 'marksman':
      return [createInventoryItem('rifle'), knife];
    case 'tank':
      return [createInventoryItem('axe'), knife];
    case 'medic':
      return [createInventoryItem('pistol'), knife];
    case 'scout':
    default:
      return [createInventoryItem('pistol'), knife];
  }
}

/**
 * Obtiene el arma de mayor tier disponible con munición o infinita en el inventario.
 * Si no quedan armas utilizables en la mochila, recurre a Puños (Tier 0).
 */
export function getBestWeaponInInventory(inventory: InventoryItem[]): InventoryItem {
  const usable = inventory
    .filter((it) => it.category === 'weapon')
    .filter((it) => it.isInfinite || it.ammo > 0);

  if (usable.length === 0) {
    return { ...FISTS_ITEM };
  }

  // Ordenar de mayor a menor tier
  usable.sort((a, b) => b.tier - a.tier);
  return usable[0];
}

export const WEAPON_REGISTRY: Record<string, Weapon> = {
  fists: FISTS_WEAPON,
  rocket_launcher: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.rocket_launcher, id: 'rocket_launcher' }),
  grenade: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.grenade, id: 'grenade' }),
  assault_rifle: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.rifle, id: 'assault_rifle' }),
  rifle: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.rifle, id: 'rifle' }),
  combat_shotgun: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.shotgun, id: 'combat_shotgun' }),
  shotgun: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.shotgun, id: 'shotgun' }),
  pistol_9mm: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.pistol, id: 'pistol_9mm' }),
  pistol: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.pistol, id: 'pistol' }),
  baseball_bat: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.axe, id: 'baseball_bat' }),
  axe: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.axe, id: 'axe' }),
  tactical_knife: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.knife, id: 'tactical_knife' }),
  knife: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.knife, id: 'knife' }),
};

export const DEFAULT_WEAPONS_BY_ROLE: Record<PlayerRole, Weapon> = {
  medic: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.pistol, id: 'default_medic_pistol' }),
  tank: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.axe, id: 'default_tank_axe' }),
  scout: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.pistol, id: 'default_scout_pistol' }),
  marksman: inventoryItemToWeapon({ ...WEAPON_TIER_CONFIG.rifle, id: 'default_marksman_rifle' }),
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
export function getVisionRadius(role: PlayerRole, isRadarActive: boolean, hasTacticalDrone: boolean = false): number {
  if (isRadarActive) return 9999; // Revelado global
  const droneBonus = hasTacticalDrone ? 15 : 0;
  if (role === 'scout') return 105 + droneBonus; // Explorador visión extendida
  return 60 + droneBonus; // Estándar
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

export interface CrateVisualInfo {
  type: CrateType;
  label: string;
  icon: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
}

/**
 * Retorna la información visual (icono, colores, etiqueta) según el tipo o recompensa de la caja de suministros
 */
export function getCrateVisualInfo(crate: SupplyCrate): CrateVisualInfo {
  if (crate.crateType) {
    switch (crate.crateType) {
      case 'medkit':
        return {
          type: 'medkit',
          label: 'Botiquín',
          icon: '❤️',
          badgeBg: 'bg-emerald-950/90',
          borderColor: 'border-emerald-400',
          textColor: 'text-emerald-300',
          glowColor: 'bg-emerald-500/25',
        };
      case 'ammo':
        return {
          type: 'ammo',
          label: 'Munición',
          icon: '⚡',
          badgeBg: 'bg-amber-950/90',
          borderColor: 'border-amber-400',
          textColor: 'text-amber-300',
          glowColor: 'bg-amber-500/25',
        };
      case 'rifle':
        return {
          type: 'rifle',
          label: 'Rifle Táctico',
          icon: '🎯',
          badgeBg: 'bg-cyan-950/90',
          borderColor: 'border-cyan-400',
          textColor: 'text-cyan-300',
          glowColor: 'bg-cyan-500/25',
        };
      case 'shotgun':
        return {
          type: 'shotgun',
          label: 'Escopeta',
          icon: '💥',
          badgeBg: 'bg-purple-950/90',
          borderColor: 'border-purple-400',
          textColor: 'text-purple-300',
          glowColor: 'bg-purple-500/25',
        };
      case 'rocket_launcher':
        return {
          type: 'rocket_launcher',
          label: 'Lanzacohetes',
          icon: '🚀',
          badgeBg: 'bg-red-950/90',
          borderColor: 'border-red-400',
          textColor: 'text-red-300',
          glowColor: 'bg-red-500/30',
        };
      case 'grenade':
        return {
          type: 'grenade',
          label: 'Granadas',
          icon: '💣',
          badgeBg: 'bg-orange-950/90',
          borderColor: 'border-orange-400',
          textColor: 'text-orange-300',
          glowColor: 'bg-orange-500/30',
        };
      case 'melee':
        return {
          type: 'melee',
          label: 'Cuchillo / Hacha',
          icon: '🪓',
          badgeBg: 'bg-yellow-950/90',
          borderColor: 'border-yellow-400',
          textColor: 'text-yellow-300',
          glowColor: 'bg-yellow-500/25',
        };
    }
  }

  // Si no se asignó crateType explícito, inferir a partir del arma y recompensas
  const weapon = crate.weaponReward;
  if (weapon?.id === 'assault_rifle') {
    return {
      type: 'rifle',
      label: 'Rifle Táctico',
      icon: '🎯',
      badgeBg: 'bg-cyan-950/90',
      borderColor: 'border-cyan-400',
      textColor: 'text-cyan-300',
      glowColor: 'bg-cyan-500/25',
    };
  }
  if (weapon?.id === 'combat_shotgun') {
    return {
      type: 'shotgun',
      label: 'Escopeta',
      icon: '💥',
      badgeBg: 'bg-purple-950/90',
      borderColor: 'border-purple-400',
      textColor: 'text-purple-300',
      glowColor: 'bg-purple-500/25',
    };
  }
  if (weapon?.id === 'baseball_bat' || weapon?.id === 'tactical_knife' || weapon?.type === 'melee') {
    return {
      type: 'melee',
      label: 'Cuchillo / Bate',
      icon: '🗡️',
      badgeBg: 'bg-yellow-950/90',
      borderColor: 'border-yellow-400',
      textColor: 'text-yellow-300',
      glowColor: 'bg-yellow-500/25',
    };
  }
  if (crate.healReward >= 50) {
    return {
      type: 'medkit',
      label: 'Botiquín',
      icon: '❤️',
      badgeBg: 'bg-emerald-950/90',
      borderColor: 'border-emerald-400',
      textColor: 'text-emerald-300',
      glowColor: 'bg-emerald-500/25',
    };
  }
  if (crate.ammoReward >= 30) {
    return {
      type: 'ammo',
      label: 'Munición',
      icon: '⚡',
      badgeBg: 'bg-amber-950/90',
      borderColor: 'border-amber-400',
      textColor: 'text-amber-300',
      glowColor: 'bg-amber-500/25',
    };
  }

  return {
    type: 'medkit',
    label: 'Botiquín',
    icon: '❤️',
    badgeBg: 'bg-emerald-950/90',
    borderColor: 'border-emerald-400',
    textColor: 'text-emerald-300',
    glowColor: 'bg-emerald-500/25',
  };
}
