export type PlayerRole = 'medic' | 'tank' | 'scout' | 'marksman';

export type GameStatus = 'lobby' | 'playing' | 'victory' | 'defeat' | 'cancelled';

export type MovementMode = 'gps' | 'manual';

export type PlayerSpeed = 'slow' | 'normal' | 'fast' | 'very_fast';

export type StructureType = 'hospital' | 'shelter';

export interface MapStructure {
  id: string;
  type: StructureType;
  name: string;
  lat: number;
  lng: number;
  radius: number; // Radio de interacción en metros
}

export type PlayerStatus = 'active' | 'critically_wounded' | 'dead';

export const PLAYER_SPEED_MPS: Record<PlayerSpeed, number> = {
  slow: 0.8,      // ~3 km/h (paso relajado / sigilo)
  normal: 1.4,    // ~5 km/h (paso humano estándar)
  fast: 2.8,      // ~10 km/h (trote ligero)
  very_fast: 4.5, // ~16 km/h (sprint)
};

export type CrateType = 'medkit' | 'ammo' | 'rifle' | 'shotgun' | 'melee' | 'rocket_launcher' | 'grenade';

export type WeaponType = 
  | 'rocket_launcher' // Nivel 7 (Tier más alto)
  | 'grenade'         // Nivel 6
  | 'rifle'           // Nivel 5 (Fusil / Metralleta)
  | 'shotgun'         // Nivel 4
  | 'pistol'          // Nivel 3
  | 'axe'             // Nivel 2 (Melé fuerte)
  | 'knife';          // Nivel 1 (Melé básico / infinito)

export type ItemCategory = 'weapon' | 'key_item';

export interface InventoryItem {
  id: string;             // UUID único de la instancia
  type: WeaponType | string;
  name: string;
  category: ItemCategory;
  tier: number;           // 1 (menor fuerza) a 7 (mayor fuerza)
  damage: number;         // Daño por impacto
  cadenceMs: number;      // Tiempo entre disparos/golpes
  ammo: number;           // Munición actual (-1 para infinito como cuchillo)
  maxAmmo: number;        // Capacidad por unidad
  durability?: number;    // -1 para infinito
  isInfinite?: boolean;   // true para cuchillo
  rangeMeters?: number;   // Alcance efectivo en metros
  iconName?: string;      // Nombre de icono
}

export interface DroppedItem {
  id: string;
  item: InventoryItem;
  lat: number;
  lng: number;
  droppedAt: number;
  droppedBy?: string;
}

export const MAX_INVENTORY_SLOTS = 4;

export type PetType = 
  | 'dog'            // Perro Guardián
  | 'drone'          // Dron Táctico
  | 'electric_mouse' // Roedor Eléctrico (Pikachu)
  | 'rabbit'         // Conejo Veloz
  | 'cat'            // Gato Callejero
  | 'med_bot';       // Mini Robot Médico

export interface Pet {
  id: string;               // UUID de la mascota
  type: PetType;
  name: string;
  icon: string;             // Emoji / SVG del compañero
  hp: number;
  maxHp: number;
  damage: number;           // Daño pasivo continuo
  attackIntervalMs: number; // Cadencia de ataque automático
  fetchRadiusMeters: number;// Radio de recogida de loot
  isWounded: boolean;       // Estado desmayada / fuera de combate
}

export interface WildPet {
  id: string;
  pet: Pet;
  lat: number;
  lng: number;
  spawnedAt: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Player {
  id: string; // Database player ID
  userId: string;
  gameId: string;
  nickname: string;
  role: PlayerRole;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  lat: number;
  lng: number;
  damageDealt: number;
  revivesDone: number;
  cratesOpened: number;
  monsterKills: number;
  isHost?: boolean;
  equippedWeapon?: Weapon;
  equippedItemId?: string;
  inventory?: InventoryItem[];
  lastAttackTime?: number;
  isSlowed?: boolean;
  slowedUntil?: number;
  status?: PlayerStatus;
  isCriticallyWounded?: boolean;
  insideBuildingId?: string | null;
  insideBuildingType?: StructureType | null;
  inCombat?: boolean;
  fleeImmunityUntil?: number;
  pets?: Pet[];
}

export type MonsterState = 'patrol' | 'chase' | 'enraged' | 'dead' | 'defend_chest';

export interface Monster {
  lat: number;
  lng: number;
  hp: number;
  maxHp: number;
  state: MonsterState;
  targetPlayerId: string | null;
  speedMps: number;
  respawnTimeRemaining?: number; // 60s countdown
  isEnraged: boolean;
  lastAttackTime?: number;
  isRespawning?: boolean;
}

export const isMonsterAlive = (monster?: Monster | null): boolean => {
  if (!monster) return false;
  return (
    monster.hp > 0 &&
    monster.state !== 'dead' &&
    !monster.isRespawning &&
    !(monster.respawnTimeRemaining && monster.respawnTimeRemaining > 0)
  );
};

export interface Weapon {
  id: string;
  name: string;
  type: 'melee' | 'firearm';
  damage: number;
  rangeMeters: number;
  fireRateMs: number; // Attack interval in ms
  ammo: number; // -1 for infinite
  maxAmmo: number;
  iconName: string;
  tier?: number;
  weaponType?: WeaponType;
  isInfinite?: boolean;
  cadenceMs?: number;
  durability?: number;
}

export interface SupplyCrate {
  id: string;
  lat: number;
  lng: number;
  opened: boolean;
  droppedAt: number;
  crateType?: CrateType;
  weaponReward: Weapon;
  healReward: number;
  ammoReward: number;
}

export interface GhostPing {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  playerNickname: string;
  type: 'danger' | 'loot' | 'assist';
}

export interface GameRoom {
  id: string;
  code: string;
  hostId: string;
  name?: string;
  status: GameStatus;
  isPublic: boolean;
  movementMode: MovementMode;
  playerSpeed?: PlayerSpeed;
  playAreaRadius: number; // in meters
  centerLat: number;
  centerLng: number;
  treasureLat: number;
  treasureLng: number;
  chestPhase?: number;
  chestStep?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface ChestProgress {
  phase: number; // 1 | 2 | 3
  step: number;  // 0 | 1
}

export interface MatchStatEntry {
  id?: string;
  game_id: string;
  nickname: string;
  role: PlayerRole;
  damage_dealt: number;
  revives_done: number;
  crates_opened?: number;
  monster_kills?: number;
  won: boolean;
  score?: number;
  created_at?: string;
}

export interface TacticalLogMessage {
  id: string;
  timestamp: number;
  text: string;
  type: 'info' | 'combat' | 'warning' | 'loot' | 'victory' | 'defeat';
  count?: number;
}
