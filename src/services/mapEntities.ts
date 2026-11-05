import type {
  Pet,
  PetType,
  WildPet,
  Coordinates,
  SupplyCrate,
  CrateType,
  Weapon,
  WeaponType,
  Monster,
  DroppedItem,
  InventoryItem,
  MapStructure,
  Player,
} from '../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getRandomPointInCircle, getDistanceMeters, getBearing, getDestinationPoint } from './geoUtils';
import { WEAPON_REGISTRY, WEAPON_TIER_CONFIG } from './combatEngine';

/**
 * Emite un evento broadcast inmediato al canal de la sala cuando se engendra una entidad (cajas, mascotas o botín)
 */
export const broadcastSpawnEntity = async (
  channel: RealtimeChannel | null | undefined,
  entityType: 'crate' | 'pet' | 'dropped_item',
  entityData: any
) => {
  if (!channel) return;
  try {
    await channel.send({
      type: 'broadcast',
      event: 'entity_spawned',
      payload: {
        type: entityType,
        entity: entityData,
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    console.warn(`[mapEntities] Error al emitir broadcast entity_spawned (${entityType}):`, err);
  }
};

/**
 * Emite un evento broadcast inmediato al canal de la sala cuando se retira/recoge una entidad
 */
export const broadcastCollectEntity = async (
  channel: RealtimeChannel | null | undefined,
  entityType: 'crate' | 'pet' | 'dropped_item',
  entityId: string
) => {
  if (!channel) return;
  try {
    await channel.send({
      type: 'broadcast',
      event: 'entity_collected',
      payload: {
        type: entityType,
        entityId,
      },
    });
  } catch (err) {
    console.warn(`[mapEntities] Error al emitir broadcast entity_collected (${entityType}):`, err);
  }
};

/**
 * Radio de proximidad táctico para adopción/recolección de mascotas silvestres en el mapa (igualado al botín, 25m)
 */
export const PET_ADOPTION_RADIUS_METERS = 25;

/**
 * Capacidad máxima de mascotas en la comitiva activa por jugador
 */
export const MAX_PETS_PER_PLAYER = 3;

/**
 * Límite máximo de armas/loot sin recoger simultáneamente en el mapa (control de densidad)
 */
export const MAX_UNCLAIMED_LOOT = 3;

/**
 * Límite máximo de mascotas silvestres libres simultáneamente en el mapa (control de densidad)
 */
export const MAX_UNCLAIMED_WILD_PETS = 3;

/**
 * Determina si una mascota silvestre está activa en el terreno y disponible para adopción
 */
export function isWildPetActive(pet: WildPet | null | undefined): boolean {
  if (!pet) return false;
  return !pet.isTamed && !pet.isCollected;
}

/**
 * Determina si una caja de suministros o airdrop está activa en el mapa y no ha sido abierta o saqueada
 */
export function isSupplyCrateActive(crate: SupplyCrate | null | undefined): boolean {
  if (!crate) return false;
  return !crate.opened && !crate.isCollected && !crate.looted;
}

/**
 * Determina si un objeto/arma descartada en el suelo está activo y no ha sido recogido
 */
export function isDroppedItemActive(item: DroppedItem | null | undefined): boolean {
  if (!item) return false;
  return !item.isCollected;
}

export interface PetConfig {
  type: PetType;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  damage: number;
  attackIntervalMs: number;
  fetchRadiusMeters: number;
  description: string;
}

export const PET_CONFIGS: Record<PetType, PetConfig> = {
  dog: {
    type: 'dog',
    name: 'Perro Guardián',
    icon: '/assets/icons/pets/pet-dog.png',
    hp: 60,
    maxHp: 60,
    damage: 6,
    attackIntervalMs: 2000,
    fetchRadiusMeters: 25,
    description: 'Rastreo extendido: recoge loot hasta a 25 metros.',
  },
  drone: {
    type: 'drone',
    name: 'Dron Táctico',
    icon: '/assets/icons/pets/pet-drone.png',
    hp: 45,
    maxHp: 45,
    damage: 10,
    attackIntervalMs: 2500,
    fetchRadiusMeters: 18,
    description: 'Fuego aéreo continuo y visión táctica ampliada (+15m).',
  },
  electric_mouse: {
    type: 'electric_mouse',
    name: 'Roedor Eléctrico',
    icon: '/assets/icons/pets/pet-electric-mouse.png',
    hp: 50,
    maxHp: 50,
    damage: 8,
    attackIntervalMs: 1800,
    fetchRadiusMeters: 16,
    description: 'Descargas que pueden ralentizar el ataque del monstruo.',
  },
  rabbit: {
    type: 'rabbit',
    name: 'Conejo Veloz',
    icon: '/assets/icons/pets/pet-rabbit.png',
    hp: 40,
    maxHp: 40,
    damage: 4,
    attackIntervalMs: 1500,
    fetchRadiusMeters: 22,
    description: 'Velocidad máxima: se adelanta rápidamente para alcanzar cofres.',
  },
  cat: {
    type: 'cat',
    name: 'Gato Callejero',
    icon: '/assets/icons/pets/pet-cat.png',
    hp: 45,
    maxHp: 45,
    damage: 7,
    attackIntervalMs: 2000,
    fetchRadiusMeters: 16,
    description: 'Sigilo felino: otorga +10% evasión frente a ataques del monstruo.',
  },
  med_bot: {
    type: 'med_bot',
    name: 'Mini Robot Médico',
    icon: '/assets/icons/pets/pet-medbot.png',
    hp: 50,
    maxHp: 50,
    damage: 3,
    attackIntervalMs: 3000,
    fetchRadiusMeters: 15,
    description: 'Nanobots curativos: regenera +2 HP cada 5s fuera de combate.',
  },
};

/**
 * Crea una nueva instancia de mascota a partir de un tipo
 */
export function createPet(type: PetType): Pet {
  const cfg = PET_CONFIGS[type];
  return {
    id: crypto.randomUUID(),
    type: cfg.type,
    name: cfg.name,
    icon: cfg.icon,
    hp: cfg.hp,
    maxHp: cfg.maxHp,
    damage: cfg.damage,
    attackIntervalMs: cfg.attackIntervalMs,
    fetchRadiusMeters: cfg.fetchRadiusMeters,
    isWounded: false,
  };
}

/**
 * Spawnea mascotas silvestres en el área operativa del juego
 */
export function generateWildPets(
  center: Coordinates,
  playAreaRadius: number,
  count: number = 1
): WildPet[] {
  const petTypes: PetType[] = ['dog', 'drone', 'electric_mouse', 'rabbit', 'cat', 'med_bot'];
  const wildPets: WildPet[] = [];

  // Barajar tipos para máxima variedad
  const shuffledTypes = [...petTypes].sort(() => 0.5 - Math.random());

  const spawnCount = Math.max(1, count);

  for (let i = 0; i < spawnCount; i++) {
    const type = shuffledTypes[i % shuffledTypes.length];
    // Evitar que aparezcan exactamente en el centro o en el borde exterior
    const point = getRandomPointInCircle(center, playAreaRadius * 0.75);
    const pet = createPet(type);

    wildPets.push({
      id: `pet_${crypto.randomUUID()}`,
      pet,
      lat: point.lat,
      lng: point.lng,
      spawnedAt: Date.now(),
      isTamed: false,
      isCollected: false,
      interactionRadius: 25,
    });
  }

  return wildPets;
}

/**
 * Genera una única mascota silvestre aleatoria para los ciclos periódicos progresivos
 */
export function generateSingleWildPet(
  center: Coordinates,
  playAreaRadius: number,
  existingTypes: PetType[] = []
): WildPet {
  const petTypes: PetType[] = ['dog', 'drone', 'electric_mouse', 'rabbit', 'cat', 'med_bot'];
  const availableTypes = petTypes.filter((t) => !existingTypes.includes(t));
  const selectedType =
    availableTypes.length > 0
      ? availableTypes[Math.floor(Math.random() * availableTypes.length)]
      : petTypes[Math.floor(Math.random() * petTypes.length)];

  const point = getRandomPointInCircle(center, playAreaRadius * 0.75);
  return {
    id: `pet_${crypto.randomUUID()}`,
    pet: createPet(selectedType),
    lat: point.lat,
    lng: point.lng,
    spawnedAt: Date.now(),
    isTamed: false,
    isCollected: false,
    interactionRadius: 25,
  };
}

/**
 * Plantillas tácticas para cajas de suministros y airdrops
 */
export const CRATE_TEMPLATES: {
  type: CrateType;
  weapon?: Weapon;
  heal: number;
  ammo: number;
}[] = [
  { type: 'rocket_launcher', weapon: WEAPON_REGISTRY.rocket_launcher, heal: 0, ammo: 3 },
  { type: 'rifle', weapon: WEAPON_REGISTRY.rifle, heal: 0, ammo: 60 },
  { type: 'shotgun', weapon: WEAPON_REGISTRY.shotgun, heal: 0, ammo: 20 },
  { type: 'grenade', weapon: WEAPON_REGISTRY.grenade, heal: 0, ammo: 5 },
  { type: 'medkit', weapon: undefined, heal: 100, ammo: 0 },
  { type: 'ammo', weapon: undefined, heal: 0, ammo: 90 },
  { type: 'melee', weapon: WEAPON_REGISTRY.axe, heal: 0, ammo: 15 },
];

/**
 * Crea una nueva caja de suministros airdrop que desciende con paracaídas
 */
export function createAirdropCrate(
  center: Coordinates,
  playAreaRadius: number,
  forcedType?: CrateType
): SupplyCrate {
  const dropPoint = getRandomPointInCircle(center, playAreaRadius * 0.75);
  const template = forcedType
    ? CRATE_TEMPLATES.find((t) => t.type === forcedType) || CRATE_TEMPLATES[0]
    : CRATE_TEMPLATES[Math.floor(Math.random() * CRATE_TEMPLATES.length)];

  return {
    id: `crate_${crypto.randomUUID()}`,
    lat: dropPoint.lat,
    lng: dropPoint.lng,
    opened: false,
    isCollected: false,
    looted: false,
    radius: 40,
    droppedAt: Date.now(),
    crateType: template.type,
    weaponReward: template.weapon,
    healReward: template.heal,
    ammoReward: template.ammo,
    isAirdrop: true,
  };
}

/**
 * Genera el lote base mínimo inicial de cajas de suministros (ya sobre el terreno)
 */
export function generateInitialCrates(
  center: Coordinates,
  playAreaRadius: number,
  count: number = 3
): SupplyCrate[] {
  const crates: SupplyCrate[] = [];
  for (let i = 0; i < count; i++) {
    const template = CRATE_TEMPLATES[i % CRATE_TEMPLATES.length];
    const dropPoint = getRandomPointInCircle(center, playAreaRadius * 0.75);
    crates.push({
      id: `crate_${crypto.randomUUID()}`,
      lat: dropPoint.lat,
      lng: dropPoint.lng,
      opened: false,
      isCollected: false,
      looted: false,
      radius: 40,
      droppedAt: Date.now() - 15000, // Marcadas como ya aterrizadas para no animar el lote inicial
      crateType: template.type,
      weaponReward: template.weapon,
      healReward: template.heal,
      ammoReward: template.ammo,
      isAirdrop: false,
    });
  }
  return crates;
}

/**
 * Configuraciones de monstruos para cada fase secuencial de cofres
 */
export interface SequentialMonsterConfig {
  id: string;
  name: string;
  type: string;
  maxHp: number;
  speedMps: number;
}

export const SEQUENTIAL_MONSTER_CONFIGS: SequentialMonsterConfig[] = [
  {
    id: 'monster_1',
    name: 'Rastreador Sombrío',
    type: 'stalker',
    maxHp: 1200,
    speedMps: 2.8,
  },
  {
    id: 'monster_2',
    name: 'Devorador Alfa',
    type: 'alpha',
    maxHp: 1400,
    speedMps: 3.2,
  },
  {
    id: 'monster_3',
    name: 'Coloso de Sombra',
    type: 'colossus',
    maxHp: 1600,
    speedMps: 3.6,
  },
];

export interface MonsterVisualConfig {
  type: 'stalker' | 'alpha' | 'colossus';
  defaultName: string;
  label: string;
  icon: string;
  borderColor: string;
  glowColor: string;
  badgeBg: string;
  pingBg: string;
  coreBg: string;
  hpBarColor: string;
  hpBorderColor: string;
  scaleClass: string;
  threatLabel: string;
  threatBadgeBg: string;
  arenaHeaderBadgeBg: string;
  cardBorder: string;
  cardHitBorder: string;
  cardGlow: string;
  cardHitGlow: string;
  cardBgGradient: string;
  cardHeaderBg: string;
  cardHeaderBorder: string;
  cardBadgeBg: string;
  avatarBg: string;
  avatarBorder: string;
  avatarRadialGlow: string;
  eyeColor: string;
  hpBarGradient: string;
  hpBarCriticalGradient: string;
  accentTextColor: string;
}

/**
 * Obtiene la configuración visual, temática y cromática de cada monstruo secuencial
 */
export const getMonsterVisualConfig = (monster?: Monster | null): MonsterVisualConfig => {
  const key = monster?.type || monster?.id || '';

  if (key === 'monster_1' || key === 'stalker') {
    return {
      type: 'stalker',
      defaultName: 'Rastreador Sombrío',
      label: 'RASTREADOR SOMBRÍO',
      icon: '/assets/icons/monsters/monster-stalker.png',
      borderColor: 'border-red-500',
      glowColor: 'shadow-[0_0_15px_rgba(239,68,68,0.7)]',
      badgeBg: 'bg-red-950/80 text-red-300',
      pingBg: 'bg-red-600/30',
      coreBg: 'bg-red-950',
      hpBarColor: 'bg-red-500',
      hpBorderColor: 'border-red-500/40',
      scaleClass: '',
      threatLabel: 'AMENAZA: ACECHADOR',
      threatBadgeBg: 'bg-red-950/80 text-red-300 border-red-500/60',
      arenaHeaderBadgeBg: 'bg-red-950/80 border-red-500/60 text-red-200',
      cardBorder: 'border-red-500/60 hover:border-red-400',
      cardHitBorder: 'border-red-400',
      cardGlow: 'shadow-[0_0_30px_rgba(220,38,38,0.3)]',
      cardHitGlow: 'shadow-[0_0_40px_rgba(239,68,68,0.7)]',
      cardBgGradient: 'from-slate-900 via-slate-900/90 to-red-950/80',
      cardHeaderBg: 'bg-black/60',
      cardHeaderBorder: 'border-red-500/30',
      cardBadgeBg: 'bg-red-900/60 text-red-300 border-red-700/50',
      avatarBg: 'bg-red-950/60',
      avatarBorder: 'border-red-500/50',
      avatarRadialGlow: 'bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.25)_0%,transparent_70%)]',
      eyeColor: 'bg-red-400 shadow-[0_0_8px_#f87171]',
      hpBarGradient: 'from-red-700 to-red-500',
      hpBarCriticalGradient: 'from-red-600 to-orange-500',
      accentTextColor: 'text-red-400',
    };
  }

  if (key === 'monster_2' || key === 'alpha') {
    return {
      type: 'alpha',
      defaultName: 'Devorador Alfa',
      label: 'DEVORADOR ALFA',
      icon: '/assets/icons/monsters/monster-alpha.png',
      borderColor: 'border-purple-500',
      glowColor: 'shadow-[0_0_15px_rgba(168,85,247,0.7)]',
      badgeBg: 'bg-purple-950/80 text-purple-300',
      pingBg: 'bg-purple-600/30',
      coreBg: 'bg-purple-950',
      hpBarColor: 'bg-purple-500',
      hpBorderColor: 'border-purple-500/40',
      scaleClass: '',
      threatLabel: 'AMENAZA: ALFA',
      threatBadgeBg: 'bg-purple-950/80 text-purple-300 border-purple-500/60',
      arenaHeaderBadgeBg: 'bg-purple-950/80 border-purple-500/60 text-purple-200',
      cardBorder: 'border-purple-500/60 hover:border-purple-400',
      cardHitBorder: 'border-purple-400',
      cardGlow: 'shadow-[0_0_30px_rgba(168,85,247,0.3)]',
      cardHitGlow: 'shadow-[0_0_40px_rgba(168,85,247,0.7)]',
      cardBgGradient: 'from-slate-900 via-slate-900/90 to-purple-950/80',
      cardHeaderBg: 'bg-black/60',
      cardHeaderBorder: 'border-purple-500/30',
      cardBadgeBg: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
      avatarBg: 'bg-purple-950/60',
      avatarBorder: 'border-purple-500/50',
      avatarRadialGlow: 'bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.25)_0%,transparent_70%)]',
      eyeColor: 'bg-purple-400 shadow-[0_0_8px_#c084fc]',
      hpBarGradient: 'from-purple-700 to-purple-500',
      hpBarCriticalGradient: 'from-purple-600 to-pink-500',
      accentTextColor: 'text-purple-400',
    };
  }

  // monster_3, colossus o por defecto
  return {
    type: 'colossus',
    defaultName: 'Coloso de Sombra',
    label: 'COLOSO DE SOMBRA',
    icon: '/assets/icons/monsters/monster-colossus.png',
    borderColor: 'border-amber-500',
    glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.8)]',
    badgeBg: 'bg-amber-950/80 text-amber-300',
    pingBg: 'bg-amber-600/30',
    coreBg: 'bg-amber-950',
    hpBarColor: 'bg-amber-500',
    hpBorderColor: 'border-amber-500/40',
    scaleClass: 'scale-110',
    threatLabel: 'AMENAZA: TITÁN APEX',
    threatBadgeBg: 'bg-amber-950/80 text-amber-300 border-amber-500/60',
    arenaHeaderBadgeBg: 'bg-amber-950/80 border-amber-500/60 text-amber-200',
    cardBorder: 'border-amber-500/60 hover:border-amber-400',
    cardHitBorder: 'border-amber-400',
    cardGlow: 'shadow-[0_0_30px_rgba(245,158,11,0.35)]',
    cardHitGlow: 'shadow-[0_0_40px_rgba(245,158,11,0.8)]',
    cardBgGradient: 'from-slate-900 via-slate-900/90 to-amber-950/80',
    cardHeaderBg: 'bg-black/60',
    cardHeaderBorder: 'border-amber-500/30',
    cardBadgeBg: 'bg-amber-900/60 text-amber-300 border-amber-700/50',
    avatarBg: 'bg-amber-950/60',
    avatarBorder: 'border-amber-500/50',
    avatarRadialGlow: 'bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.25)_0%,transparent_70%)]',
    eyeColor: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
    hpBarGradient: 'from-amber-700 to-amber-500',
    hpBarCriticalGradient: 'from-amber-600 to-orange-500',
    accentTextColor: 'text-amber-400',
  };
};

/**
 * Genera el monstruo asociado a un cofre secuencial (1, 2 o 3)
 */
/**
 * Genera coordenadas de custodia para monstruos ancladas alrededor del cofre del tesoro (15m a 35m)
 */
export const spawnNearTreasure = (
  treasureLat: number,
  treasureLng: number,
  offsetMeters: number = 15 + Math.random() * 20
): Coordinates => {
  const angle = Math.random() * 2 * Math.PI;
  const latOffset = (offsetMeters * Math.cos(angle)) / 111139;
  const lngOffset = (offsetMeters * Math.sin(angle)) / (111139 * Math.cos((treasureLat * Math.PI) / 180));
  return {
    lat: treasureLat + latOffset,
    lng: treasureLng + lngOffset,
  };
};

/**
 * Crea una criatura adaptada a la fase secuencial del cofre, anclada en su custodia
 */
export function createSequentialMonster(
  chestIndex: number,
  center: Coordinates,
  playAreaRadius: number
): Monster {
  const safeIndex = Math.min(Math.max(chestIndex - 1, 0), SEQUENTIAL_MONSTER_CONFIGS.length - 1);
  const config = SEQUENTIAL_MONSTER_CONFIGS[safeIndex];
  // Anclado obligatoriamente en el tesoro o en un radio de custodia de 15 a 35 metros alrededor de sus coordenadas
  const offsetMeters = 15 + Math.random() * 20;
  const spawnPoint = spawnNearTreasure(center.lat, center.lng, offsetMeters);

  return {
    id: config.id,
    name: config.name,
    type: config.type,
    lat: spawnPoint.lat,
    lng: spawnPoint.lng,
    hp: config.maxHp,
    maxHp: config.maxHp,
    status: 'patrolling',
    state: 'patrol',
    targetPlayerId: null,
    speedMps: config.speedMps,
    isEnraged: false,
    isGuardingChest: true,
    lootDropped: false,
  };
}

/**
 * Genera el botín táctico (un arma de fuego escalada y una caja de vida/botiquín de 100 HP)
 * al ser derrotado un monstruo, aplicando un desfase geodésico de 2 a 3 metros (2.5m)
 * a lados opuestos (NE / SO) para impedir superposiciones con la criatura o entre objetos.
 */
export function generateMonsterLootDrop(
  monster: Monster,
  chestPhase: number = 1
): DroppedItem[] {
  if (
    typeof monster.lat !== 'number' ||
    typeof monster.lng !== 'number' ||
    isNaN(monster.lat) ||
    isNaN(monster.lng)
  ) {
    return [];
  }

  // Desfase geodésico de 2.5 metros:
  // - Arma al Este/Noreste (rumbo 45°)
  // - Caja de Vida al Oeste/Suroeste (rumbo 225°)
  const weaponCoords = getDestinationPoint({ lat: monster.lat, lng: monster.lng }, 2.5, 45);
  const medkitCoords = getDestinationPoint({ lat: monster.lat, lng: monster.lng }, 2.5, 225);

  // 1. Arma táctica escalada según la fase de combate activa
  const weaponPoolByPhase: Record<number, WeaponType[]> = {
    1: ['shotgun', 'rifle', 'pistol'],
    2: ['rifle', 'grenade', 'shotgun'],
    3: ['rocket_launcher', 'grenade', 'rifle'],
  };
  const phasePool = weaponPoolByPhase[chestPhase] || ['rifle', 'shotgun', 'grenade'];
  const chosenWeaponType = phasePool[Math.floor(Math.random() * phasePool.length)];
  const weaponTemplate = WEAPON_TIER_CONFIG[chosenWeaponType] || WEAPON_TIER_CONFIG.rifle;

  const weaponItem: InventoryItem = {
    ...weaponTemplate,
    id: `loot_weapon_${crypto.randomUUID()}`,
  };

  const weaponDrop: DroppedItem = {
    id: `drop_wpn_${crypto.randomUUID()}`,
    item: weaponItem,
    lat: weaponCoords.lat,
    lng: weaponCoords.lng,
    droppedAt: Date.now(),
    droppedBy: monster.name || 'Monstruo',
    isCollected: false,
  };

  // 2. Caja de Vida (Botiquín de campo significativo, restaurando 100 HP)
  const medkitItem: InventoryItem = {
    id: `loot_medkit_${crypto.randomUUID()}`,
    name: 'Botiquín Táctico de Campaña',
    type: 'medkit',
    category: 'health',
    tier: 1,
    damage: 0,
    cadenceMs: 0,
    ammo: 0,
    maxAmmo: 0,
    durability: -1,
    isInfinite: false,
    rangeMeters: 0,
    healValue: 100, // Curación profunda adaptada a la escala de 300 HP
    iconName: 'Heart',
  };

  const medkitDrop: DroppedItem = {
    id: `drop_med_${crypto.randomUUID()}`,
    item: medkitItem,
    lat: medkitCoords.lat,
    lng: medkitCoords.lng,
    droppedAt: Date.now(),
    droppedBy: monster.name || 'Monstruo',
    isCollected: false,
  };

  return [weaponDrop, medkitDrop];
}

/**
 * Genera una nueva ubicación válida dentro del área jugable para el siguiente cofre
 * garantizando una distancia mínima sustancial (mínimo 70m) con respecto a la ubicación del cofre anterior
 * y respecto a la posición actual del jugador, evitando reapariciones inmediatas sobre los cazadores.
 */
export function generateNextChestLocation(
  arg1: Coordinates,
  arg2: Coordinates | number,
  arg3?: Coordinates | number,
  playerLocation?: Coordinates
): Coordinates {
  let previousChest: Coordinates;
  let center: Coordinates;
  let radiusMeters: number;
  let playerLoc: Coordinates | undefined = playerLocation;

  if (typeof arg2 === 'number') {
    // Firma: (center, playAreaRadius, previousLocation, playerLocation)
    center = arg1;
    radiusMeters = arg2;
    previousChest = typeof arg3 === 'object' && arg3 !== null ? arg3 : arg1;
  } else {
    // Firma: (previousLocation, center, radiusMeters, playerLocation)
    previousChest = arg1;
    center = typeof arg2 === 'object' && arg2 !== null ? arg2 : arg1;
    radiusMeters = typeof arg3 === 'number' ? arg3 : 100;
  }

  // Sanitización estricta de radio y coordenadas
  if (!radiusMeters || radiusMeters <= 0 || isNaN(radiusMeters)) {
    radiusMeters = 100;
  }
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number' || isNaN(center.lat) || isNaN(center.lng) || (center.lat === 0 && center.lng === 0)) {
    if (previousChest && typeof previousChest.lat === 'number' && typeof previousChest.lng === 'number' && (previousChest.lat !== 0 || previousChest.lng !== 0)) {
      center = previousChest;
    } else {
      center = { lat: 37.4018, lng: -2.1565 };
    }
  }
  if (!previousChest || typeof previousChest.lat !== 'number' || typeof previousChest.lng !== 'number' || isNaN(previousChest.lat) || isNaN(previousChest.lng)) {
    previousChest = center;
  }

  // Separación mínima obligatoria: adaptada proporcionalmente al radio de la partida (mínimo 20m en 100m)
  const MIN_DISTANCE_FROM_PREVIOUS = Math.min(70, Math.max(Math.round(radiusMeters * 0.4), 20));
  let bestPoint = getRandomPointInCircle(center, radiusMeters * 0.85);
  let maxMinDist = -1;
  let attempts = 0;

  do {
    const candidate = getRandomPointInCircle(center, radiusMeters * 0.85);
    const distPrev = getDistanceMeters(candidate, previousChest);
    const distPlayer = playerLoc && typeof playerLoc.lat === 'number' && !isNaN(playerLoc.lat)
      ? getDistanceMeters(candidate, playerLoc)
      : Infinity;

    const minDist = Math.min(distPrev, distPlayer);
    if (minDist >= MIN_DISTANCE_FROM_PREVIOUS) {
      return candidate;
    }

    if (minDist > maxMinDist) {
      maxMinDist = minDist;
      bestPoint = candidate;
    }
    attempts++;
  } while (attempts < 50);

  // Si tras 50 intentos ningún punto superó MIN_DISTANCE_FROM_PREVIOUS, forzar determinísticamente un punto opuesto
  const fallbackMinDist = Math.min(40, radiusMeters * 0.4);
  if (maxMinDist < fallbackMinDist && previousChest.lat !== 0) {
    const bearing = getBearing(previousChest, center) || 180;
    return getDestinationPoint(previousChest, MIN_DISTANCE_FROM_PREVIOUS, bearing);
  }

  return bestPoint;
}

/**
 * Coordenadas de contingencia táctica predeterminadas para el Hospital de Campaña en Las Meriendas
 */
export const DEFAULT_HOSPITAL_COORDINATES: Coordinates = {
  lat: 37.401,
  lng: -2.1558,
};

/**
 * Radio de acción, protección y curación táctica predeterminado para el Hospital de Campaña (20 metros).
 * Proporciona un margen ajustado y ceñido a la edificación física.
 */
export const DEFAULT_HOSPITAL_RADIUS = 20;

/**
 * Evalúa de forma unificada e inclusiva si un jugador se encuentra en estado herido, crítico o incapacitado.
 * Salvaguarda contra discrepancias de nomenclatura, diferencias mayúsculas/minúsculas y umbrales de salud.
 */
export function isPlayerWoundedOrCritical(player?: Partial<Player> | null): boolean {
  if (!player) return false;

  // 1. Flag booleano explícito
  if (player.isCriticallyWounded === true) return true;

  // 2. Normalización de enumerados y cadenas de estado (insensible a mayúsculas/minúsculas)
  const statusStr = String(player.status || '').toLowerCase().trim();
  const criticalStatuses = [
    'critically_wounded',
    'wounded',
    'downed',
    'incapacitated',
    'dead',
    'herido',
    'herido de muerte',
    'crítico',
    'critico',
    'inmovilizado',
  ];
  if (criticalStatuses.includes(statusStr) || criticalStatuses.some((st) => statusStr.includes(st))) {
    return true;
  }

  // 3. Vitalidad por debajo del umbral crítico o cero (en Utopia, 0 o 1 HP activa estado herido)
  if (typeof player.hp === 'number' && !isNaN(player.hp)) {
    if (player.hp <= 1) {
      return true;
    }
    if (typeof player.maxHp === 'number' && player.maxHp > 0) {
      if (player.hp / player.maxHp <= 0.05) {
        return true;
      }
    }
  }

  // 4. Flags de compatibilidad adicionales
  if ((player as any).isWounded === true || (player as any).downed === true || (player as any).incapacitated === true) {
    return true;
  }

  return false;
}

/**
 * Encuentra el Hospital de Campaña único dentro de una colección de estructuras.
 */
export function resolveNearestHospital(
  structures: MapStructure[] | undefined | null,
  _playerPos?: Coordinates | undefined | null
): MapStructure | null {
  if (!structures || structures.length === 0) return null;
  return structures.find((s) => {
    const typeStr = String(s.type || '').toLowerCase().trim();
    const idStr = String(s.id || '').toLowerCase().trim();
    const nameStr = String(s.name || '').toLowerCase().trim();
    return (
      (typeStr === 'hospital' || idStr.includes('hospital') || nameStr.includes('hospital')) &&
      typeof s.lat === 'number' &&
      typeof s.lng === 'number' &&
      !isNaN(s.lat) &&
      !isNaN(s.lng) &&
      (s.lat !== 0 || s.lng !== 0)
    );
  }) || null;
}

/**
 * Localiza de forma defensiva y resiliente las coordenadas del Hospital de Campaña único.
 * Garantiza inmutabilidad geográfica: nunca varía ante transiciones de fase de cofres del tesoro.
 * 1. Búsqueda directa en estructuras activas del único Hospital de Campaña.
 * 2. Si el centro corresponde a Las Meriendas o estructuras no cargadas, retorna coordenadas maestras fijas.
 * 3. Fallback determinista anclado al centro operativo.
 */
export function resolveHospitalCoordinates(
  structures?: MapStructure[] | null,
  center?: Coordinates | null,
  playAreaRadius?: number | null,
  treasureLocation?: Coordinates | null,
  playerPos?: Coordinates | null
): Coordinates {
  // 1. Búsqueda defensiva en estructuras activas del único hospital de campaña
  if (Array.isArray(structures) && structures.length > 0) {
    const hospital = resolveNearestHospital(structures, playerPos);
    if (hospital) {
      return { lat: hospital.lat, lng: hospital.lng };
    }
  }

  // 2. Si el centro corresponde al sector Las Meriendas (con radio estándar >= 200m) o no se especifican coordenadas válidas, contingencia maestra
  if (
    !center ||
    ((!playAreaRadius || playAreaRadius >= 200) &&
      Math.abs(center.lat - 37.4018) < 0.05 &&
      Math.abs(center.lng - -2.1565) < 0.05)
  ) {
    return { ...DEFAULT_HOSPITAL_COORDINATES };
  }

  // 3. Fallback determinista anclado al centro operativo de la sala (fijo a 180° Sur)
  if (
    typeof center.lat === 'number' &&
    typeof center.lng === 'number' &&
    !isNaN(center.lat) &&
    !isNaN(center.lng) &&
    (center.lat !== 0 || center.lng !== 0)
  ) {
    const effectiveRadius = playAreaRadius && playAreaRadius > 0 ? playAreaRadius : 100;
    const hospitalBearing = 180;
    const hospitalDistance = Math.max(15, Math.min(effectiveRadius * 0.55, effectiveRadius - 15));
    const computedHospital = getDestinationPoint(center, hospitalDistance, hospitalBearing);

    if (
      computedHospital &&
      typeof computedHospital.lat === 'number' &&
      typeof computedHospital.lng === 'number' &&
      !isNaN(computedHospital.lat) &&
      !isNaN(computedHospital.lng) &&
      (computedHospital.lat !== 0 || computedHospital.lng !== 0)
    ) {
      return computedHospital;
    }
  }

  // 4. Contingencia fija de alta fiabilidad en Las Meriendas (garantiza destino válido)
  return { ...DEFAULT_HOSPITAL_COORDINATES };
}
