import type { Pet, PetType, WildPet, Coordinates } from '../types/game';
import { getRandomPointInCircle } from './geoUtils';

/**
 * Radio de proximidad táctico para adopción/recolección de mascotas silvestres en el mapa (igualado al botín, 25m)
 */
export const PET_ADOPTION_RADIUS_METERS = 25;

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
 * Spawnea aleatoriamente entre 4 y 6 mascotas silvestres en el área operativa del juego
 */
export function generateWildPets(
  center: Coordinates,
  playAreaRadius: number,
  count: number = 5
): WildPet[] {
  const petTypes: PetType[] = ['dog', 'drone', 'electric_mouse', 'rabbit', 'cat', 'med_bot'];
  const wildPets: WildPet[] = [];

  // Barajar tipos para máxima variedad
  const shuffledTypes = [...petTypes].sort(() => 0.5 - Math.random());

  const spawnCount = Math.max(4, Math.min(6, count));

  for (let i = 0; i < spawnCount; i++) {
    const type = shuffledTypes[i % shuffledTypes.length];
    // Evitar que aparezcan exactamente en el centro o en el borde exterior
    const point = getRandomPointInCircle(center, playAreaRadius * 0.75);
    const pet = createPet(type);

    wildPets.push({
      id: crypto.randomUUID(),
      pet,
      lat: point.lat,
      lng: point.lng,
      spawnedAt: Date.now(),
    });
  }

  return wildPets;
}
