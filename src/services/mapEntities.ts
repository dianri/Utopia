import type { Pet, PetType, WildPet, Coordinates, SupplyCrate, CrateType, Weapon } from '../types/game';
import { getRandomPointInCircle } from './geoUtils';
import { WEAPON_REGISTRY } from './combatEngine';

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
    icon: '🐕',
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
    icon: '🛸',
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
    icon: '⚡',
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
    icon: '🐇',
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
    icon: '🐈',
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
    icon: '🤖',
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
