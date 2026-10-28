import type {
  Player,
  SupplyCrate,
  DroppedItem,
  InventoryItem,
  Weapon,
  WeaponType,
  Pet,
} from '../types/game';
import {
  createInventoryItem,
  inventoryItemToWeapon,
  WEAPON_TIER_CONFIG,
  getDefaultInventoryForRole,
} from './combatEngine';

export interface LootPickupResult {
  updatedPlayer: Player;
  logMessage: string;
  logType: 'loot' | 'info';
  lootedItemName: string;
}

/**
 * Determina si una entidad de botín o caja es de tipo médico/curación
 */
export function isHealthLoot(item: {
  category?: string;
  type?: string;
  crateType?: string;
  healReward?: number;
}): boolean {
  return (
    item.category === 'health' ||
    item.type === 'medkit' ||
    item.crateType === 'medkit'
  );
}

/**
 * Determina si una entidad de botín o caja es de tipo munición
 */
export function isAmmoLoot(item: {
  category?: string;
  type?: string;
  crateType?: string;
  ammoReward?: number;
}): boolean {
  return (
    item.category === 'ammo' ||
    item.type === 'ammo' ||
    item.crateType === 'ammo'
  );
}

/**
 * Determina si una entidad de botín o caja es armamento o ítem de misión
 */
export function isWeaponOrKeyLoot(item: {
  category?: string;
  type?: string;
  crateType?: string;
  weaponReward?: Weapon;
}): boolean {
  return (
    item.category === 'weapon' ||
    item.category === 'key_item' ||
    !!item.weaponReward ||
    (item.crateType !== 'medkit' && item.crateType !== 'ammo')
  );
}

/**
 * Convierte la recompensa de arma de una caja a InventoryItem
 */
function crateWeaponToInventoryItem(weapon: Weapon): InventoryItem {
  const rawType = (weapon.weaponType || weapon.id) as string;
  const mappedType: WeaponType =
    rawType === 'assault_rifle'
      ? 'rifle'
      : rawType === 'combat_shotgun'
      ? 'shotgun'
      : rawType === 'baseball_bat'
      ? 'axe'
      : rawType === 'tactical_knife'
      ? 'knife'
      : (rawType as WeaponType);

  const hasConfig = mappedType in WEAPON_TIER_CONFIG;
  if (hasConfig) {
    return createInventoryItem(mappedType, weapon.ammo > 0 ? weapon.ammo : undefined);
  }

  return {
    id: crypto.randomUUID(),
    type: weapon.id,
    name: weapon.name,
    category: 'weapon',
    tier: weapon.tier || 3,
    damage: weapon.damage,
    cadenceMs: weapon.fireRateMs,
    ammo: weapon.ammo,
    maxAmmo: weapon.maxAmmo,
    durability: -1,
    isInfinite: weapon.ammo === -1,
    rangeMeters: weapon.rangeMeters,
    iconName: weapon.iconName,
  };
}

/**
 * Reabastece munición a las armas compatibles en el inventario del jugador
 */
function refillPlayerAmmo(
  player: Player,
  ammoAmount: number
): { updatedInv: InventoryItem[]; updatedEquipped: Weapon | undefined } {
  const currentInv = player.inventory && player.inventory.length > 0
    ? player.inventory
    : getDefaultInventoryForRole(player.role);

  let updatedEquipped = player.equippedWeapon;

  const updatedInv = currentInv.map((item) => {
    // Si el arma usa munición finita, rellenarla
    if (!item.isInfinite && item.ammo >= 0) {
      const newAmmo = item.maxAmmo > 0
        ? Math.min(item.maxAmmo, item.ammo + ammoAmount)
        : item.ammo + ammoAmount;

      if (item.id === player.equippedItemId && updatedEquipped) {
        updatedEquipped = {
          ...updatedEquipped,
          ammo: newAmmo,
        };
      }

      return {
        ...item,
        ammo: newAmmo,
      };
    }
    return item;
  });

  return { updatedInv, updatedEquipped };
}

/**
 * 1. Procesa la recolección de una caja de suministros por el jugador local.
 * AISLAMIENTO ESTRICTO:
 * - Si es botiquín / salud: aplica curación SIN tocar armas ni mochila.
 * - Si es munición: recarga balas SIN alterar la salud.
 * - Si es armamento: añade a la mochila SIN alterar la salud.
 */
export function applyCratePickup(
  crate: SupplyCrate,
  player: Player
): LootPickupResult {
  // CASO 1: SUMINISTRO MÉDICO (BOTIQUÍN)
  if (crate.crateType === 'medkit' || (crate.healReward > 0 && !crate.weaponReward)) {
    const healValue = crate.healReward > 0 ? crate.healReward : 100;
    const healedHp = Math.min(player.maxHp, player.hp + healValue);

    return {
      updatedPlayer: {
        ...player,
        hp: healedHp,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage: `¡Botiquín recogido! +${healValue} HP restaurados al instante.`,
      logType: 'loot',
      lootedItemName: 'Botiquín Médico',
    };
  }

  // CASO 2: CAJA DE MUNICIÓN
  if (crate.crateType === 'ammo' || (crate.ammoReward > 0 && !crate.weaponReward)) {
    const ammoAmount = crate.ammoReward > 0 ? crate.ammoReward : 60;
    const { updatedInv, updatedEquipped } = refillPlayerAmmo(player, ammoAmount);

    return {
      updatedPlayer: {
        ...player,
        // SALUD ESTRICTAMENTE INTACTA
        hp: player.hp,
        inventory: updatedInv,
        equippedWeapon: updatedEquipped,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage: `¡Caja de munición recogida! +${ammoAmount} balas reabastecidas.`,
      logType: 'loot',
      lootedItemName: 'Caja de Munición',
    };
  }

  // CASO 3: ARMAMENTO / ÍTEM DE MISIÓN
  if (crate.weaponReward) {
    const newInventoryItem = crateWeaponToInventoryItem(crate.weaponReward);
    const currentInv = player.inventory && player.inventory.length > 0
      ? player.inventory
      : getDefaultInventoryForRole(player.role);

    const updatedInv = [...currentInv, newInventoryItem];
    let updatedEquippedWeapon = player.equippedWeapon;
    let updatedEquippedItemId = player.equippedItemId;

    const currentTier = player.equippedWeapon?.tier ?? 0;
    const isCurrentlyFists = player.equippedWeapon?.weaponType === 'fists' || currentTier === 0;
    const shouldAutoEquip = isCurrentlyFists || newInventoryItem.tier > currentTier;

    if (shouldAutoEquip) {
      updatedEquippedWeapon = inventoryItemToWeapon(newInventoryItem);
      updatedEquippedItemId = newInventoryItem.id;
    }

    const logMessage = shouldAutoEquip
      ? `¡Has obtenido ${newInventoryItem.name} (Tier ${newInventoryItem.tier})! Auto-equipada.`
      : `¡${newInventoryItem.name} (Tier ${newInventoryItem.tier}) guardada en la mochila!`;

    return {
      updatedPlayer: {
        ...player,
        // SALUD ESTRICTAMENTE INTACTA
        hp: player.hp,
        inventory: updatedInv,
        equippedWeapon: updatedEquippedWeapon,
        equippedItemId: updatedEquippedItemId,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage,
      logType: 'loot',
      lootedItemName: crate.weaponReward.name,
    };
  }

  // Fallback seguro sin alterar salud
  return {
    updatedPlayer: {
      ...player,
      cratesOpened: player.cratesOpened + 1,
    },
    logMessage: 'Suministros recogidos.',
    logType: 'info',
    lootedItemName: 'Suministro',
  };
}

/**
 * 2. Procesa la recolección pasiva de una caja de suministros por una mascota compañera.
 * AISLAMIENTO ESTRICTO:
 * - Si es botiquín: cura al jugador (si le falta vida) o a la mascota más herida.
 * - Si es munición o arma: transfiere a la mochila del jugador SIN curar a nadie.
 */
export function applyPetCratePickup(
  crate: SupplyCrate,
  player: Player,
  fetchingPet: Pet
): LootPickupResult {
  // CASO 1: SUMINISTRO MÉDICO
  if (crate.crateType === 'medkit' || (crate.healReward > 0 && !crate.weaponReward)) {
    const healValue = crate.healReward > 0 ? crate.healReward : 100;
    let healedPlayerHp = player.hp;
    const updatedPets = [...(player.pets || [])];
    let logMessage = '';

    if (player.hp < player.maxHp) {
      healedPlayerHp = Math.min(player.maxHp, player.hp + healValue);
      logMessage = `🐾 ${fetchingPet.name} te trajo suministros médicos: +${healValue} HP!`;
    } else {
      let lowestPetIndex = -1;
      let lowestRatio = 1.0;
      updatedPets.forEach((p, idx) => {
        const ratio = p.hp / p.maxHp;
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          lowestPetIndex = idx;
        }
      });

      if (lowestPetIndex >= 0) {
        const targetPet = updatedPets[lowestPetIndex];
        const newPetHp = Math.min(targetPet.maxHp, targetPet.hp + healValue);
        updatedPets[lowestPetIndex] = {
          ...targetPet,
          hp: newPetHp,
          isWounded: false,
        };
        logMessage = `🐾 ${fetchingPet.name} curó a ${targetPet.name} (+${healValue} HP)!`;
      } else {
        logMessage = `🐾 ${fetchingPet.name} recogió botiquín médico (Squad al 100% HP).`;
      }
    }

    return {
      updatedPlayer: {
        ...player,
        hp: healedPlayerHp,
        pets: updatedPets,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage,
      logType: 'loot',
      lootedItemName: 'Botiquín Médico',
    };
  }

  // CASO 2: CAJA DE MUNICIÓN
  if (crate.crateType === 'ammo' || (crate.ammoReward > 0 && !crate.weaponReward)) {
    const ammoAmount = crate.ammoReward > 0 ? crate.ammoReward : 60;
    const { updatedInv, updatedEquipped } = refillPlayerAmmo(player, ammoAmount);

    return {
      updatedPlayer: {
        ...player,
        // SALUD ESTRICTAMENTE INTACTA
        hp: player.hp,
        inventory: updatedInv,
        equippedWeapon: updatedEquipped,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage: `🐾 ${fetchingPet.name} reabasteció munición (+${ammoAmount} balas)!`,
      logType: 'loot',
      lootedItemName: 'Caja de Munición',
    };
  }

  // CASO 3: ARMAMENTO
  if (crate.weaponReward) {
    const newInventoryItem = crateWeaponToInventoryItem(crate.weaponReward);
    const currentInv = player.inventory && player.inventory.length > 0
      ? player.inventory
      : getDefaultInventoryForRole(player.role);

    const updatedInv = [...currentInv, newInventoryItem];
    let updatedEquippedWeapon = player.equippedWeapon;
    let updatedEquippedItemId = player.equippedItemId;

    const currentTier = player.equippedWeapon?.tier ?? 0;
    const isCurrentlyFists = player.equippedWeapon?.weaponType === 'fists' || currentTier === 0;
    const shouldAutoEquip = isCurrentlyFists || newInventoryItem.tier > currentTier;

    if (shouldAutoEquip) {
      updatedEquippedWeapon = inventoryItemToWeapon(newInventoryItem);
      updatedEquippedItemId = newInventoryItem.id;
    }

    const logMessage = shouldAutoEquip
      ? `🐾 ${fetchingPet.name} trajo ${newInventoryItem.name} (Tier ${newInventoryItem.tier})! Auto-equipada.`
      : `🐾 ${fetchingPet.name} guardó ${newInventoryItem.name} (Tier ${newInventoryItem.tier}) en tu mochila!`;

    return {
      updatedPlayer: {
        ...player,
        // SALUD ESTRICTAMENTE INTACTA (cero curación al recoger armas)
        hp: player.hp,
        inventory: updatedInv,
        equippedWeapon: updatedEquippedWeapon,
        equippedItemId: updatedEquippedItemId,
        cratesOpened: player.cratesOpened + 1,
      },
      logMessage,
      logType: 'loot',
      lootedItemName: crate.weaponReward.name,
    };
  }

  // Fallback
  return {
    updatedPlayer: {
      ...player,
      cratesOpened: player.cratesOpened + 1,
    },
    logMessage: `🐾 ${fetchingPet.name} abrió una caja de suministros.`,
    logType: 'info',
    lootedItemName: 'Suministro',
  };
}

/**
 * 3. Procesa la recolección de un objeto descartado en el suelo (DroppedItem).
 * AISLAMIENTO ESTRICTO:
 * - Si es botiquín / salud: aplica curación al instante y NO lo añade a la mochila.
 * - Si es munición: recarga balas de armas en mochila y NO altera la salud.
 * - Si es arma o llave: añade a la mochila (auto-equipa si procede) y NO altera la salud.
 */
export function applyDroppedItemPickup(
  dropped: DroppedItem,
  player: Player
): { updatedPlayer: Player; logMessage: string; logType: 'loot' | 'info' } {
  const item = dropped.item;

  // 1. Si es curación (botiquín / kit médico)
  if (item.category === 'health' || item.type === 'medkit') {
    const healAmount = item.healValue ?? 40;
    const healedHp = Math.min(player.maxHp, player.hp + healAmount);

    return {
      updatedPlayer: {
        ...player,
        hp: healedHp,
      },
      logMessage: `¡Has usado ${item.name}! +${healAmount} HP restaurados al instante.`,
      logType: 'loot',
    };
  }

  // 2. Si es munición
  if (item.category === 'ammo' || item.type === 'ammo') {
    const ammoAmount = item.ammo > 0 ? item.ammo : 45;
    const { updatedInv, updatedEquipped } = refillPlayerAmmo(player, ammoAmount);

    return {
      updatedPlayer: {
        ...player,
        // SALUD ESTRICTAMENTE INTACTA
        hp: player.hp,
        inventory: updatedInv,
        equippedWeapon: updatedEquipped,
      },
      logMessage: `¡Has recogido ${item.name}! +${ammoAmount} proyectiles cargados.`,
      logType: 'loot',
    };
  }

  // 3. Si es arma o ítem de misión
  const currentInv = player.inventory || getDefaultInventoryForRole(player.role);
  const updatedInv = [...currentInv, item];
  const currentTier = player.equippedWeapon?.tier ?? 0;
  const isCurrentlyFists = player.equippedWeapon?.weaponType === 'fists' || currentTier === 0;
  const shouldAutoEquip = isCurrentlyFists || item.tier > currentTier;

  return {
    updatedPlayer: {
      ...player,
      // SALUD ESTRICTAMENTE INTACTA (cero curación)
      hp: player.hp,
      inventory: updatedInv,
      equippedWeapon: shouldAutoEquip ? inventoryItemToWeapon(item) : player.equippedWeapon,
      equippedItemId: shouldAutoEquip ? item.id : player.equippedItemId,
    },
    logMessage: `¡Has recogido ${item.name} (Tier ${item.tier})! ${
      shouldAutoEquip ? 'Auto-equipada.' : 'Guardada en la mochila.'
    }`,
    logType: 'loot',
  };
}
