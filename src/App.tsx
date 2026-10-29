import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, ensureAnonymousAuth } from './lib/supabase';
import type {
  GameRoom,
  Player,
  Monster,
  SupplyCrate,
  CrateType,
  GhostPing,
  TacticalLogMessage,
  MovementMode,
  PlayerRole,
  PlayerSpeed,
  Coordinates,
  MapStructure,
  StructureType,
  Weapon,
  WeaponType,
  InventoryItem,
  DroppedItem,
  Pet,
  WildPet,
  PlayerStatus,
} from './types/game';
import { PLAYER_SPEED_MPS, DEFAULT_PLAYER_SPEED, isMonsterAlive } from './types/game';
import {
  DEFAULT_WEAPONS_BY_ROLE,
  WEAPON_REGISTRY,
  getMaxHpForRole,
  getModifiedWeaponStats,
  getReviveDistanceMeters,
  getReviveDurationSeconds,
  createInventoryItem,
  inventoryItemToWeapon,
  getDefaultInventoryForRole,
  getBestWeaponInInventory,
  WEAPON_TIER_CONFIG,
} from './services/combatEngine';
import {
  applyCratePickup,
  applyPetCratePickup,
  applyDroppedItemPickup,
} from './services/lootService';
import {
  getDistanceMeters,
  getRandomPointInCircle,
  getRandomSpawnPointInPlayArea,
  getBearing,
  getDestinationPoint,
} from './services/geoUtils';
import { generateMapStructures } from './services/mapStructures';
import {
  generateWildPets,
  generateSingleWildPet,
  createAirdropCrate,
  generateInitialCrates,
  createSequentialMonster,
  generateNextChestLocation,
  PET_ADOPTION_RADIUS_METERS,
  MAX_PETS_PER_PLAYER,
  MAX_UNCLAIMED_LOOT,
  MAX_UNCLAIMED_WILD_PETS,
} from './services/mapEntities';
import { soundEffects } from './services/soundEffects';
import { MonsterAIController } from './services/monsterAI';
import { useGameRealtime } from './hooks/useGameRealtime';
import { useGeolocation } from './hooks/useGeolocation';
import { useCombatLoop } from './hooks/useCombatLoop';

import { GameMap } from './components/GameMap';
import { TacticalHeader } from './components/HUD/TacticalHeader';
import { WeaponWheel } from './components/HUD/WeaponWheel';
import { RoleSkillButton } from './components/HUD/RoleSkillButton';
import { ChestCountdown } from './components/HUD/ChestCountdown';
import { CombatLog } from './components/HUD/CombatLog';
import { GhostOverlay } from './components/HUD/GhostOverlay';
import { CriticallyWoundedOverlay } from './components/HUD/CriticallyWoundedOverlay';
import { IndoorStatusBanner } from './components/HUD/IndoorStatusBanner';
import { BackpackModal } from './components/HUD/BackpackModal';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CreateRoomModal } from './components/Lobby/CreateRoomModal';
import { JoinRoomModal } from './components/Lobby/JoinRoomModal';
import { WaitingRoom } from './components/Lobby/WaitingRoom';
import { GameExplorer, type ActiveGameItem } from './components/Lobby/GameExplorer';

import { VictoryModal } from './components/PostGame/VictoryModal';
import { DefeatModal } from './components/PostGame/DefeatModal';
import { LeaderboardModal } from './components/PostGame/LeaderboardModal';

import { CombatArena } from './components/Combat/CombatArena';
import { PvPArena } from './components/Combat/PvPArena';
import { HospitalModal } from './components/Hospital/HospitalModal';
import { ChestLockModal } from './components/Chest/ChestLockModal';

import { Play, Users, Trophy, Footprints } from 'lucide-react';

export const savePlayerSessionSnapshot = (
  gameId: string,
  player: Player,
  playerSpeed?: PlayerSpeed
) => {
  try {
    let resolvedSpeed: PlayerSpeed = playerSpeed || DEFAULT_PLAYER_SPEED;
    if (!playerSpeed) {
      const prevRaw =
        sessionStorage.getItem(`utopia_player_session_${gameId}`) ||
        localStorage.getItem(`utopia_player_session_${gameId}`);
      if (prevRaw) {
        try {
          const parsed = JSON.parse(prevRaw);
          if (parsed.playerSpeed) {
            resolvedSpeed = parsed.playerSpeed;
          }
        } catch {}
      }
    }

    const snapshot = {
      id: player.id,
      userId: player.userId,
      gameId,
      nickname: player.nickname,
      role: player.role,
      lat: player.lat,
      lng: player.lng,
      hp: player.hp,
      maxHp: player.maxHp,
      status:
        player.status ||
        (player.hp <= 0 || player.isCriticallyWounded
          ? 'critically_wounded'
          : 'active'),
      isCriticallyWounded: !!(
        player.isCriticallyWounded ||
        player.status === 'critically_wounded' ||
        player.hp <= 0
      ),
      isAlive: player.isAlive,
      inventory: player.inventory,
      pets: player.pets,
      equippedWeapon: player.equippedWeapon,
      equippedItemId: player.equippedItemId || player.equippedWeapon?.id,
      playerSpeed: resolvedSpeed,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(`utopia_player_session_${gameId}`, JSON.stringify(snapshot));
    localStorage.setItem(`utopia_player_session_${gameId}`, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Error al guardar snapshot de sesión del jugador:', err);
  }
};

export const clearPlayerSessionSnapshot = (gameId: string) => {
  try {
    sessionStorage.removeItem(`utopia_player_session_${gameId}`);
    localStorage.removeItem(`utopia_player_session_${gameId}`);
  } catch {
    // Ignorar
  }
};

export const App: React.FC = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);

  // MONSTRUO Y ESTADO (SISTEMA SECUENCIAL)
  const [monster, setMonster] = useState<Monster>({
    id: 'monster_1',
    name: 'Rastreador Sombrío',
    type: 'stalker',
    lat: 0,
    lng: 0,
    hp: 1200,
    maxHp: 1200,
    state: 'patrol',
    targetPlayerId: null,
    speedMps: 2.8,
    isEnraged: false,
  });
  const [monsters, setMonsters] = useState<Monster[]>([
    {
      id: 'monster_1',
      name: 'Rastreador Sombrío',
      type: 'stalker',
      lat: 0,
      lng: 0,
      hp: 1200,
      maxHp: 1200,
      state: 'patrol',
      targetPlayerId: null,
      speedMps: 2.8,
      isEnraged: false,
    },
  ]);
  const monstersRef = useRef<Monster[]>(monsters);
  monstersRef.current = monsters;

  const [activeCombatMonsterId, setActiveCombatMonsterId] = useState<string | null>(null);
  const activeCombatMonsterIdRef = useRef<string | null>(null);
  activeCombatMonsterIdRef.current = activeCombatMonsterId;
  const monsterAIsRef = useRef<Map<string, MonsterAIController>>(new Map());

  const [crates, setCrates] = useState<SupplyCrate[]>([]);
  const [wildPets, setWildPets] = useState<WildPet[]>([]);
  const wildPetsRef = useRef<WildPet[]>([]);
  wildPetsRef.current = wildPets;
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>([]);
  const droppedItemsRef = useRef<DroppedItem[]>([]);
  droppedItemsRef.current = droppedItems;
  const [isBackpackOpen, setIsBackpackOpen] = useState<boolean>(false);
  const [ghostPings, setGhostPings] = useState<GhostPing[]>([]);
  const [combatLogs, setCombatLogs] = useState<TacticalLogMessage[]>([]);

  // RADAR Y HABILIDADES DE CLASE
  const [isRadarActive, setIsRadarActive] = useState<boolean>(false);
  const [radarCooldown, setRadarCooldown] = useState<number>(0);
  const [radarRemaining, setRadarRemaining] = useState<number>(0);
  const [isRoleSkillActive, setIsRoleSkillActive] = useState<boolean>(false);
  const [roleSkillCooldown, setRoleSkillCooldown] = useState<number>(0);
  const [roleSkillRemaining, setRoleSkillRemaining] = useState<number>(0);

  const isRoleSkillActiveRef = useRef<boolean>(false);
  isRoleSkillActiveRef.current = isRoleSkillActive;

  // COFRE Y EXTRACCIÓN (30s)
  const [chestCountdown, setChestCountdown] = useState<number>(30);
  const [chestHoldersCount, setChestHoldersCount] = useState<number>(0);

  // MODO ARENA DE COMBATE TÁCTICO Y HUIDA
  const [isCombatArenaOpen, setIsCombatArenaOpen] = useState<boolean>(false);
  const isCombatArenaOpenRef = useRef<boolean>(false);
  isCombatArenaOpenRef.current = isCombatArenaOpen;
  const [fleeImmunityUntil, setFleeImmunityUntil] = useState<number>(0);
  const fleeImmunityUntilRef = useRef<number>(0);
  fleeImmunityUntilRef.current = fleeImmunityUntil;

  // MODO DUELO PVP JUGADOR CONTRA JUGADOR (TIEMPO REAL)
  const [isPvPModalOpen, setIsPvPModalOpen] = useState<boolean>(false);
  const isPvPModalOpenRef = useRef<boolean>(false);
  isPvPModalOpenRef.current = isPvPModalOpen;

  const [pvpOpponentPlayerId, setPvpOpponentPlayerId] = useState<string | null>(null);
  const pvpOpponentPlayerIdRef = useRef<string | null>(null);
  pvpOpponentPlayerIdRef.current = pvpOpponentPlayerId;

  const [pvpCombatId, setPvpCombatId] = useState<string | null>(null);
  const pvpCombatIdRef = useRef<string | null>(null);
  pvpCombatIdRef.current = pvpCombatId;

  const queuedMonsterRef = useRef<Monster | null>(null);
  const [queuedMonster, setQueuedMonster] = useState<Monster | null>(null);

  // MODAL TÁCTICO DEL HOSPITAL DE CAMPAÑA
  const [isHospitalModalOpen, setIsHospitalModalOpen] = useState<boolean>(false);
  const isHospitalModalOpenRef = useRef<boolean>(false);
  isHospitalModalOpenRef.current = isHospitalModalOpen;

  // COFRE MULTI-FASE COOPERATIVO (3 FASES, 2 PASOS C/U = 6 CERROJOS)
  const [currentChestIndex, setCurrentChestIndex] = useState<number>(1);
  const currentChestIndexRef = useRef<number>(1);
  currentChestIndexRef.current = currentChestIndex;

  const [chestPhase, setChestPhase] = useState<number>(1);
  const [chestStep, setChestStep] = useState<number>(0);
  const [isChestLockModalOpen, setIsChestLockModalOpen] = useState<boolean>(false);
  const [isChestInteractedGlobally, setIsChestInteractedGlobally] = useState<boolean>(false);

  const chestPhaseRef = useRef<number>(chestPhase);
  chestPhaseRef.current = chestPhase;
  const chestStepRef = useRef<number>(chestStep);
  chestStepRef.current = chestStep;
  const isChestLockModalOpenRef = useRef<boolean>(isChestLockModalOpen);
  isChestLockModalOpenRef.current = isChestLockModalOpen;
  const isChestInteractedGloballyRef = useRef<boolean>(isChestInteractedGlobally);
  isChestInteractedGloballyRef.current = isChestInteractedGlobally;
  const hasTriggeredChestOpenRef = useRef<boolean>(false);
  const [isChestTransitioning, setIsChestTransitioning] = useState<boolean>(false);
  const isChestTransitioningRef = useRef<boolean>(false);
  const chestTransitionCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDecryptedChestLocationRef = useRef<Coordinates | null>(null);

  // Reseteo y aislamiento estricto del progreso del cofre por partida (game.id)
  useEffect(() => {
    if (!room?.id) {
      setChestPhase(1);
      setChestStep(0);
      setIsChestLockModalOpen(false);
      setIsChestInteractedGlobally(false);
      hasTriggeredChestOpenRef.current = false;
      isChestTransitioningRef.current = false;
      setIsChestTransitioning(false);
      lastDecryptedChestLocationRef.current = null;
      if (chestTransitionCooldownTimerRef.current) {
        clearTimeout(chestTransitionCooldownTimerRef.current);
      }
      return;
    }

    const storageKey = `utopia_chest_progress_${room.id}`;
    let savedProgress: { phase: number; step: number } | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) savedProgress = JSON.parse(raw);
    } catch {
      // Ignorar error de parsing
    }

    // Inicializar fase y paso: prioridad a datos de la sala en DB, luego storage local de esa sala, o 1/0 por defecto
    const initialPhase = room.chestCurrentPhase ?? room.chestPhase ?? savedProgress?.phase ?? 1;
    const initialStep = room.chestUnlockedSteps ?? room.chestStep ?? savedProgress?.step ?? 0;

    setChestPhase(initialPhase);
    setChestStep(initialStep);
    setIsChestLockModalOpen(false);
    setIsChestInteractedGlobally(false);
  }, [room?.id]);

  // REANIMACIÓN
  const [revivingPlayerId, setRevivingPlayerId] = useState<string | null>(null);
  const [reviveProgress, setReviveProgress] = useState<number>(0);

  // MODALES
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [joinModalInitialCode, setJoinModalInitialCode] = useState<string>('');
  const [targetPrivateGame, setTargetPrivateGame] = useState<{ id: string; code: string; name?: string } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [stealthMode, setStealthMode] = useState<boolean>(soundEffects.isStealth());
  const [cancelledAlertMessage, setCancelledAlertMessage] = useState<string | null>(null);
  const [savedActiveRoomCode, setSavedActiveRoomCode] = useState<string | null>(() => {
    return localStorage.getItem('utopia_active_room');
  });

  const handleJoinRoomRef = useRef<((config: { code: string; nickname?: string; role?: PlayerRole }) => Promise<void>) | null>(null);
  const handleMapClickRef = useRef<((coords: Coordinates) => void) | null>(null);

  // REF DE LA IA DEL MONSTRUO (HOST)
  const monsterAIRef = useRef<MonsterAIController | null>(null);
  const monsterRef = useRef<Monster>(monster);
  monsterRef.current = monster;

  const playersRef = useRef<Player[]>(players);
  playersRef.current = players;

  const myPlayerRef = useRef<Player | null>(myPlayer);
  myPlayerRef.current = myPlayer;

  const roomRef = useRef<GameRoom | null>(room);
  roomRef.current = room;

  const cratesRef = useRef<SupplyCrate[]>(crates);
  cratesRef.current = crates;

  const chestCountdownRef = useRef<number>(chestCountdown);
  chestCountdownRef.current = chestCountdown;

  const chestHoldersCountRef = useRef<number>(chestHoldersCount);
  chestHoldersCountRef.current = chestHoldersCount;

  const lastPetCapacityWarningRef = useRef<number>(0);

  // ==========================================
  // PERSISTENCIA CONTINUA DE SESIÓN Y SUPABASE
  // ==========================================
  const lastDbSyncTimeRef = useRef<number>(0);
  const dbSyncTimeoutRef = useRef<any>(null);

  const syncPlayerToSupabase = useCallback(
    async (player: Player, immediate = false) => {
      if (!player || !player.id) return;

      const doSync = async () => {
        try {
          const updatePayload: Record<string, any> = {
            lat: player.lat,
            lng: player.lng,
            hp: player.hp,
            is_alive: player.isAlive,
            inventory: player.inventory || [],
            pets: player.pets || [],
            status:
              player.status ||
              (player.hp <= 0 || player.isCriticallyWounded
                ? 'critically_wounded'
                : 'active'),
          };

          await (supabase.from('players') as any)
            .update(updatePayload)
            .eq('id', player.id);
        } catch (err) {
          console.warn('Error al sincronizar estado del jugador con Supabase:', err);
        }
      };

      if (immediate) {
        if (dbSyncTimeoutRef.current) {
          clearTimeout(dbSyncTimeoutRef.current);
          dbSyncTimeoutRef.current = null;
        }
        lastDbSyncTimeRef.current = Date.now();
        await doSync();
        return;
      }

      const now = Date.now();
      if (now - lastDbSyncTimeRef.current >= 2000) {
        lastDbSyncTimeRef.current = now;
        if (dbSyncTimeoutRef.current) {
          clearTimeout(dbSyncTimeoutRef.current);
          dbSyncTimeoutRef.current = null;
        }
        doSync();
      } else {
        if (!dbSyncTimeoutRef.current) {
          dbSyncTimeoutRef.current = setTimeout(() => {
            dbSyncTimeoutRef.current = null;
            lastDbSyncTimeRef.current = Date.now();
            if (myPlayerRef.current) {
              doSync();
            }
          }, 2000);
        }
      }
    },
    []
  );

  const syncRoomEntitiesToSupabase = useCallback(
    async (
      roomId: string,
      entities: {
        crates?: SupplyCrate[];
        wildPets?: WildPet[];
        droppedItems?: DroppedItem[];
      }
    ) => {
      if (!roomId) return;
      try {
        const payload: Record<string, any> = {};
        if (entities.crates !== undefined) {
          const activeCrates = entities.crates.filter((c) => !c.opened);
          payload.active_crates = activeCrates;
          payload.active_loot = activeCrates;
        }
        if (entities.wildPets !== undefined) {
          payload.active_wild_pets = entities.wildPets;
        }
        if (entities.droppedItems !== undefined) {
          payload.active_dropped_items = entities.droppedItems;
        }

        await (supabase.from('games') as any).update(payload).eq('id', roomId);
      } catch (err) {
        console.warn('Error al sincronizar entidades de sala con Supabase:', err);
      }
    },
    []
  );

  // Guardar snapshot local inmediato ante cualquier cambio de estado del jugador
  useEffect(() => {
    if (myPlayer && room?.id) {
      savePlayerSessionSnapshot(room.id, myPlayer, room.playerSpeed);
    }
  }, [myPlayer, room?.id, room?.playerSpeed]);

  // Asegurar persistencia sincrónica ante cierre de pestaña o F5
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (myPlayerRef.current && roomRef.current?.id) {
        savePlayerSessionSnapshot(
          roomRef.current.id,
          myPlayerRef.current,
          roomRef.current.playerSpeed
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // ESTRUCTURAS TÁCTICAS EN EL MAPA (1 HOSPITAL Y 4 REFUGIOS)
  const structures = useMemo<MapStructure[]>(() => {
    if (!room) return [];
    return generateMapStructures(
      { lat: room.centerLat, lng: room.centerLng },
      room.playAreaRadius,
      { lat: room.treasureLat, lng: room.treasureLng }
    );
  }, [room?.centerLat, room?.centerLng, room?.playAreaRadius, room?.treasureLat, room?.treasureLng]);

  const structuresRef = useRef<MapStructure[]>(structures);
  structuresRef.current = structures;

  const isPlayerInSafeZone = useCallback((player: Player | null, mapStructures: MapStructure[]): boolean => {
    if (!player) return false;
    if (player.insideBuildingId) return true;
    if (player.insideBuildingType === 'hospital' || player.insideBuildingType === 'shelter') return true;
    if (player.lat == null || player.lng == null) return false;
    return mapStructures.some((s) => {
      const d = getDistanceMeters({ lat: player.lat, lng: player.lng }, { lat: s.lat, lng: s.lng });
      return d <= s.radius;
    });
  }, []);

  const hospitalStructure = useMemo(
    () => structures.find((s) => s.type === 'hospital') || null,
    [structures]
  );
  const hospitalStructureRef = useRef<MapStructure | null>(hospitalStructure);
  hospitalStructureRef.current = hospitalStructure;

  const currentBuilding = useMemo(
    () => structures.find((s) => s.id === myPlayer?.insideBuildingId) || null,
    [structures, myPlayer?.insideBuildingId]
  );

  const isSquadFullyHealed = useMemo(() => {
    if (!myPlayer) return false;
    const playerFull =
      myPlayer.hp >= (myPlayer.maxHp || 100) &&
      !myPlayer.isCriticallyWounded &&
      myPlayer.status !== 'critically_wounded';
    const petsFull =
      !myPlayer.pets ||
      myPlayer.pets.length === 0 ||
      myPlayer.pets.every((p) => !p.isWounded && p.hp >= (p.maxHp || 100));
    return playerFull && petsFull;
  }, [myPlayer]);

  // Logging táctico con descarte de duplicados y contador acumulativo
  const addLog = useCallback((text: string, type: TacticalLogMessage['type'] = 'info') => {
    setCombatLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.text === text && last.type === type) {
        // Actualizar timestamp y contador acumulativo sin apilar avisos repetidos
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          timestamp: Date.now(),
          count: (last.count || 1) + 1,
        };
        return updated;
      }
      const newMsg: TacticalLogMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        text,
        type,
        count: 1,
      };
      return [...prev.slice(-19), newMsg];
    });
  }, []);

  const handleDismissLog = useCallback((id: string) => {
    setCombatLogs((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // 1. INICIALIZAR SESIÓN ANÓNIMA, VERIFICAR SESIÓN ACTIVA Y DETECTAR URL PARAM ?room=CODE
  useEffect(() => {
    // Limpieza oportunista de partidas inactivas en segundo plano al cargar el lobby principal
    const runStaleCleanup = async () => {
      try {
        await (supabase.rpc as any)('cleanup_stale_games');
      } catch (err) {
        console.warn('No se pudo ejecutar cleanup_stale_games:', err);
      }
    };
    runStaleCleanup();

    ensureAnonymousAuth().then(async (uid) => {
      setCurrentUserId(uid);

      // Comprobar si existe una sala activa guardada en localStorage
      const activeCode = localStorage.getItem('utopia_active_room');
      if (activeCode) {
        try {
          const { data: activeGame } = await (supabase
            .from('games') as any)
            .select('id, code, status, ended_at')
            .eq('code', activeCode.toUpperCase())
            .in('status', ['lobby', 'playing'])
            .is('ended_at', null)
            .maybeSingle();

          if (activeGame && !activeGame.ended_at && (activeGame.status === 'playing' || activeGame.status === 'lobby')) {
            const { data: existingPlayer } = await (supabase
              .from('players') as any)
              .select('id')
              .eq('game_id', activeGame.id)
              .eq('user_id', uid)
              .maybeSingle();

            if (existingPlayer) {
              setSavedActiveRoomCode(activeGame.code);
            } else {
              localStorage.removeItem('utopia_active_room');
              if (activeGame.id) clearPlayerSessionSnapshot(activeGame.id);
              setSavedActiveRoomCode(null);
            }
          } else {
            localStorage.removeItem('utopia_active_room');
            setSavedActiveRoomCode(null);
          }
        } catch (err) {
          console.warn('Error al verificar sesión activa previa:', err);
        }
      }

      // Comprobar parámetro ?room=CODE en la URL
      const params = new URLSearchParams(window.location.search);
      const roomCodeParam = params.get('room');
      if (roomCodeParam) {
        const codeUpper = roomCodeParam.toUpperCase();
        try {
          const { data: urlGame } = await (supabase
            .from('games') as any)
            .select('id, code, status, ended_at')
            .eq('code', codeUpper)
            .in('status', ['lobby', 'playing'])
            .is('ended_at', null)
            .maybeSingle();

          if (urlGame && !urlGame.ended_at && (urlGame.status === 'playing' || urlGame.status === 'lobby')) {
            const { data: existingPlayer } = await (supabase
              .from('players') as any)
              .select('id')
              .eq('game_id', urlGame.id)
              .eq('user_id', uid)
              .maybeSingle();

            if (existingPlayer && handleJoinRoomRef.current) {
              // Reconexión automática directa si ya es participante registrado
              handleJoinRoomRef.current({ code: codeUpper });
              return;
            }
          } else {
            // La partida ya concluyó o no existe, limpiar parámetro de URL
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {
          // continuar a abrir el modal
        }
        setJoinModalInitialCode(codeUpper);
        setShowJoinModal(true);
      }
    });
  }, []);

  // Reacción ante cancelación remota de la partida por el anfitrión
  const handleRemoteGameCancelled = useCallback((reason: string = 'Misión abortada por el anfitrión') => {
    soundEffects.playAlarm();
    setCancelledAlertMessage(reason);
    monsterAIRef.current = null;
    soundEffects.stopAll();
    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);

    setTimeout(() => {
      setRoom(null);
      setMyPlayer(null);
      setPlayers([]);
      setCrates([]);
      setCancelledAlertMessage(null);
    }, 2000);
  }, []);

  // ==========================================
  // REALTIME SYNCHRONIZATION
  // ==========================================
  const realtime = useGameRealtime(
    room?.code ?? null,
    myPlayer?.id ?? null,
    currentUserId,
    {
      onMonsterUpdate: (updatedMonster) => {
        setMonster(updatedMonster);
        setMonsters((prev) => {
          const idx = prev.findIndex((m) => (m.id || 'default') === (updatedMonster.id || 'default'));
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = updatedMonster;
            return next;
          }
          return [updatedMonster];
        });
      },
      onMonstersUpdate: (updatedMonsters) => {
        setMonsters(updatedMonsters);
        if (activeCombatMonsterIdRef.current) {
          const duelMonster = updatedMonsters.find((m) => m.id === activeCombatMonsterIdRef.current);
          if (duelMonster) setMonster(duelMonster);
        } else if (updatedMonsters.length > 0) {
          setMonster(updatedMonsters[0]);
        }
      },
      onChestTransition: (payload) => {
        if (typeof payload.currentChestIndex === 'number') {
          // Activar período de gracia/enfriamiento de 5 segundos para que no se reabra en la posición anterior
          isChestTransitioningRef.current = true;
          setIsChestTransitioning(true);
          hasTriggeredChestOpenRef.current = true;
          if (chestTransitionCooldownTimerRef.current) {
            clearTimeout(chestTransitionCooldownTimerRef.current);
          }
          chestTransitionCooldownTimerRef.current = setTimeout(() => {
            isChestTransitioningRef.current = false;
            setIsChestTransitioning(false);
            hasTriggeredChestOpenRef.current = false;
          }, 5000);

          // Registrar coordenadas del cofre previo para obligar a alejarse > 25m
          const prevLat =
            roomRef.current?.treasureLat ??
            (roomRef.current as any)?.treasure_lat ??
            (roomRef.current as any)?.settings?.treasure_lat;
          const prevLng =
            roomRef.current?.treasureLng ??
            (roomRef.current as any)?.treasure_lng ??
            (roomRef.current as any)?.settings?.treasure_lng;
          if (prevLat && prevLng) {
            lastDecryptedChestLocationRef.current = { lat: prevLat, lng: prevLng };
          }

          setCurrentChestIndex(payload.currentChestIndex);
          currentChestIndexRef.current = payload.currentChestIndex;

          const updatedRoomState = roomRef.current
            ? {
                ...roomRef.current,
                currentChestIndex: payload.currentChestIndex,
                current_chest_index: payload.currentChestIndex,
                treasureLat: payload.treasureLat,
                treasureLng: payload.treasureLng,
                treasure_lat: payload.treasureLat,
                treasure_lng: payload.treasureLng,
                chestPhase: 1,
                chestStep: 0,
                chestUnlockedSteps: 0,
                chestCurrentPhase: 1,
                chestProgressPct: 0,
                settings: {
                  ...((roomRef.current as any).settings || {}),
                  treasure_lat: payload.treasureLat,
                  treasure_lng: payload.treasureLng,
                  current_chest_index: payload.currentChestIndex,
                },
              }
            : null;

          if (updatedRoomState) {
            roomRef.current = updatedRoomState;
            setRoom(updatedRoomState);
          } else {
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    currentChestIndex: payload.currentChestIndex,
                    current_chest_index: payload.currentChestIndex,
                    treasureLat: payload.treasureLat,
                    treasureLng: payload.treasureLng,
                    treasure_lat: payload.treasureLat,
                    treasure_lng: payload.treasureLng,
                    chestPhase: 1,
                    chestStep: 0,
                    chestUnlockedSteps: 0,
                    chestCurrentPhase: 1,
                    chestProgressPct: 0,
                    settings: {
                      ...((prev as any).settings || {}),
                      treasure_lat: payload.treasureLat,
                      treasure_lng: payload.treasureLng,
                      current_chest_index: payload.currentChestIndex,
                    },
                  }
                : null
            );
          }
          setChestPhase(1);
          setChestStep(0);
          chestPhaseRef.current = 1;
          chestStepRef.current = 0;
          setIsChestLockModalOpen(false);
          isChestLockModalOpenRef.current = false;
          setIsChestInteractedGlobally(false);
        }
        if (payload.monsters && payload.monsters.length > 0) {
          setMonsters(payload.monsters);
        } else if (payload.newMonster) {
          setMonsters((prev) => {
            const exists = prev.some((m) => m.id === payload.newMonster!.id);
            return exists ? prev : [...prev, payload.newMonster!];
          });
        }
        soundEffects.playMonsterRoar();
        addLog(
          `¡Cofre [${payload.currentChestIndex}/3] activo! Ha emergido un nuevo monstruo acechando en el terreno.`,
          'loot'
        );
      },
      onPlayerMove: ({
        playerId,
        userId,
        lat,
        lng,
        hp,
        isAlive,
        status,
        isCriticallyWounded,
        insideBuildingId,
        insideBuildingType,
        pets,
      }) => {
        setPlayers((prev) =>
          prev.map((p) => {
            const matches =
              (playerId && p.id === playerId) ||
              (userId && p.userId === userId);
            if (!matches) return p;
            // Solo permitir aumento de HP si el jugador está en el hospital; en cualquier otro caso, el movimiento no puede subir la salud
            const isHospital = insideBuildingType === 'hospital' || p.insideBuildingType === 'hospital';
            const resolvedHp =
              hp !== undefined
                ? isHospital
                  ? hp
                  : Math.min(p.hp, hp)
                : p.hp;
            return {
              ...p,
              lat,
              lng,
              hp: resolvedHp,
              isAlive: isAlive !== undefined ? isAlive : p.isAlive,
              status: status !== undefined ? status : p.status,
              isCriticallyWounded:
                isCriticallyWounded !== undefined ? isCriticallyWounded : p.isCriticallyWounded,
              insideBuildingId:
                insideBuildingId !== undefined ? insideBuildingId : p.insideBuildingId,
              insideBuildingType:
                insideBuildingType !== undefined ? insideBuildingType : p.insideBuildingType,
              pets: pets !== undefined ? pets : p.pets,
            };
          })
        );
      },
      onPlayerDamaged: ({ playerId, damage, currentHp }) => {
        setPlayers((prev) =>
          prev.map((p) => {
            if (p.id === playerId) {
              // Monotónico: el daño NUNCA puede aumentar la vida actual
              const newHp = Math.min(p.hp, currentHp <= 0 ? 1 : currentHp);
              const criticallyWounded = newHp <= 1 || p.isCriticallyWounded;
              return {
                ...p,
                hp: newHp,
                isAlive: true,
                isCriticallyWounded: criticallyWounded,
                status: criticallyWounded ? 'critically_wounded' : (p.status || 'active'),
              };
            }
            return p;
          })
        );
        if (myPlayerRef.current?.id === playerId) {
          setMyPlayer((prev) => {
            if (!prev) return null;
            // Monotónico para jugador local: nunca sobreescribir con valor mayor
            const newHp = Math.min(prev.hp, currentHp <= 0 ? 1 : currentHp);
            const isWoundedLocal = newHp <= 1;
            if (isWoundedLocal) {
              setIsCombatArenaOpen(false);
            }
            return {
              ...prev,
              hp: newHp,
              isAlive: true,
              isCriticallyWounded: isWoundedLocal || prev.isCriticallyWounded,
              status:
                isWoundedLocal || prev.isCriticallyWounded
                  ? 'critically_wounded'
                  : (prev.status || 'active'),
            };
          });
          soundEffects.triggerDamageHaptics();
          soundEffects.playAlarm();
          if (currentHp <= 1) {
            addLog('¡ATAQUE CRÍTICO! Has quedado Herido de Muerte. ¡Corre al Hospital!', 'warning');
          } else {
            addLog(`¡Has recibido ${damage} de daño!`, 'combat');
          }
        }
      },
      onMonsterDamaged: ({ damage, fromPlayerId, currentHp, monsterId }) => {
        setMonsters((prev) =>
          prev.map((m) => {
            if ((monsterId && m.id === monsterId) || (!monsterId && (m.id === prev[0]?.id || prev.length === 1))) {
              return { ...m, hp: currentHp };
            }
            return m;
          })
        );
        if (!monsterId || monsterId === activeCombatMonsterIdRef.current || monsterId === monsterRef.current.id) {
          setMonster((prev) => ({ ...prev, hp: currentHp }));
        }
        if (fromPlayerId) {
          const targetMonsterAI = monsterId ? monsterAIsRef.current.get(monsterId) : monsterAIRef.current;
          if (targetMonsterAI) {
            targetMonsterAI.setAggroTarget(fromPlayerId);
          }
        }
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === fromPlayerId
              ? { ...p, damageDealt: p.damageDealt + damage }
              : p
          )
        );
      },
      onGhostPing: (ping) => {
        setGhostPings((prev) => [...prev, ping]);
        addLog(`Ping táctico de ${ping.playerNickname}`, 'info');
      },
      onRadarActivated: ({ activatedBy, expiresAt }) => {
        setIsRadarActive(true);
        const durationSec = Math.max(1, Math.round((expiresAt - Date.now()) / 1000));
        setRadarRemaining(durationSec);
        addLog(`¡${activatedBy} activó el Radar Táctico! Monstruo revelado`, 'info');
      },
      onCrateLooted: ({ crateId, playerNickname, weaponName }) => {
        setCrates((prev) =>
          prev.map((c) => (c.id === crateId ? { ...c, opened: true } : c))
        );
        addLog(`${playerNickname} saqueó un airdrop: ${weaponName}`, 'loot');
      },
      onPlayerRevived: ({ revivedPlayerId, reviverNickname }) => {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === revivedPlayerId
              ? { ...p, hp: Math.round(p.maxHp / 2), isAlive: true }
              : p
          )
        );
        if (myPlayerRef.current?.id === revivedPlayerId) {
          setMyPlayer((prev) =>
            prev ? { ...prev, hp: Math.round(prev.maxHp / 2), isAlive: true } : null
          );
          soundEffects.vibrate([100, 50, 100]);
          addLog(`¡Has sido reanimado por ${reviverNickname}!`, 'info');
        } else {
          addLog(`${reviverNickname} reanimó a un compañero de escuadra`, 'info');
        }
      },
      onChestCountdown: ({ secondsRemaining, holdersCount }) => {
        setChestCountdown(secondsRemaining);
        setChestHoldersCount(holdersCount);
      },
      onChestProgress: ({ phase, step, updatedByNickname }) => {
        setChestPhase(phase);
        setChestStep(step);
        if (room?.id) {
          try {
            localStorage.setItem(`utopia_chest_progress_${room.id}`, JSON.stringify({ phase, step }));
          } catch {
            // Ignorar error de storage
          }
        }
        if (updatedByNickname) {
          addLog(`¡${updatedByNickname} superó un cerrojo del cofre! (Fase ${phase}, Cerrojo ${step + 1}/2)`, 'loot');
        }
      },
      onChestInteracting: ({ isInteracting }) => {
        setIsChestInteractedGlobally(isInteracting);
        if (isInteracting) {
          addLog('¡Alerta de escuadra! Un compañero está manipulando el cofre. ¡El monstruo defenderá el tesoro!', 'warning');
        }
      },
      onItemDropped: (dropped) => {
        setDroppedItems((prev) => [...prev.filter((d) => d.id !== dropped.id), dropped]);
        soundEffects.playCrateLoot();
        addLog(`Objeto en el terreno: ${dropped.item.name} (T${dropped.item.tier}) soltado por ${dropped.droppedBy || 'un aliado'}.`, 'loot');
      },
      onItemPicked: ({ droppedItemId, playerId }) => {
        setDroppedItems((prev) => prev.filter((d) => d.id !== droppedItemId));
        const picker = playersRef.current.find((p) => p.id === playerId);
        if (picker && picker.id !== myPlayerRef.current?.id) {
          addLog(`${picker.nickname} recogió un objeto del terreno.`, 'info');
        }
      },
      onPetAdopted: ({ wildPetId, playerId, playerNickname, pet }) => {
        setWildPets((prev) => prev.filter((wp) => wp.id !== wildPetId));
        if (playerId !== myPlayerRef.current?.id) {
          addLog(`🐾 ${playerNickname} ha adoptado a ${pet.name} ${pet.icon}!`, 'info');
          setPlayers((prev) =>
            prev.map((p) => {
              if (p.id === playerId) {
                const existingPets = p.pets || [];
                return {
                  ...p,
                  pets: [...existingPets.filter((ep) => ep.id !== pet.id), pet],
                };
              }
              return p;
            })
          );
        }
      },
      onRequestStateSync: () => {
        // Si somos el Host, transmitimos el estado actual del juego al jugador recién incorporado
        if (myPlayerRef.current?.isHost) {
          realtime.broadcastFullStateSync({
            monster: monsterRef.current,
            monsters: monstersRef.current,
            crates: cratesRef.current,
            chestCountdown: chestCountdownRef.current,
            holdersCount: chestHoldersCountRef.current,
            chestPhase: chestPhaseRef.current,
            chestStep: chestStepRef.current,
            currentChestIndex: currentChestIndexRef.current,
            treasureLat: roomRef.current?.treasureLat,
            treasureLng: roomRef.current?.treasureLng,
            droppedItems: droppedItemsRef.current,
            wildPets: wildPetsRef.current,
            playerSpeed: roomRef.current?.playerSpeed,
          });
        }
      },
      onFullStateSync: (payload) => {
        // Jugador que se une en partida empezada recibe el estado completo del juego
        if (!myPlayerRef.current?.isHost) {
          if (payload.playerSpeed) {
            setRoom((prev) => (prev ? { ...prev, playerSpeed: payload.playerSpeed } : null));
          }
          if (payload.monster) {
            setMonster(payload.monster);
          }
          if (payload.monsters && payload.monsters.length > 0) {
            setMonsters(payload.monsters);
          }
          if (payload.currentChestIndex) {
            setCurrentChestIndex(payload.currentChestIndex);
            currentChestIndexRef.current = payload.currentChestIndex;
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    currentChestIndex: payload.currentChestIndex,
                    ...(payload.treasureLat && payload.treasureLng
                      ? { treasureLat: payload.treasureLat, treasureLng: payload.treasureLng }
                      : {}),
                  }
                : null
            );
          }
          if (payload.crates && payload.crates.length > 0) {
            setCrates(payload.crates);
          }
          if (payload.droppedItems) {
            setDroppedItems(payload.droppedItems);
          }
          if (payload.wildPets) {
            setWildPets(payload.wildPets);
          }
          if (typeof payload.chestCountdown === 'number') {
            setChestCountdown(payload.chestCountdown);
          }
          if (typeof payload.holdersCount === 'number') {
            setChestHoldersCount(payload.holdersCount);
          }
          if (typeof payload.chestPhase === 'number') {
            setChestPhase(payload.chestPhase);
          }
          if (typeof payload.chestStep === 'number') {
            setChestStep(payload.chestStep);
          }
          if (room?.id && typeof payload.chestPhase === 'number' && typeof payload.chestStep === 'number') {
            try {
              localStorage.setItem(
                `utopia_chest_progress_${room.id}`,
                JSON.stringify({ phase: payload.chestPhase, step: payload.chestStep })
              );
            } catch {
              // Ignorar error de storage
            }
          }
        }
      },
      onGameCancelled: (payload) => {
        handleRemoteGameCancelled(payload?.reason || 'Misión abortada por el anfitrión');
      },
      onGameVictory: ({ unlockedBy }) => {
        setChestPhase(3);
        setChestStep(2);
        chestPhaseRef.current = 3;
        chestStepRef.current = 2;
        setIsChestLockModalOpen(false);
        isChestLockModalOpenRef.current = false;
        setIsChestInteractedGlobally(false);
        if (room?.id) {
          try {
            localStorage.removeItem(`utopia_chest_progress_${room.id}`);
            clearPlayerSessionSnapshot(room.id);
          } catch {
            // Ignorar
          }

          // Persistencia autoritativa en DB para sellar la sala desde cualquier peer conectado
          (async () => {
            try {
              const { error: rpcErr } = await (supabase.rpc as any)('finish_game_victory', {
                p_game_id: room.id,
                p_winner_nickname: unlockedBy || 'Escuadra',
              });
              if (rpcErr) {
                console.warn('onGameVictory finish_game_victory fallback:', rpcErr);
                await (supabase.from('games') as any)
                  .update({
                    status: 'victory',
                    chest_unlocked_steps: 6,
                    chest_current_phase: 3,
                    chest_progress_pct: 100,
                    chest_opened: true,
                    winner: unlockedBy || 'Escuadra',
                    ended_at: new Date().toISOString(),
                  })
                  .eq('id', room.id);
              }
            } catch (err) {
              console.warn('Error al persistir victoria desde onGameVictory:', err);
            }
          })();
        }
        localStorage.removeItem('utopia_active_room');
        setSavedActiveRoomCode(null);
        setRoom((prev) => (prev ? { ...prev, status: 'victory', winner: unlockedBy || prev.winner, endedAt: new Date().toISOString() } : null));
        addLog(`¡${unlockedBy || 'La escuadra'} ha desbloqueado el sexto cerrojo! ¡TESORO ASEGURADO!`, 'victory');
        soundEffects.playVictoryFanfare();
      },
      onPvPEncounter: ({ combatId, player1Id, player2Id, attackerId, defenderId }: any) => {
        const me = myPlayerRef.current;
        if (!me) return;
        const p1 = player1Id || attackerId;
        const p2 = player2Id || defenderId;
        if (p1 === me.id || p2 === me.id) {
          const oppId = p1 === me.id ? p2 : p1;
          const allStructures = structuresRef.current;
          if (isPlayerInSafeZone(me, allStructures)) return; // Protección estricta en zonas seguras

          // 1. Expulsar de inmediato de la pantalla de desencriptación
          setIsChestLockModalOpen(false);
          isChestLockModalOpenRef.current = false;
          realtimeRef.current.broadcastChestInteracting(false);

          // 2. Detener cualquier desplazamiento residual
          if (typeof cancelMovementRef.current === 'function') {
            cancelMovementRef.current();
          }

          // 3. Abrir la arena de combate PvP fijando al rival
          setPvpCombatId(combatId);
          pvpCombatIdRef.current = combatId;
          setPvpOpponentPlayerId(oppId);
          pvpOpponentPlayerIdRef.current = oppId;
          setIsPvPModalOpen(true);
          isPvPModalOpenRef.current = true;

          // 4. Feedback sonoro y táctico de interrupción
          soundEffects.playAlarm();
          soundEffects.vibrate([100, 50, 150]);

          const opp = playersRef.current.find((p) => p.id === oppId);
          addLog(`¡EMBOSCADA! Duelo PvP iniciado por ${opp?.nickname || 'un agente rival'}. ¡Descifrado interrumpido!`, 'combat');
        }
      },
      onPvPEncounterEnd: ({ combatId }) => {
        if (pvpCombatIdRef.current === combatId) {
          setIsPvPModalOpen(false);
          isPvPModalOpenRef.current = false;
          setPvpCombatId(null);
          pvpCombatIdRef.current = null;
          setPvpOpponentPlayerId(null);
          pvpOpponentPlayerIdRef.current = null;
        }
      },
      onChestClaimed: ({ playerId, playerNickname, chestIndex }) => {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  chests_opened: (p.chests_opened || p.chestsOpened || 0) + 1,
                  chestsOpened: (p.chests_opened || p.chestsOpened || 0) + 1,
                }
              : p
          )
        );
        addLog(`¡${playerNickname} ha abierto y conquistado el Cofre [${chestIndex}/3]!`, 'loot');
      },
    },
    !!myPlayer?.isHost,
    room?.id ?? null,
    room?.status ?? null
  );

  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;

  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  const isHost = Boolean(
    myPlayer?.isHost || (room && myPlayer && room.hostId === myPlayer.userId)
  );

  // Solicitar sincronización de partida al conectarse al canal Realtime si la partida está en curso
  useEffect(() => {
    if (room?.status === 'playing' && !myPlayer?.isHost && realtime.isConnected) {
      realtime.broadcastRequestStateSync();
    }
  }, [room?.status, myPlayer?.isHost, realtime.isConnected]);

  // ==========================================
  // GEOLOCALIZACIÓN Y MOVIMIENTO (GPS O MANUAL)
  // ==========================================
  const lastMoveBroadcastTimeRef = useRef<number>(0);
  const cancelMovementRef = useRef<() => void>(() => {});

  const handlePositionChange = useCallback(
    (coords: Coordinates, isFinal?: boolean) => {
      if (!myPlayerRef.current) return;

      // Detección de entrada/salida a estructuras (Hospital o Refugios)
      let insideId: string | null = null;
      let insideType: StructureType | null = null;
      for (const s of structuresRef.current) {
        const d = getDistanceMeters(coords, { lat: s.lat, lng: s.lng });
        if (d <= s.radius) {
          insideId = s.id;
          insideType = s.type;
          break;
        }
      }

      // Notificación táctica si cambia el estado de interior/cobertura
      if (insideId !== myPlayerRef.current.insideBuildingId) {
        if (insideId) {
          const st = structuresRef.current.find((s) => s.id === insideId);
          if (st?.type === 'hospital') {
            const playerNeedsHealing =
              myPlayerRef.current.hp < (myPlayerRef.current.maxHp || 100) ||
              myPlayerRef.current.isCriticallyWounded ||
              myPlayerRef.current.status === 'critically_wounded';

            const petsNeedHealing = (myPlayerRef.current.pets || []).some(
              (p) => p.hp < (p.maxHp || 100) || p.isWounded
            );

            if (playerNeedsHealing || petsNeedHealing) {
              isHospitalModalOpenRef.current = true;
              if (typeof cancelMovementRef.current === 'function') {
                cancelMovementRef.current();
              }
              setIsHospitalModalOpen(true);
              addLog('Has entrado al Hospital de Campaña. Iniciando regeneración táctica.', 'info');
            }
            // Si la escuadra está al 100% no se emite toast flotante redundante;
            // el banner fijo superior IndoorStatusBanner muestra "Todos los signos vitales se encuentran al 100%"
          } else {
            addLog(`Has entrado a ${st?.name || 'un refugio'}. El monstruo pierde tu rastro.`, 'info');
          }
        } else if (myPlayerRef.current.insideBuildingId) {
          addLog('Has salido a la intemperie. Vuelves a ser visible.', 'info');
          setIsHospitalModalOpen(false);
          isHospitalModalOpenRef.current = false;
        }
      }

      // Verificación directa e inmediata en hospital si necesita curación
      if (insideType === 'hospital') {
        const playerNeedsHealing =
          myPlayerRef.current.hp < (myPlayerRef.current.maxHp || 100) ||
          myPlayerRef.current.isCriticallyWounded ||
          myPlayerRef.current.status === 'critically_wounded';

        const petsNeedHealing = (myPlayerRef.current.pets || []).some(
          (p) => p.hp < (p.maxHp || 100) || p.isWounded
        );

        if ((playerNeedsHealing || petsNeedHealing) && !isHospitalModalOpenRef.current) {
          isHospitalModalOpenRef.current = true;
          if (typeof cancelMovementRef.current === 'function') {
            cancelMovementRef.current();
          }
          setIsHospitalModalOpen(true);
        }
      }

      // Detección y apertura inmediata del cofre por proximidad táctica (<= 15m)
      const CHEST_TRIGGER_RADIUS = 15;
      const currentRoom = roomRef.current;
      const targetChestLat =
        (currentRoom as any)?.treasure_lat ??
        currentRoom?.treasureLat ??
        (currentRoom as any)?.settings?.treasure_lat ??
        (currentRoom as any)?.settings?.treasureLat ??
        currentRoom?.centerLat;

      const targetChestLng =
        (currentRoom as any)?.treasure_lng ??
        currentRoom?.treasureLng ??
        (currentRoom as any)?.settings?.treasure_lng ??
        (currentRoom as any)?.settings?.treasureLng ??
        currentRoom?.centerLng;

      const isAliveAndActive =
        myPlayerRef.current.isAlive &&
        !myPlayerRef.current.isCriticallyWounded &&
        myPlayerRef.current.status !== 'critically_wounded';

      if (
        targetChestLat != null &&
        targetChestLng != null &&
        targetChestLat !== 0 &&
        targetChestLng !== 0 &&
        currentRoom?.status === 'playing' &&
        isAliveAndActive
      ) {
        // Enfriamiento de transición de cofres o barrera de salida física del cofre previo (> 25m)
        if (isChestTransitioningRef.current || isChestTransitioning) {
          return;
        }
        if (lastDecryptedChestLocationRef.current) {
          const distToOldChest = getDistanceMeters(coords, lastDecryptedChestLocationRef.current);
          if (distToOldChest <= 25) {
            return;
          }
          // El jugador se ha desplazado más de 25m del cofre previo: liberar barrera
          lastDecryptedChestLocationRef.current = null;
        }

        const distanceToChest = getDistanceMeters(coords, { lat: targetChestLat, lng: targetChestLng });
        if (distanceToChest <= CHEST_TRIGGER_RADIUS) {
          // Comprobar si hay un monstruo hostil custodiando el perímetro del cofre (<= 25m)
          const allActiveMonsters =
            monstersRef.current && monstersRef.current.length > 0
              ? monstersRef.current
              : (monsterRef.current ? [monsterRef.current] : []);
          const isGuarded = allActiveMonsters.some((m) => {
            if (!isMonsterAlive(m) || (m as any).isDead) return false;
            const distMonsterToChest = getDistanceMeters(
              { lat: m.lat, lng: m.lng },
              { lat: targetChestLat, lng: targetChestLng }
            );
            return distMonsterToChest <= 25;
          });

          if (isGuarded) {
            if (isChestLockModalOpenRef.current) {
              setIsChestLockModalOpen(false);
              isChestLockModalOpenRef.current = false;
              realtime.broadcastChestInteracting(false);
            }
            return;
          }

          if (
            !isChestTransitioningRef.current &&
            !hasTriggeredChestOpenRef.current &&
            !isChestLockModalOpenRef.current &&
            !isCombatArenaOpenRef.current &&
            !isHospitalModalOpenRef.current &&
            !isPvPModalOpenRef.current
          ) {
            hasTriggeredChestOpenRef.current = true;
            isChestLockModalOpenRef.current = true;
            if (typeof cancelMovementRef.current === 'function') {
              cancelMovementRef.current();
            }
            setIsChestLockModalOpen(true);
            realtime.broadcastChestInteracting(true);
            soundEffects.playCrateLoot();
            addLog('¡En rango del cofre táctico! Iniciando desencriptación de cerrojos.', 'info');
          }
        } else if (distanceToChest > CHEST_TRIGGER_RADIUS && !isChestTransitioningRef.current) {
          hasTriggeredChestOpenRef.current = false;
        }
      }

      // Detección y desencadenante de Combate PvP Automático (<= 12 metros)
      const PVP_TRIGGER_RADIUS = 12;
      if (
        currentRoom?.status === 'playing' &&
        isAliveAndActive &&
        (myPlayerRef.current.status === 'active' || !myPlayerRef.current.status) &&
        Date.now() >= fleeImmunityUntilRef.current &&
        !isPvPModalOpenRef.current &&
        !isCombatArenaOpenRef.current &&
        !isHospitalModalOpenRef.current &&
        !isPlayerInSafeZone(myPlayerRef.current, structuresRef.current)
      ) {
        const otherPlayers = playersRef.current.filter((p) => p.id !== myPlayerRef.current?.id);
        for (const other of otherPlayers) {
          if (
            other.isAlive &&
            !other.isCriticallyWounded &&
            (other.status === 'active' || !other.status) &&
            other.lat != null &&
            other.lng != null &&
            !isPlayerInSafeZone(other, structuresRef.current)
          ) {
            const distToOther = getDistanceMeters(coords, { lat: other.lat, lng: other.lng });
            if (distToOther <= PVP_TRIGGER_RADIUS) {
              const combatId = [myPlayerRef.current.id, other.id].sort().join('_');
              setPvpCombatId(combatId);
              pvpCombatIdRef.current = combatId;
              setPvpOpponentPlayerId(other.id);
              pvpOpponentPlayerIdRef.current = other.id;
              setIsPvPModalOpen(true);
              isPvPModalOpenRef.current = true;

              // Expulsar de cualquier modal de desencriptación
              setIsChestLockModalOpen(false);
              isChestLockModalOpenRef.current = false;
              realtime.broadcastChestInteracting(false);

              if (typeof cancelMovementRef.current === 'function') {
                cancelMovementRef.current();
              }
              realtime.broadcastPvPEncounter({
                combatId,
                player1Id: myPlayerRef.current.id,
                player2Id: other.id,
                attackerId: myPlayerRef.current.id,
                defenderId: other.id,
              });
              addLog(`¡Encuentro hostil con ${other.nickname}! Duelo PvP iniciado.`, 'combat');
              break;
            }
          }
        }
      }

      setMyPlayer((prev) =>
        prev
          ? {
              ...prev,
              lat: coords.lat,
              lng: coords.lng,
              insideBuildingId: insideId,
              insideBuildingType: insideType,
            }
          : null
      );
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id
            ? {
                ...p,
                lat: coords.lat,
                lng: coords.lng,
                insideBuildingId: insideId,
                insideBuildingType: insideType,
              }
            : p
        )
      );

      // Transmitir posición a los compañeros de equipo en tiempo real
      // Envío inmediato si es posición final (llegada / fix GPS), o con throttling de 250ms durante animación Tap-to-Move
      const now = performance.now();
      if (isFinal || now - lastMoveBroadcastTimeRef.current >= 250) {
        lastMoveBroadcastTimeRef.current = now;
        realtime.broadcastPlayerMove(
          coords.lat,
          coords.lng,
          myPlayerRef.current.hp,
          myPlayerRef.current.isAlive,
          myPlayerRef.current.status,
          myPlayerRef.current.isCriticallyWounded,
          insideId,
          insideType,
          myPlayerRef.current.pets
        );
      }

      // Sincronizar posición persistente con Supabase (inmediato si es posición final, o throttled cada 2s)
      if (isFinal) {
        syncPlayerToSupabase({ ...myPlayerRef.current, lat: coords.lat, lng: coords.lng }, true);
      } else {
        syncPlayerToSupabase({ ...myPlayerRef.current, lat: coords.lat, lng: coords.lng }, false);
      }
    },
    [realtime, addLog, syncPlayerToSupabase]
  );

  // Determinar velocidad de sala autoritativa con soporte inmediato para reconexión temprana
  const effectiveBaseSpeedMps = useMemo(() => {
    if (room?.playerSpeed && PLAYER_SPEED_MPS[room.playerSpeed]) {
      return PLAYER_SPEED_MPS[room.playerSpeed];
    }
    // Si la sala está hidratándose tras recarga o reconexión, recuperar velocidad guardada en snapshot local
    if (savedActiveRoomCode) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('utopia_player_session_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const snap = JSON.parse(raw);
              if (snap.playerSpeed && PLAYER_SPEED_MPS[snap.playerSpeed as PlayerSpeed]) {
                return PLAYER_SPEED_MPS[snap.playerSpeed as PlayerSpeed];
              }
            }
          }
        }
      } catch {}
    }
    return PLAYER_SPEED_MPS[DEFAULT_PLAYER_SPEED];
  }, [room?.playerSpeed, savedActiveRoomCode]);

  const { setManualDestination, resetPosition, cancelMovement } = useGeolocation({
    mode: room?.movementMode ?? 'manual',
    baseSpeedMps: effectiveBaseSpeedMps,
    initialPosition:
      myPlayer?.lat != null && myPlayer?.lng != null
        ? { lat: myPlayer.lat, lng: myPlayer.lng }
        : room
        ? { lat: room.centerLat, lng: room.centerLng }
        : null,
    positionKey: room?.id ?? null,
    onPositionChange: handlePositionChange,
    isAlive: myPlayer?.isAlive ?? true,
    isSlowed: myPlayer?.isSlowed ?? false,
    speedMultiplier: fleeImmunityUntil > Date.now() ? 1.3 : 1,
    isMovingBlocked: isCombatArenaOpen || isHospitalModalOpen || isChestLockModalOpen || isPvPModalOpen,
  });
  cancelMovementRef.current = cancelMovement;

  // ==========================================
  // ESCUCHAR CAMBIOS EN BASE DE DATOS (SUPABASE REALTIME POSTGRES CHANGES)
  // ==========================================
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`db_sync:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${room.id}` },
        (payload) => {
          if (payload.new) {
            const updated = payload.new as any;
            const updatedSpeed: PlayerSpeed | undefined =
              (updated?.settings?.player_speed as PlayerSpeed) ??
              (updated?.player_speed as PlayerSpeed) ??
              undefined;
            const updatedChestIndex: number | undefined =
              typeof updated?.settings?.current_chest_index === 'number'
                ? updated.settings.current_chest_index
                : undefined;
            if (updatedChestIndex && updatedChestIndex !== currentChestIndexRef.current) {
              setCurrentChestIndex(updatedChestIndex);
              currentChestIndexRef.current = updatedChestIndex;
            }
            setRoom((prev) =>
              prev
                ? {
                    ...prev,
                    status: updated.status,
                    ...(updated.winner ? { winner: updated.winner } : {}),
                    ...(updated.ended_at ? { endedAt: updated.ended_at } : {}),
                    ...(updatedSpeed ? { playerSpeed: updatedSpeed } : {}),
                    ...(updated?.treasure_lat && updated?.treasure_lng
                      ? {
                          treasureLat: updated.treasure_lat,
                          treasureLng: updated.treasure_lng,
                          treasure_lat: updated.treasure_lat,
                          treasure_lng: updated.treasure_lng,
                        }
                      : {}),
                    ...(updatedChestIndex
                      ? { currentChestIndex: updatedChestIndex, current_chest_index: updatedChestIndex }
                      : {}),
                    ...(typeof updated?.chest_current_phase === 'number'
                      ? { chestPhase: updated.chest_current_phase, chestCurrentPhase: updated.chest_current_phase }
                      : {}),
                    ...(typeof updated?.chest_unlocked_steps === 'number'
                      ? { chestUnlockedSteps: updated.chest_unlocked_steps, chestStep: updated.chest_unlocked_steps % 2 }
                      : {}),
                    ...(typeof updated?.chest_progress_pct === 'number'
                      ? { chestProgressPct: updated.chest_progress_pct }
                      : {}),
                  }
                : null
            );
            if (updated.status === 'cancelled') {
              handleRemoteGameCancelled('Misión abortada por el anfitrión');
            } else if (updated.status === 'victory' || updated.status === 'defeat') {
              addLog(`Estado de partida: ${updated.status.toUpperCase()}`, 'info');
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${room.id}` },
        async () => {
          // Recargar lista de jugadores cuando alguien se une o actualiza
          const { data } = await (supabase.from('players') as any)
            .select('*')
            .eq('game_id', room.id);
          if (data) {
            setPlayers((prev) =>
              (data as any[]).map((d) => {
                if (myPlayerRef.current && (d.id === myPlayerRef.current.id || d.user_id === myPlayerRef.current.userId)) {
                  return myPlayerRef.current;
                }
                const existing = prev.find(
                  (p) => p.id === d.id || (d.user_id && p.userId === d.user_id)
                );
                const teammateRole = (d.role as PlayerRole) || existing?.role || 'medic';
                const teammateStatus = existing?.status || (d.status as PlayerStatus) || (d.hp <= 0 ? 'critically_wounded' : 'active');
                return {
                  id: d.id,
                  userId: d.user_id,
                  gameId: d.game_id,
                  nickname: d.nickname,
                  role: teammateRole,
                  hp: existing ? existing.hp : d.hp, // Preservar salud viva de combate en memoria
                  maxHp: d.max_hp,
                  isAlive: existing ? existing.isAlive : d.is_alive,
                  status: teammateStatus,
                  isCriticallyWounded: existing?.isCriticallyWounded ?? (teammateStatus === 'critically_wounded' || d.hp <= 0),
                  lat: existing?.lat ?? d.lat ?? room.centerLat,
                  lng: existing?.lng ?? d.lng ?? room.centerLng,
                  damageDealt: existing ? existing.damageDealt : d.damage_dealt,
                  revivesDone: existing ? existing.revivesDone : d.revives_done,
                  cratesOpened: existing ? existing.cratesOpened : d.crates_opened,
                  monsterKills: existing ? existing.monsterKills : d.monster_kills,
                  chestsOpened: d.chests_opened ?? existing?.chestsOpened ?? existing?.chests_opened ?? 0,
                  chests_opened: d.chests_opened ?? existing?.chests_opened ?? existing?.chestsOpened ?? 0,
                  isHost: d.user_id === room.hostId,
                  pets: existing?.pets ?? d.pets ?? [],
                  inventory: existing?.inventory ?? d.inventory ?? [],
                  equippedWeapon: existing?.equippedWeapon,
                  equippedItemId: existing?.equippedItemId,
                };
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, addLog]);

  // ==========================================
  // BUCLE DE IA DEL MONSTRUO (EJECUTADO EN EL CLIENTE HOST CADA 1000MS)
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing' || !isHost) return;

    const treasureCoords: Coordinates = {
      lat: room.treasureLat || room.centerLat,
      lng: room.treasureLng || room.centerLng,
    };
    const centerCoords: Coordinates = {
      lat: room.centerLat,
      lng: room.centerLng,
    };

    if (!monsterAIRef.current) {
      monsterAIRef.current = new MonsterAIController(treasureCoords, centerCoords, room.playAreaRadius);
    } else {
      monsterAIRef.current.setTreasureLocation(treasureCoords);
      monsterAIRef.current.setPlayArea(centerCoords, room.playAreaRadius);
    }

    const interval = window.setInterval(() => {
      const isContest =
        isChestInteractedGloballyRef.current ||
        isChestLockModalOpenRef.current;

      const currentMonsters = monstersRef.current.length > 0 ? monstersRef.current : [monsterRef.current];
      const updatedMonsters: Monster[] = [];

      for (const m of currentMonsters) {
        const mKey = m.id || 'monster_1';
        let ai = monsterAIsRef.current.get(mKey);
        if (!ai) {
          ai = new MonsterAIController(treasureCoords, centerCoords, room.playAreaRadius);
          monsterAIsRef.current.set(mKey, ai);
        } else {
          ai.setTreasureLocation(treasureCoords);
          ai.setPlayArea(centerCoords, room.playAreaRadius);
        }

        const result = ai.update(m, playersRef.current, isContest);
        updatedMonsters.push(result.updatedMonster);

        // Si el monstruo atacó a un jugador en el mapa
        if (result.attackedPlayerId && result.attackDamage > 0) {
          const victim = playersRef.current.find((p) => p.id === result.attackedPlayerId);
          if (victim) {
            // Si el jugador local está en la arena de combate, la arena ya ejecuta su propio bucle de daño periódico
            if (victim.id === myPlayerRef.current?.id && isCombatArenaOpenRef.current) {
              continue;
            }

            const isShielded = isRoleSkillActiveRef.current && victim.id === myPlayerRef.current?.id && myPlayerRef.current?.role === 'tank';
            const damageApplied = isShielded ? Math.round(result.attackDamage * 0.5) : result.attackDamage;

            // Protección secuencial de mascotas en el mapa
            const victimPets = (victim.id === myPlayerRef.current?.id ? myPlayerRef.current?.pets : victim.pets) || [];
            const activePetIndex = victimPets.findIndex((p) => !p.isWounded && p.hp > 0);

            if (activePetIndex !== -1) {
              const targetPet = victimPets[activePetIndex];
              const petRemainingHp = Math.max(0, targetPet.hp - damageApplied);
              const petIsWounded = petRemainingHp <= 0;
              const updatedPets = victimPets.map((p, idx) =>
                idx === activePetIndex ? { ...p, hp: petRemainingHp, isWounded: petIsWounded } : p
              );

              if (victim.id === myPlayerRef.current?.id) {
                setMyPlayer((prev) => (prev ? { ...prev, pets: updatedPets } : null));
                if (myPlayerRef.current) {
                  myPlayerRef.current = { ...myPlayerRef.current, pets: updatedPets };
                }
                soundEffects.triggerDamageHaptics();
                soundEffects.playAlarm();
                addLogRef.current?.(`¡${m.name || 'El monstruo'} atacó a tu mascota ${targetPet.name}! (-${damageApplied} HP)`, 'combat');
                if (petIsWounded) {
                  addLogRef.current?.(`¡${targetPet.name} ha caído herida! 💫 El escudo táctico pasa a la siguiente mascota.`, 'warning');
                }
              }

              setPlayers((prev) =>
                prev.map((p) => (p.id === victim.id ? { ...p, pets: updatedPets } : p))
              );
              continue;
            }
            const currentVictimHp = victim.id === myPlayerRef.current?.id && myPlayerRef.current ? myPlayerRef.current.hp : victim.hp;
            const calculatedHp = Math.max(0, currentVictimHp - damageApplied);
            const isWounded = calculatedHp <= 0 || calculatedHp === 1;
            const newHp = isWounded ? 1 : calculatedHp;
            const newStatus: PlayerStatus = isWounded ? 'critically_wounded' : (victim.status || 'active');

            realtimeRef.current.broadcastPlayerHit(victim.id, damageApplied, newHp);

            // Si el host es la víctima
            if (victim.id === myPlayerRef.current?.id) {
              setMyPlayer((prev) => (prev ? {
                ...prev,
                hp: newHp,
                isAlive: true,
                isCriticallyWounded: isWounded || prev.isCriticallyWounded,
                status: newStatus,
              } : null));

              // Sincronizar simultáneamente en la lista local
              setPlayers((prev) =>
                prev.map((p) =>
                  p.id === victim.id
                    ? { ...p, hp: newHp, isCriticallyWounded: isWounded || p.isCriticallyWounded, status: newStatus }
                    : p
                )
              );

              soundEffects.triggerDamageHaptics();
              soundEffects.playAlarm();
              if (isWounded) {
                addLogRef.current('¡ATAQUE CRÍTICO! Has quedado Herido de Muerte. ¡Corre al Hospital!', 'warning');
              } else {
                addLogRef.current(`¡Has recibido ${damageApplied} de daño!`, 'combat');
              }
            }
          }
        }

        if (result.justEnraged) {
          addLogRef.current(`¡${m.name || 'EL MONSTRUO'} SE HA ENFURECIDO (FASE 2)! RUGIDO Y VELOCIDAD +40%`, 'warning');
        }
        // Silent respawn: sin carteles ni toasts de reaparición
      }

      setMonsters(updatedMonsters);
      realtimeRef.current.broadcastMonstersUpdate(updatedMonsters);

      const focused =
        updatedMonsters.find((m) => m.id === activeCombatMonsterIdRef.current) || updatedMonsters[0];
      if (focused) {
        setMonster(focused);
        realtimeRef.current.broadcastMonsterUpdate(focused);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [room?.status, isHost, room?.treasureLat, room?.treasureLng, room?.centerLat, room?.centerLng]);

  // ==========================================
  // BUCLE DE COMBATE CONTINUO EN MOVIMIENTO (MANUAL Y AUTOMÁTICO)
  // ==========================================
  const { isFiringWeapon, manualAttack } = useCombatLoop({
    isPlaying: room?.status === 'playing' && !!myPlayer?.isAlive,
    myPlayer,
    monster,
    roomCenter: room ? { lat: room.centerLat, lng: room.centerLng } : undefined,
    isRoleSkillActive,
    onAttackMonster: (damage, newHp, weapon, now) => {
      realtimeRef.current.broadcastMonsterDamaged(damage, newHp);
      setMonster((prev) => ({ ...prev, hp: newHp }));

      if (myPlayerRef.current && monsterAIRef.current) {
        monsterAIRef.current.setAggroTarget(myPlayerRef.current.id);
      }

      setMyPlayer((prev) => {
        if (!prev) return null;

        const isInfinite = weapon.isInfinite || weapon.ammo === -1;
        const currentAmmo = weapon.ammo;
        const newAmmo = isInfinite ? -1 : Math.max(0, currentAmmo - 1);

        const currentInventory =
          prev.inventory && prev.inventory.length > 0
            ? prev.inventory
            : getDefaultInventoryForRole(prev.role);

        // Desgaste dinámico: si el arma no es infinita y agotó su munición/durabilidad
        if (!isInfinite && newAmmo <= 0) {
          const updatedInventory = currentInventory.filter((it) => it.id !== weapon.id);
          const nextWeaponItem = getBestWeaponInInventory(updatedInventory);
          const nextWeapon = inventoryItemToWeapon(nextWeaponItem);

          soundEffects.playAlarm();
          addLogRef.current(
            `¡${weapon.name} se ha roto/agotado! Equipando automáticamente ${nextWeaponItem.name} (Tier ${nextWeaponItem.tier}).`,
            'warning'
          );

          return {
            ...prev,
            lastAttackTime: now,
            damageDealt: prev.damageDealt + damage,
            inventory: updatedInventory,
            equippedWeapon: nextWeapon,
            equippedItemId: nextWeaponItem.id,
          };
        }

        // Actualizar munición restante en el inventario
        const updatedInventory = currentInventory.map((it) =>
          it.id === weapon.id
            ? {
                ...it,
                ammo: newAmmo,
                durability:
                  it.durability !== -1 && it.durability !== undefined
                    ? newAmmo
                    : it.durability,
              }
            : it
        );

        const updatedWeapon: Weapon = {
          ...weapon,
          ammo: newAmmo,
          durability:
            weapon.durability !== -1 && weapon.durability !== undefined
              ? newAmmo
              : weapon.durability,
        };

        return {
          ...prev,
          lastAttackTime: now,
          damageDealt: prev.damageDealt + damage,
          inventory: updatedInventory,
          equippedWeapon: updatedWeapon,
          equippedItemId: weapon.id,
        };
      });
    },
    onOutOfAmmo: (fallbackWeapon) => {
      setMyPlayer((prev) => {
        if (!prev) return null;
        const inv =
          prev.inventory && prev.inventory.length > 0
            ? prev.inventory
            : getDefaultInventoryForRole(prev.role);
        const nextWeaponItem = getBestWeaponInInventory(inv);
        const nextWeapon = inventoryItemToWeapon(nextWeaponItem);
        return {
          ...prev,
          equippedWeapon: nextWeapon,
          equippedItemId: nextWeaponItem.id,
        };
      });
    },
    onLog: (text, type) => {
      addLog(text, type);
    },
  });

  // ==========================================
  // ARENA DE COMBATE TÁCTICO: DETECCIÓN Y ENGANCHE EN TIEMPO REAL (< 20M)
  // COLA ESTRICTA 1V1 Y TRANSICIÓN SECUENCIAL
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing' || !myPlayer?.isAlive) return;

    const interval = setInterval(() => {
      const player = myPlayerRef.current;
      const allMonsters = monstersRef.current.length > 0 ? monstersRef.current : [monsterRef.current];

      if (
        !player ||
        !player.isAlive ||
        player.isCriticallyWounded ||
        player.status === 'critically_wounded' ||
        !!player.insideBuildingId
      ) {
        if (isCombatArenaOpen) setIsCombatArenaOpen(false);
        setActiveCombatMonsterId(null);
        activeCombatMonsterIdRef.current = null;
        return;
      }

      const now = Date.now();
      const inImmunity = fleeImmunityUntilRef.current > now;

      if (inImmunity) {
        if (isCombatArenaOpen) setIsCombatArenaOpen(false);
        setActiveCombatMonsterId(null);
        activeCombatMonsterIdRef.current = null;
        return;
      }

      const playerCoord: Coordinates = {
        lat: player.lat ?? room.centerLat,
        lng: player.lng ?? room.centerLng,
      };

      // Si actualmente está en combate en la arena (1v1 estricto)
      if (isCombatArenaOpen) {
        const currentDuelMonster =
          allMonsters.find((m) => m.id === activeCombatMonsterIdRef.current) || monsterRef.current;
        const isCurrentAlive = isMonsterAlive(currentDuelMonster);
        const distToCurrent = getDistanceMeters(playerCoord, currentDuelMonster);

        if (!isCurrentAlive) {
          // El monstruo actual ha caído. Transición secuencial si hay otro monstruo en rango <= 20m
          const otherLiving = allMonsters
            .filter((m) => m.id !== currentDuelMonster.id && isMonsterAlive(m))
            .map((m) => ({ monster: m, dist: getDistanceMeters(playerCoord, m) }))
            .filter((item) => item.dist <= 20)
            .sort((a, b) => a.dist - b.dist);

          if (otherLiving.length > 0) {
            const nextMonster = otherLiving[0].monster;
            setActiveCombatMonsterId(nextMonster.id || null);
            activeCombatMonsterIdRef.current = nextMonster.id || null;
            setMonster(nextMonster);
            soundEffects.playAlarm();
            addLog(`¡Monstruo caído! Transición táctica inmediata contra ${nextMonster.name || 'siguiente amenaza'}.`, 'combat');
          } else {
            setIsCombatArenaOpen(false);
            setActiveCombatMonsterId(null);
            activeCombatMonsterIdRef.current = null;
          }
        } else if (distToCurrent > 25) {
          // El monstruo o el jugador se han alejado más de 25m
          setIsCombatArenaOpen(false);
          setActiveCombatMonsterId(null);
          activeCombatMonsterIdRef.current = null;
        }
        return;
      }

      // Si NO está en combate: seleccionar el monstruo vivo más cercano a <= 20m
      const livingMonstersInRange = allMonsters
        .filter((m) => isMonsterAlive(m))
        .map((m) => ({ monster: m, dist: getDistanceMeters(playerCoord, m) }))
        .filter((item) => item.dist <= 20)
        .sort((a, b) => a.dist - b.dist);

      if (livingMonstersInRange.length > 0) {
        const targetMonster = livingMonstersInRange[0].monster;

        // Aislamiento Táctico y Burbuja de Duelo PvP: los monstruos no pueden interrumpir la pelea
        if (isPvPModalOpenRef.current) {
          if (queuedMonsterRef.current?.id !== targetMonster.id) {
            queuedMonsterRef.current = targetMonster;
            setQueuedMonster(targetMonster);
          }
          return;
        }

        setActiveCombatMonsterId(targetMonster.id || null);
        activeCombatMonsterIdRef.current = targetMonster.id || null;
        setMonster(targetMonster);
        setIsCombatArenaOpen(true);
        cancelMovement();

        if (isChestLockModalOpenRef.current) {
          setIsChestLockModalOpen(false);
          isChestLockModalOpenRef.current = false;
          realtimeRef.current.broadcastChestInteracting(false);
          addLog(
            `¡${targetMonster.name || 'El monstruo'} interrumpió la desencriptación del cofre! Entrando en combate táctico.`,
            'combat'
          );
        }
      }
    }, 300);

    return () => clearInterval(interval);
  }, [room?.status, room?.centerLat, room?.centerLng, isCombatArenaOpen, addLog]);

  // Manejadores de la Arena de Combate Táctico
  const handleArenaAttack = useCallback(
    (damage: number, newHp: number, weapon: Weapon) => {
      const now = Date.now();
      const currentTargetId = activeCombatMonsterIdRef.current || monsterRef.current.id;
      realtimeRef.current.broadcastMonsterDamaged(damage, newHp, currentTargetId);
      setMonster((prev) => ({ ...prev, hp: newHp }));
      setMonsters((prev) =>
        prev.map((m) =>
          m.id === currentTargetId || (!currentTargetId && m === prev[0]) ? { ...m, hp: newHp } : m
        )
      );

      if (myPlayerRef.current) {
        const ai = currentTargetId ? monsterAIsRef.current.get(currentTargetId) : monsterAIRef.current;
        if (ai) {
          ai.setAggroTarget(myPlayerRef.current.id);
        }
      }

      setMyPlayer((prev) => {
        if (!prev) return null;

        const isInfinite = weapon.isInfinite || weapon.ammo === -1;
        const currentAmmo = weapon.ammo;
        const newAmmo = isInfinite ? -1 : Math.max(0, currentAmmo - 1);

        const currentInventory =
          prev.inventory && prev.inventory.length > 0
            ? prev.inventory
            : getDefaultInventoryForRole(prev.role);

        if (!isInfinite && newAmmo <= 0) {
          const updatedInventory = currentInventory.filter((it) => it.id !== weapon.id);
          const nextWeaponItem = getBestWeaponInInventory(updatedInventory);
          const nextWeapon = inventoryItemToWeapon(nextWeaponItem);

          soundEffects.playAlarm();
          addLogRef.current(
            `¡${weapon.name} agotada en la arena! Equipando ${nextWeaponItem.name} (Tier ${nextWeaponItem.tier}).`,
            'warning'
          );

          return {
            ...prev,
            lastAttackTime: now,
            damageDealt: prev.damageDealt + damage,
            inventory: updatedInventory,
            equippedWeapon: nextWeapon,
            equippedItemId: nextWeaponItem.id,
          };
        }

        const updatedInventory = currentInventory.map((it) =>
          it.id === weapon.id
            ? {
                ...it,
                ammo: newAmmo,
                durability:
                  it.durability !== -1 && it.durability !== undefined
                    ? newAmmo
                    : it.durability,
              }
            : it
        );

        const updatedWeapon: Weapon = {
          ...weapon,
          ammo: newAmmo,
          durability:
            weapon.durability !== -1 && weapon.durability !== undefined
              ? newAmmo
              : weapon.durability,
        };

        return {
          ...prev,
          lastAttackTime: now,
          damageDealt: prev.damageDealt + damage,
          inventory: updatedInventory,
          equippedWeapon: updatedWeapon,
          equippedItemId: weapon.id,
        };
      });
    },
    []
  );

  const handleArenaPlayerDamaged = useCallback(
    (damage: number) => {
      let resultingHp = 1;
      let resultingStatus: PlayerStatus = 'active';
      let resultingWounded = false;
      let actualDamage = damage;

      setMyPlayer((prev) => {
        if (!prev) return null;
        const isShielded = isRoleSkillActiveRef.current && prev.role === 'tank';
        actualDamage = isShielded ? Math.round(damage * 0.5) : damage;
        const calculatedHp = Math.max(0, prev.hp - actualDamage);
        resultingWounded = calculatedHp <= 0 || calculatedHp === 1;
        resultingHp = resultingWounded ? 1 : calculatedHp;
        resultingStatus = resultingWounded ? 'critically_wounded' : (prev.status || 'active');

        // Transmitir daño a compañeros de escuadra
        realtimeRef.current.broadcastPlayerHit(prev.id, actualDamage, resultingHp);

        if (resultingWounded) {
          setIsCombatArenaOpen(false);
          soundEffects.triggerDamageHaptics();
          soundEffects.playAlarm();
          addLog('¡ATAQUE CRÍTICO EN LA ARENA! Has quedado Herido de Muerte. ¡Huye al Hospital!', 'combat');
        } else {
          addLog(`¡El monstruo te golpeó por ${actualDamage} de daño!`, 'combat');
        }

        return {
          ...prev,
          hp: resultingHp,
          isCriticallyWounded: resultingWounded || prev.isCriticallyWounded,
          status: resultingStatus,
        };
      });

      // Sincronizar simultáneamente la lista de jugadores local para que playersRef esté alineado
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.id === myPlayerRef.current?.id) {
            return {
              ...p,
              hp: resultingHp,
              isCriticallyWounded: resultingWounded || p.isCriticallyWounded,
              status: resultingStatus,
            };
          }
          return p;
        })
      );
    },
    [addLog]
  );

  const handleArenaClose = useCallback(() => {
    const playerCoord: Coordinates = {
      lat: myPlayerRef.current?.lat ?? roomRef.current?.centerLat ?? 0,
      lng: myPlayerRef.current?.lng ?? roomRef.current?.centerLng ?? 0,
    };
    const otherLiving = monstersRef.current
      .filter((m) => m.id !== activeCombatMonsterIdRef.current && isMonsterAlive(m))
      .map((m) => ({ monster: m, dist: getDistanceMeters(playerCoord, m) }))
      .filter((item) => item.dist <= 20)
      .sort((a, b) => a.dist - b.dist);

    if (otherLiving.length > 0) {
      const nextM = otherLiving[0].monster;
      setActiveCombatMonsterId(nextM.id || null);
      activeCombatMonsterIdRef.current = nextM.id || null;
      setMonster(nextM);
      soundEffects.playAlarm();
      addLog(`¡Monstruo derrotado! Siguiente enfrentamiento inmediato: ${nextM.name || 'Enemigo'}`, 'combat');
    } else {
      setIsCombatArenaOpen(false);
      setActiveCombatMonsterId(null);
      activeCombatMonsterIdRef.current = null;
    }
  }, [addLog]);

  const handleArenaFlee = useCallback(() => {
    const immunityEnd = Date.now() + 5000;
    setFleeImmunityUntil(immunityEnd);
    fleeImmunityUntilRef.current = immunityEnd;
    setActiveCombatMonsterId(null);
    activeCombatMonsterIdRef.current = null;
    setIsCombatArenaOpen(false);
    soundEffects.vibrate([100, 50, 100]);
    addLog('¡HUIDA ACTIVA! Aléjate del monstruo (Sprint +30% durante 5 segundos)', 'warning');
  }, [addLog]);

  // Manejadores del Duelo PvP en Tiempo Real
  const handlePvPVictory = useCallback(
    (opponent: Player) => {
      setIsPvPModalOpen(false);
      isPvPModalOpenRef.current = false;
      setPvpCombatId(null);
      pvpCombatIdRef.current = null;
      setPvpOpponentPlayerId(null);
      pvpOpponentPlayerIdRef.current = null;

      soundEffects.playVictoryFanfare();
      addLog(`¡Victoria en duelo táctico! Has neutralizado a ${opponent.nickname}.`, 'combat');

      // Si había un monstruo en cola de combate exterior, iniciar duelo 1 vs 1 con el vencedor
      const queued = queuedMonsterRef.current;
      queuedMonsterRef.current = null;
      setQueuedMonster(null);

      if (queued && isMonsterAlive(queued)) {
        const playerCoord = {
          lat: myPlayerRef.current?.lat ?? roomRef.current?.centerLat ?? 0,
          lng: myPlayerRef.current?.lng ?? roomRef.current?.centerLng ?? 0,
        };
        const distToQueued = getDistanceMeters(playerCoord, queued);
        if (distToQueued <= 20) {
          setTimeout(() => {
            setActiveCombatMonsterId(queued.id || null);
            activeCombatMonsterIdRef.current = queued.id || null;
            setMonster(queued);
            setIsCombatArenaOpen(true);
            if (typeof cancelMovementRef.current === 'function') {
              cancelMovementRef.current();
            }
            addLog(`¡Duelo PvP concluido! ${queued.name || 'El monstruo en espera'} inicia combate inmediato contra ti.`, 'combat');
          }, 400);
        }
      }
    },
    [addLog]
  );

  const handlePvPDefeat = useCallback(
    (opponent: Player) => {
      setIsPvPModalOpen(false);
      isPvPModalOpenRef.current = false;
      setPvpCombatId(null);
      pvpCombatIdRef.current = null;
      setPvpOpponentPlayerId(null);
      pvpOpponentPlayerIdRef.current = null;
      queuedMonsterRef.current = null;
      setQueuedMonster(null);

      // El perdedor queda críticamente herido con 1 HP
      setMyPlayer((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          hp: 1,
          isAlive: true,
          isCriticallyWounded: true,
          status: 'critically_wounded',
        };
      });
      if (myPlayerRef.current) {
        myPlayerRef.current.hp = 1;
        myPlayerRef.current.isCriticallyWounded = true;
        myPlayerRef.current.status = 'critically_wounded';
      }

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id
            ? { ...p, hp: 1, isCriticallyWounded: true, status: 'critically_wounded' }
            : p
        )
      );

      if (room?.id && myPlayerRef.current?.id) {
        (supabase.from('players') as any)
          .update({ hp: 1, status: 'critically_wounded' })
          .eq('id', myPlayerRef.current.id);
      }

      addLog(`Has caído en duelo ante ${opponent.nickname}. Corre al Hospital para reanimarte.`, 'warning');
    },
    [room?.id, addLog]
  );

  const handlePvPFlee = useCallback(() => {
    setIsPvPModalOpen(false);
    isPvPModalOpenRef.current = false;
    setPvpCombatId(null);
    pvpCombatIdRef.current = null;
    setPvpOpponentPlayerId(null);
    pvpOpponentPlayerIdRef.current = null;
    queuedMonsterRef.current = null;
    setQueuedMonster(null);

    const immunityEnd = Date.now() + 8000;
    setFleeImmunityUntil(immunityEnd);
    fleeImmunityUntilRef.current = immunityEnd;
    soundEffects.vibrate([100, 50, 100]);
    addLog('¡RETIRADA TÁCTICA! Has huido del duelo PvP. Inmunidad concedida por 8 segundos.', 'warning');
  }, [addLog]);

  // Manejadores del Hospital de Campaña Táctico
  const handleHospitalHealTick = useCallback(
    (
      newHp: number,
      newStatus: PlayerStatus,
      isCriticallyWounded: boolean,
      newPets: Pet[]
    ) => {
      setMyPlayer((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          hp: newHp,
          status: newStatus,
          isCriticallyWounded,
          pets: newPets,
        };
        if (prev.lat && prev.lng) {
          realtimeRef.current.broadcastPlayerMove(
            prev.lat,
            prev.lng,
            newHp,
            true,
            newStatus,
            isCriticallyWounded,
            prev.insideBuildingId,
            prev.insideBuildingType,
            newPets
          );
        }
        return updated;
      });

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id
            ? {
                ...p,
                hp: newHp,
                status: newStatus,
                isCriticallyWounded,
                pets: newPets,
              }
            : p
        )
      );

      if (myPlayerRef.current) {
        syncPlayerToSupabase(
          {
            ...myPlayerRef.current,
            hp: newHp,
            status: newStatus,
            isCriticallyWounded,
            pets: newPets,
          },
          false
        );
      }
    },
    [syncPlayerToSupabase]
  );

  const handleHospitalDischargeComplete = useCallback(
    (finalHp: number, finalStatus: PlayerStatus, finalPets: Pet[]) => {
      setMyPlayer((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          hp: finalHp,
          status: finalStatus,
          isCriticallyWounded: false,
          pets: finalPets,
        };
        if (prev.lat && prev.lng) {
          realtimeRef.current.broadcastPlayerMove(
            prev.lat,
            prev.lng,
            finalHp,
            true,
            finalStatus,
            false,
            prev.insideBuildingId,
            prev.insideBuildingType,
            finalPets
          );
        }
        return updated;
      });

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id
            ? {
                ...p,
                hp: finalHp,
                status: finalStatus,
                isCriticallyWounded: false,
                pets: finalPets,
              }
            : p
        )
      );

      if (myPlayerRef.current) {
        syncPlayerToSupabase(
          {
            ...myPlayerRef.current,
            hp: finalHp,
            status: finalStatus,
            isCriticallyWounded: false,
            pets: finalPets,
          },
          true
        );
      }
    },
    [syncPlayerToSupabase]
  );

  // Manejadores del Cofre Cooperativo
  const handleOpenChestModal = useCallback(() => {
    const currentRoom = roomRef.current;
    const player = myPlayerRef.current;
    if (!currentRoom || !player) return;
    if (isChestTransitioningRef.current || isChestTransitioning) return;

    const chestLat =
      (currentRoom as any)?.treasure_lat ??
      currentRoom?.treasureLat ??
      (currentRoom as any)?.settings?.treasure_lat ??
      (currentRoom as any)?.settings?.treasureLat ??
      currentRoom?.centerLat ??
      0;

    const chestLng =
      (currentRoom as any)?.treasure_lng ??
      currentRoom?.treasureLng ??
      (currentRoom as any)?.settings?.treasure_lng ??
      (currentRoom as any)?.settings?.treasureLng ??
      currentRoom?.centerLng ??
      0;

    const pCoord = {
      lat: player.lat ?? currentRoom.centerLat,
      lng: player.lng ?? currentRoom.centerLng,
    };

    const treasureCoord = {
      lat: chestLat,
      lng: chestLng,
    };
    const distToChest = getDistanceMeters(pCoord, treasureCoord);

    if (distToChest > 15) {
      lastDecryptedChestLocationRef.current = null;
      handleMapClickRef.current?.(treasureCoord);
      addLog('Desplazándose hacia las coordenadas del cofre del tesoro...', 'info');
      return;
    }

    if (lastDecryptedChestLocationRef.current) {
      const distToOldChest = getDistanceMeters(pCoord, lastDecryptedChestLocationRef.current);
      if (distToOldChest <= 25) return;
      lastDecryptedChestLocationRef.current = null;
    }

    // COMPROBACIÓN DE MONSTRUO GUARDIÁN EN EL PERÍMETRO DEL COFRE (<= 25m)
    const allActiveMonsters = monsters && monsters.length > 0 ? monsters : (monster ? [monster] : []);
    const isGuarded = allActiveMonsters.some((m) => {
      if (!isMonsterAlive(m) || (m as any).isDead) return false;
      const distMonsterToChest = getDistanceMeters(
        { lat: m.lat, lng: m.lng },
        treasureCoord
      );
      return distMonsterToChest <= 25;
    });

    if (isGuarded) {
      setIsChestLockModalOpen(false);
      isChestLockModalOpenRef.current = false;
      realtimeRef.current.broadcastChestInteracting(false);
      soundEffects.playAlarm();
      addLog(
        'ACCESO DENEGADO // Zona hostil activa: debes abatir o alejar al monstruo guardián para descifrar el cofre.',
        'warning'
      );
      return;
    }

    if (!hasTriggeredChestOpenRef.current || !isChestLockModalOpenRef.current) {
      hasTriggeredChestOpenRef.current = true;
      isChestLockModalOpenRef.current = true;
      if (typeof cancelMovementRef.current === 'function') {
        cancelMovementRef.current();
      }
      setIsChestLockModalOpen(true);
      realtimeRef.current.broadcastChestInteracting(true);
      soundEffects.playCrateLoot();
      addLog('Iniciando desencriptación del cofre táctico. ¡La escuadra debe proteger el perímetro!', 'info');
    }
  }, [addLog, isChestTransitioning]);

  // Apertura automática e imperativa del cofre por proximidad de coordenadas (<= 15m)
  const activeChestLat =
    (room as any)?.treasure_lat ??
    room?.treasureLat ??
    (room as any)?.settings?.treasure_lat ??
    (room as any)?.settings?.treasureLat ??
    room?.centerLat ??
    0;

  const activeChestLng =
    (room as any)?.treasure_lng ??
    room?.treasureLng ??
    (room as any)?.settings?.treasure_lng ??
    (room as any)?.settings?.treasureLng ??
    room?.centerLng ??
    0;

  useEffect(() => {
    if (!activeChestLat || !activeChestLng || !myPlayer?.lat || !myPlayer?.lng) return;
    if (room?.status !== 'playing') return;
    if (!myPlayer.isAlive || myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded') return;

    if (isChestTransitioningRef.current || isChestTransitioning) return;
    if (lastDecryptedChestLocationRef.current) {
      const distToOldChest = getDistanceMeters(
        { lat: myPlayer.lat, lng: myPlayer.lng },
        lastDecryptedChestLocationRef.current
      );
      if (distToOldChest <= 25) return;
      lastDecryptedChestLocationRef.current = null;
    }

    const dist = getDistanceMeters(
      { lat: myPlayer.lat, lng: myPlayer.lng },
      { lat: activeChestLat, lng: activeChestLng }
    );

    // Si está a 15 metros o menos, abrir imperativamente una sola vez (si no está en período de transición)
    if (dist <= 15) {
      // Comprobar si hay un monstruo hostil defendiendo el perímetro del cofre (<= 25m)
      const allActiveMonsters = monsters && monsters.length > 0 ? monsters : (monster ? [monster] : []);
      const isGuarded = allActiveMonsters.some((m) => {
        if (!isMonsterAlive(m) || (m as any).isDead) return false;
        const distMonsterToChest = getDistanceMeters(
          { lat: m.lat, lng: m.lng },
          { lat: activeChestLat, lng: activeChestLng }
        );
        return distMonsterToChest <= 25;
      });

      if (isGuarded) {
        if (isChestLockModalOpenRef.current) {
          setIsChestLockModalOpen(false);
          isChestLockModalOpenRef.current = false;
          realtimeRef.current.broadcastChestInteracting(false);
        }
        return;
      }

      if (
        !isChestTransitioningRef.current &&
        !isChestTransitioning &&
        !hasTriggeredChestOpenRef.current &&
        !isChestLockModalOpen &&
        !isCombatArenaOpen &&
        !isHospitalModalOpen &&
        !isPvPModalOpen
      ) {
        hasTriggeredChestOpenRef.current = true;
        isChestLockModalOpenRef.current = true;
        if (typeof cancelMovementRef.current === 'function') {
          cancelMovementRef.current();
        }
        setIsChestLockModalOpen(true);
        realtimeRef.current.broadcastChestInteracting(true);
        soundEffects.playCrateLoot();
        addLog('¡En rango del cofre táctico! Iniciando desencriptación de cerrojos.', 'info');
      }
    } else if (!isChestTransitioningRef.current && !isChestTransitioning) {
      // Resetear la bandera únicamente cuando el jugador se aleja a más de 15m y no está en transición
      hasTriggeredChestOpenRef.current = false;
    }
  }, [
    myPlayer?.lat,
    myPlayer?.lng,
    myPlayer?.isAlive,
    myPlayer?.isCriticallyWounded,
    myPlayer?.status,
    activeChestLat,
    activeChestLng,
    room?.status,
    isChestLockModalOpen,
    isCombatArenaOpen,
    isHospitalModalOpen,
    isPvPModalOpen,
    isChestTransitioning,
    addLog,
  ]);

  const handleCloseChestModal = useCallback(() => {
    setIsChestLockModalOpen(false);
    isChestLockModalOpenRef.current = false;
    realtimeRef.current.broadcastChestInteracting(false);
  }, []);

  // Estado memorizado del perímetro custodiado del cofre (<= 25m)
  const isChestGuarded = useMemo(() => {
    if (!activeChestLat || !activeChestLng) return false;
    const allActiveMonsters = monsters && monsters.length > 0 ? monsters : (monster ? [monster] : []);
    return allActiveMonsters.some((m) => {
      if (!isMonsterAlive(m) || (m as any).isDead) return false;
      const distMonsterToChest = getDistanceMeters(
        { lat: m.lat, lng: m.lng },
        { lat: activeChestLat, lng: activeChestLng }
      );
      return distMonsterToChest <= 25;
    });
  }, [monsters, monster, activeChestLat, activeChestLng]);

  // Monitor continuo del perímetro defensivo del cofre: si un monstruo vivo entra a <= 25m, expulsar de inmediato
  useEffect(() => {
    if (!isChestLockModalOpen || !activeChestLat || !activeChestLng) return;

    if (isChestGuarded) {
      setIsChestLockModalOpen(false);
      isChestLockModalOpenRef.current = false;
      realtimeRef.current.broadcastChestInteracting(false);
      soundEffects.playAlarm();
      addLog(
        'ACCESO DENEGADO // Zona hostil activa: el monstruo guardián ha penetrado el perímetro (<= 25m). ¡Descifrado interrumpido!',
        'warning'
      );
    }
  }, [
    isChestLockModalOpen,
    isChestGuarded,
    activeChestLat,
    activeChestLng,
    addLog,
  ]);

  // Salvaguarda reactiva global: ningún modal de hackeo de cofre puede coexistir con combate activo (PvE o PvP)
  useEffect(() => {
    if (isCombatArenaOpen || isPvPModalOpen) {
      if (isChestLockModalOpenRef.current || isChestLockModalOpen) {
        setIsChestLockModalOpen(false);
        isChestLockModalOpenRef.current = false;
        realtimeRef.current.broadcastChestInteracting(false);
      }
    }
  }, [isCombatArenaOpen, isPvPModalOpen, isChestLockModalOpen]);

  // Detección reactiva de encuentro PvP para jugadores estáticos (ej. manipulando el cofre)
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer.isCriticallyWounded ||
      myPlayer.status === 'critically_wounded' ||
      (myPlayer.status !== 'active' && myPlayer.status != null) ||
      Date.now() < fleeImmunityUntilRef.current ||
      isPvPModalOpenRef.current ||
      isCombatArenaOpenRef.current ||
      isHospitalModalOpenRef.current ||
      !myPlayer.lat ||
      !myPlayer.lng ||
      isPlayerInSafeZone(myPlayer, structuresRef.current)
    ) {
      return;
    }

    const myCoord = { lat: myPlayer.lat, lng: myPlayer.lng };
    const otherPlayers = players.filter((p) => p.id !== myPlayer.id);

    for (const other of otherPlayers) {
      if (
        other.isAlive &&
        !other.isCriticallyWounded &&
        (other.status === 'active' || !other.status) &&
        other.lat != null &&
        other.lng != null &&
        !isPlayerInSafeZone(other, structuresRef.current)
      ) {
        const dist = getDistanceMeters(myCoord, { lat: other.lat, lng: other.lng });
        if (dist <= 12) {
          const combatId = [myPlayer.id, other.id].sort().join('_');
          setPvpCombatId(combatId);
          pvpCombatIdRef.current = combatId;
          setPvpOpponentPlayerId(other.id);
          pvpOpponentPlayerIdRef.current = other.id;

          // 1. Expulsar de inmediato de la pantalla de desencriptación
          setIsChestLockModalOpen(false);
          isChestLockModalOpenRef.current = false;
          realtimeRef.current.broadcastChestInteracting(false);

          // 2. Detener desplazamiento
          if (typeof cancelMovementRef.current === 'function') {
            cancelMovementRef.current();
          }

          // 3. Abrir arena PvP
          setIsPvPModalOpen(true);
          isPvPModalOpenRef.current = true;

          // 4. Notificar a la sala
          realtimeRef.current.broadcastPvPEncounter({
            combatId,
            player1Id: myPlayer.id,
            player2Id: other.id,
            attackerId: other.id,
            defenderId: myPlayer.id,
          });

          soundEffects.playAlarm();
          soundEffects.vibrate([100, 50, 150]);
          addLog(`¡EMBOSCADA! Duelo PvP iniciado con ${other.nickname}. ¡Descifrado interrumpido!`, 'combat');
          break;
        }
      }
    }
  }, [
    players,
    myPlayer?.lat,
    myPlayer?.lng,
    myPlayer?.isAlive,
    myPlayer?.isCriticallyWounded,
    myPlayer?.status,
    room?.status,
    addLog,
  ]);

  const handleChestStepSuccess = useCallback(
    (nextPhase: number, nextStep: number) => {
      setChestPhase(nextPhase);
      setChestStep(nextStep);
      chestPhaseRef.current = nextPhase;
      chestStepRef.current = nextStep;

      if (room?.id) {
        const totalCompleted = (nextPhase - 1) * 2 + nextStep;
        const progressPct = Math.min(100, Math.round((totalCompleted / 6) * 100));

        // Persistir en localStorage aislado por game.id
        try {
          localStorage.setItem(
            `utopia_chest_progress_${room.id}`,
            JSON.stringify({ phase: nextPhase, step: nextStep })
          );
        } catch {
          // Ignorar error de storage
        }

        // Persistir en base de datos si la sala está activa (RPC autoritativa con SECURITY DEFINER + Fallback)
        (async () => {
          try {
            const { error: rpcErr } = await (supabase.rpc as any)('update_chest_progress', {
              p_game_id: room.id,
              p_unlocked_steps: totalCompleted,
              p_current_phase: nextPhase,
              p_progress_pct: progressPct,
            });
            if (rpcErr) {
              await (supabase.from('games') as any)
                .update({
                  chest_unlocked_steps: totalCompleted,
                  chest_current_phase: nextPhase,
                  chest_progress_pct: progressPct,
                })
                .eq('id', room.id);
            }
          } catch (err) {
            console.warn('Error al actualizar progreso del cofre en DB:', err);
          }
        })();
      }

      realtimeRef.current.broadcastChestProgress(nextPhase, nextStep, myPlayerRef.current?.nickname);
      addLog(`¡Cerrojo del cofre superado! (Fase ${nextPhase}, Cerrojo ${nextStep + 1}/2)`, 'loot');
    },
    [room?.id, addLog]
  );

  const handleChestVictory = useCallback(async (finalWinnerNickname?: string) => {
    // 1. Asegurar estado local en 6/6 y cerrar modal de cofre
    setChestPhase(3);
    setChestStep(2);
    chestPhaseRef.current = 3;
    chestStepRef.current = 2;
    setIsChestLockModalOpen(false);
    isChestLockModalOpenRef.current = false;
    setIsChestInteractedGlobally(false);

    if (room?.id) {
      try {
        localStorage.removeItem(`utopia_chest_progress_${room.id}`);
        clearPlayerSessionSnapshot(room.id);
      } catch {
        // Ignorar
      }
    }
    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);

    const endedAt = new Date().toISOString();

    // 2. Determinar vencedor oficial de la partida por mayoría de cofres conquistados
    let winnerNickname = finalWinnerNickname;
    if (!winnerNickname) {
      const allSorted = [...playersRef.current].sort((a, b) => {
        const aChests = a.chests_opened ?? a.chestsOpened ?? 0;
        const bChests = b.chests_opened ?? b.chestsOpened ?? 0;
        if (bChests !== aChests) return bChests - aChests;

        const killsA = (a as any).kills ?? a.monsterKills ?? (a as any).monsters_slain ?? 0;
        const killsB = (b as any).kills ?? b.monsterKills ?? (b as any).monsters_slain ?? 0;
        if (killsB !== killsA) return killsB - killsA;

        const dmgA = a.damageDealt ?? 0;
        const dmgB = b.damageDealt ?? 0;
        if (dmgB !== dmgA) return dmgB - dmgA;

        const woundsA = (a as any).times_wounded ?? (a as any).timesWounded ?? (a.isCriticallyWounded ? 1 : 0);
        const woundsB = (b as any).times_wounded ?? (b as any).timesWounded ?? (b.isCriticallyWounded ? 1 : 0);
        return woundsA - woundsB;
      });
      winnerNickname = allSorted[0]?.nickname || myPlayerRef.current?.nickname || 'Vencedor';
    }

    // 3. Transición inmediata de estado de sala a 'victory'
    setRoom((prev) => (prev ? { ...prev, status: 'victory', winner: winnerNickname, endedAt } : null));

    // 4. Emitir broadcast a todos los jugadores conectados
    realtimeRef.current.broadcastGameVictory(true, winnerNickname);
    addLog(`¡Competencia finalizada! Vencedor de la partida: ¡${winnerNickname}!`, 'victory');
    soundEffects.playVictoryFanfare();

    // 5. Actualizar base de datos de forma atómica y autoritativa (RPC SECURITY DEFINER + Fallbacks)
    if (room?.id) {
      try {
        const { error: rpcErr } = await (supabase.rpc as any)('finish_game_victory', {
          p_game_id: room.id,
          p_winner_nickname: winnerNickname,
        });
        if (rpcErr) {
          console.warn('finish_game_victory RPC falló, intentando set_game_status:', rpcErr);
          await (supabase.rpc as any)('set_game_status', {
            p_game_id: room.id,
            p_status: 'victory',
          });
        }
      } catch (err) {
        console.warn('Excepción al invocar finish_game_victory:', err);
      }

      try {
        await (supabase.from('games') as any)
          .update({
            status: 'victory',
            chest_unlocked_steps: 6,
            chest_current_phase: 3,
            chest_progress_pct: 100,
            chest_opened: true,
            winner: winnerNickname,
            ended_at: endedAt,
          })
          .eq('id', room.id);
      } catch (err) {
        console.warn('Error al actualizar victoria en games:', err);
      }

      // Inserción de estadísticas personales en match_stats
      if (myPlayerRef.current) {
        const didIWin = myPlayerRef.current.nickname === winnerNickname;
        try {
          await (supabase.from('match_stats') as any).insert({
            game_id: room.id,
            nickname: myPlayerRef.current.nickname,
            role: myPlayerRef.current.role,
            damage_dealt: myPlayerRef.current.damageDealt,
            revives_done: myPlayerRef.current.revivesDone,
            crates_opened: myPlayerRef.current.cratesOpened,
            chests_opened: myPlayerRef.current.chests_opened || myPlayerRef.current.chestsOpened || 0,
            monster_kills: myPlayerRef.current.monsterKills,
            won: didIWin,
            score: ((myPlayerRef.current.chests_opened || 0) * 1000) + myPlayerRef.current.damageDealt,
          });
        } catch (err) {
          console.warn('Error al guardar match_stats de victoria:', err);
        }
      }
    }
  }, [room?.id, addLog]);

  const handleChestDecrypted = useCallback(async () => {
    const currentChestIdx = currentChestIndexRef.current;
    const currentRoom = roomRef.current;
    if (!currentRoom) return;

    // 1. Activar de inmediato período de gracia / enfriamiento y cerrar modal
    isChestTransitioningRef.current = true;
    setIsChestTransitioning(true);
    hasTriggeredChestOpenRef.current = true;
    setIsChestLockModalOpen(false);
    isChestLockModalOpenRef.current = false;
    setIsChestInteractedGlobally(false);
    setChestPhase(1);
    setChestStep(0);
    chestPhaseRef.current = 1;
    chestStepRef.current = 0;

    if (chestTransitionCooldownTimerRef.current) {
      clearTimeout(chestTransitionCooldownTimerRef.current);
    }
    chestTransitionCooldownTimerRef.current = setTimeout(() => {
      isChestTransitioningRef.current = false;
      setIsChestTransitioning(false);
      hasTriggeredChestOpenRef.current = false;
    }, 5000);

    // 2. Incrementar chests_opened localmente
    const myId = myPlayerRef.current?.id;
    const updatedChests = (myPlayerRef.current?.chests_opened || myPlayerRef.current?.chestsOpened || 0) + 1;
    setMyPlayer((prev) => (prev ? { ...prev, chests_opened: updatedChests, chestsOpened: updatedChests } : null));
    if (myPlayerRef.current) {
      myPlayerRef.current.chests_opened = updatedChests;
      myPlayerRef.current.chestsOpened = updatedChests;
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === myId
          ? { ...p, chests_opened: updatedChests, chestsOpened: updatedChests }
          : p
      )
    );

    // Transmitir reclamo del cofre a la sala
    if (myPlayerRef.current) {
      realtimeRef.current.broadcastChestClaimed({
        playerId: myPlayerRef.current.id,
        playerNickname: myPlayerRef.current.nickname,
        chestIndex: currentChestIdx,
      });
    }

    if (currentChestIdx < 3) {
      // 3. Avanzar al siguiente cofre secuencial (Cofre 2 o Cofre 3)
      const nextChestIdx = currentChestIdx + 1;
      setCurrentChestIndex(nextChestIdx);
      currentChestIndexRef.current = nextChestIdx;

      // 4. Registrar coordenadas del cofre recién resuelto para exigir salida física (> 25m)
      const centerCoord: Coordinates = {
        lat: currentRoom.centerLat ?? (currentRoom as any).center_lat ?? 0,
        lng: currentRoom.centerLng ?? (currentRoom as any).center_lng ?? 0,
      };
      const prevChestCoord: Coordinates = {
        lat: (currentRoom as any)?.treasure_lat ?? currentRoom?.treasureLat ?? (currentRoom as any)?.settings?.treasure_lat ?? centerCoord.lat,
        lng: (currentRoom as any)?.treasure_lng ?? currentRoom?.treasureLng ?? (currentRoom as any)?.settings?.treasure_lng ?? centerCoord.lng,
      };
      const playerCoord: Coordinates = {
        lat: myPlayerRef.current?.lat ?? prevChestCoord.lat,
        lng: myPlayerRef.current?.lng ?? prevChestCoord.lng,
      };
      lastDecryptedChestLocationRef.current = {
        lat: prevChestCoord.lat || playerCoord.lat,
        lng: prevChestCoord.lng || playerCoord.lng,
      };

      // 5. Reubicar cofre forzando distancia mínima sustancial (>= 70m)
      const newTreasureLoc = generateNextChestLocation(
        centerCoord,
        currentRoom.playAreaRadius,
        prevChestCoord,
        playerCoord
      );

      // 6. Invocar/desplegar el monstruo secuencial de la siguiente fase
      const newMonster = createSequentialMonster(nextChestIdx, centerCoord, currentRoom.playAreaRadius);
      const updatedMonsters = [...monstersRef.current, newMonster];
      setMonsters(updatedMonsters);
      activeCombatMonsterIdRef.current = newMonster.id || null;

      // 7. Actualizar de forma inmediata y sincrónica roomRef.current y estado local
      const updatedRoom = {
        ...currentRoom,
        currentChestIndex: nextChestIdx,
        current_chest_index: nextChestIdx,
        treasureLat: newTreasureLoc.lat,
        treasureLng: newTreasureLoc.lng,
        treasure_lat: newTreasureLoc.lat,
        treasure_lng: newTreasureLoc.lng,
        chestPhase: 1,
        chestStep: 0,
        chestUnlockedSteps: 0,
        chestCurrentPhase: 1,
        chestProgressPct: 0,
        settings: {
          ...((currentRoom as any).settings || {}),
          treasure_lat: newTreasureLoc.lat,
          treasure_lng: newTreasureLoc.lng,
          current_chest_index: nextChestIdx,
        },
      };
      roomRef.current = updatedRoom;
      setRoom(updatedRoom);

      // 8. Transmitir transición a la escuadra
      realtimeRef.current.broadcastChestTransition({
        currentChestIndex: nextChestIdx,
        treasureLat: newTreasureLoc.lat,
        treasureLng: newTreasureLoc.lng,
        newMonster,
        monsters: updatedMonsters,
      });

      soundEffects.playLevelUp();
      addLog(
        `¡Cofre [${currentChestIdx}/3] conquistado por ti (+1 punto)! Se ha detectado la señal del Cofre [${nextChestIdx}/3]. Ha emergido ${newMonster.name || 'un nuevo monstruo'}.`,
        'loot'
      );

      // 9. Persistir de forma asíncrona en LocalStorage y Supabase sin bloquear el flujo
      try {
        localStorage.setItem(`utopia_chest_progress_${currentRoom.id}`, JSON.stringify({ phase: 1, step: 0 }));
      } catch {
        // Ignorar
      }

      (async () => {
        try {
          if (myId) {
            await (supabase.from('players') as any)
              .update({ chests_opened: updatedChests })
              .eq('id', myId);
          }
          await (supabase.from('games') as any)
            .update({
              treasure_lat: newTreasureLoc.lat,
              treasure_lng: newTreasureLoc.lng,
              current_chest_index: nextChestIdx,
              chest_unlocked_steps: 0,
              chest_current_phase: 1,
              chest_progress_pct: 0,
              settings: {
                ...((currentRoom as any).settings || {}),
                treasure_lat: newTreasureLoc.lat,
                treasure_lng: newTreasureLoc.lng,
                current_chest_index: nextChestIdx,
              },
            })
            .eq('id', currentRoom.id);
        } catch (err) {
          console.warn('Error al persistir transición de cofre en DB:', err);
        }
      })();
    } else {
      // Tercer y último cofre resuelto: calcular vencedor por mayoría de cofres
      try {
        if (myId) {
          await (supabase.from('players') as any)
            .update({ chests_opened: updatedChests })
            .eq('id', myId);
        }
      } catch (err) {
        console.warn('Error al persistir chests_opened final en DB:', err);
      }

      const allPlayersRanked = [...playersRef.current].map((p) =>
        p.id === myId ? { ...p, chests_opened: updatedChests, chestsOpened: updatedChests } : p
      ).sort((a, b) => {
        const aChests = a.chests_opened ?? a.chestsOpened ?? 0;
        const bChests = b.chests_opened ?? b.chestsOpened ?? 0;
        if (bChests !== aChests) return bChests - aChests;

        const killsA = (a as any).kills ?? a.monsterKills ?? (a as any).monsters_slain ?? 0;
        const killsB = (b as any).kills ?? b.monsterKills ?? (b as any).monsters_slain ?? 0;
        if (killsB !== killsA) return killsB - killsA;

        const dmgA = a.damageDealt ?? 0;
        const dmgB = b.damageDealt ?? 0;
        if (dmgB !== dmgA) return dmgB - dmgA;

        const woundsA = (a as any).times_wounded ?? (a as any).timesWounded ?? (a.isCriticallyWounded ? 1 : 0);
        const woundsB = (b as any).times_wounded ?? (b as any).timesWounded ?? (b.isCriticallyWounded ? 1 : 0);
        return woundsA - woundsB;
      });

      const champion = allPlayersRanked[0];
      const championNickname = champion?.nickname || myPlayerRef.current?.nickname || 'Vencedor';
      await handleChestVictory(championNickname);
    }
  }, [handleChestVictory, addLog]);

  const handleChestCompletion = handleChestDecrypted;

  // ==========================================
  // ESTADO DE PARTIDA CONTINUO (SIN DERROTA GLOBAL)
  // ==========================================
  // No existe condición de fin de partida por derrota del equipo ('defeat').
  // Si todos los jugadores caen heridos de muerte simultáneamente, todos pueden
  // desplazarse al Hospital de Campaña para recuperar salud al 100% y reanimarse.
  // La partida continúa en bucle indefinido en estado 'playing' hasta que la escuadra
  // consiga descifrar y abrir el cofre del tesoro para alcanzar 'victory'.

  // ==========================================
  // HOSPITAL DE CAMPAÑA: DETECCIÓN CONTINUA Y APERTURA DE BAHÍA MÉDICA (< 18M)
  // Toda la curación hospitalaria ocurre exclusivamente a través de HospitalModal
  // ==========================================
  const hasShownFullHealthNoticeRef = useRef(false);

  useEffect(() => {
    if (room?.status !== 'playing' || !myPlayer?.isAlive) return;

    const interval = setInterval(() => {
      const player = myPlayerRef.current;
      const hospital = hospitalStructureRef.current;
      if (!player || !hospital) return;

      const pCoord: Coordinates = {
        lat: player.lat ?? room.centerLat,
        lng: player.lng ?? room.centerLng,
      };
      const hospitalCoord: Coordinates = {
        lat: hospital.lat,
        lng: hospital.lng,
      };

      const hospitalDistance = getDistanceMeters(pCoord, hospitalCoord);
      const hospitalRadius = hospital.radius || 18;

      const playerNeedsHealing =
        player.hp < (player.maxHp || 100) ||
        player.status === 'critically_wounded' ||
        player.isCriticallyWounded;

      const petsNeedHealing = (player.pets || []).some(
        (p) => p.hp < (p.maxHp || 100) || p.isWounded
      );

      const needsHealing = playerNeedsHealing || petsNeedHealing;

      if (hospitalDistance <= hospitalRadius) {
        if (needsHealing && !isHospitalModalOpenRef.current) {
          hasShownFullHealthNoticeRef.current = false;
          // Detener movimiento y abrir de inmediato la interfaz táctica del hospital
          cancelMovementRef.current();
          setIsHospitalModalOpen(true);
          isHospitalModalOpenRef.current = true;
          addLogRef.current?.('Has entrado al Hospital de Campaña. Iniciando regeneración táctica.', 'info');
        } else if (!needsHealing) {
          // Si toda la escuadra está sana (100% HP y sin mascotas heridas),
          // NO emitir toasts repetitivos ni mensajes parpadeantes; el banner fijo permanente se encarga.
          hasShownFullHealthNoticeRef.current = true;
        }
      } else {
        // Al alejarse más allá del radio de la instalación
        hasShownFullHealthNoticeRef.current = false;
        if (isHospitalModalOpenRef.current) {
          setIsHospitalModalOpen(false);
          isHospitalModalOpenRef.current = false;
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [room?.status, room?.centerLat, room?.centerLng]);

  // ==========================================
  // SAQUEO DE AIRDROPS (CAJAS DE SUMINISTROS A 40 METROS)
  // ==========================================
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer?.isCriticallyWounded ||
      myPlayer?.status === 'critically_wounded'
    )
      return;

    const myCoord: Coordinates = {
      lat: myPlayer.lat ?? room.centerLat,
      lng: myPlayer.lng ?? room.centerLng,
    };

    crates.forEach((crate) => {
      if (crate.opened) return;
      const dist = getDistanceMeters(myCoord, crate);
      if (dist <= 40) {
        // Saquear caja
        setCrates((prev) =>
          prev.map((c) => (c.id === crate.id ? { ...c, opened: true } : c))
        );

        // 1. RECOLECCIÓN AISLADA DE SUMINISTROS (CURACIÓN ESTRICTAMENTE LIMITADA A BOTIQUINES)
        let lootedName = 'Suministros';
        setMyPlayer((prev) => {
          if (!prev) return null;
          const result = applyCratePickup(crate, prev);
          lootedName = result.lootedItemName;
          addLogRef.current(result.logMessage, result.logType);
          return result.updatedPlayer;
        });

        realtime.broadcastCrateLooted(crate.id, myPlayer.nickname, lootedName);
        soundEffects.playCrateLoot();
      }
    });
  }, [myPlayer?.lat, myPlayer?.lng, myPlayer?.isAlive, crates, room?.centerLat, room?.centerLng, realtime]);

  // ==========================================
  // ADOPCIÓN AUTOMÁTICA DE MASCOTAS SILVESTRES (<12m)
  // ==========================================
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer?.isCriticallyWounded ||
      myPlayer?.status === 'critically_wounded'
    )
      return;

    const myCoord: Coordinates = {
      lat: myPlayer.lat ?? room.centerLat,
      lng: myPlayer.lng ?? room.centerLng,
    };

    const currentPets = myPlayer.pets || [];
    const hasMaxPets = currentPets.length >= MAX_PETS_PER_PLAYER;

    wildPets.forEach((wp) => {
      const dist = getDistanceMeters(myCoord, { lat: wp.lat, lng: wp.lng });
      if (dist <= PET_ADOPTION_RADIUS_METERS) {
        if (hasMaxPets) {
          // Bloquear adopción y emitir feedback táctico con throttling (máx 1 aviso cada 8s)
          const now = Date.now();
          if (now - lastPetCapacityWarningRef.current > 8000) {
            lastPetCapacityWarningRef.current = now;
            addLog('CAPACIDAD MÁXIMA DE MASCOTAS (3/3): No puedes vincular más acompañantes.', 'warning');
            soundEffects.playAlarm();
            soundEffects.vibrate(150);
          }
          return;
        }

        // Adoptar mascota
        setWildPets((prev) => {
          const updated = prev.filter((p) => p.id !== wp.id);
          if (room?.id) {
            syncRoomEntitiesToSupabase(room.id, { wildPets: updated });
          }
          return updated;
        });

        setMyPlayer((prev) => {
          if (!prev) return null;
          const prevPets = prev.pets || [];
          // Si ya la tiene agregada o alcanzó el límite, omitir
          if (prevPets.some((p) => p.id === wp.pet.id) || prevPets.length >= MAX_PETS_PER_PLAYER) return prev;

          const updatedPets = [...prevPets, wp.pet];
          addLog(`¡Has adoptado a ${wp.pet.name} ${wp.pet.icon}! Te acompañará fielmente en la misión.`, 'loot');
          soundEffects.playCrateLoot();

          // Sincronizar adopción a la sala
          realtime.broadcastPetAdopted(wp.id, prev.nickname, wp.pet);

          if (prev.lat && prev.lng) {
            realtime.broadcastPlayerMove(
              prev.lat,
              prev.lng,
              prev.hp,
              true,
              prev.status,
              prev.isCriticallyWounded,
              prev.insideBuildingId,
              prev.insideBuildingType,
              updatedPets
            );
          }

          return {
            ...prev,
            pets: updatedPets,
          };
        });
      }
    });
  }, [myPlayer?.lat, myPlayer?.lng, myPlayer?.isAlive, myPlayer?.pets, wildPets, room?.centerLat, room?.centerLng, realtime, addLog]);

  // ==========================================
  // RECOGIDA PASIVA AUTOMÁTICA DE SUMINISTROS POR MASCOTAS (FETCH LOOT)
  // ==========================================
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer?.isCriticallyWounded ||
      myPlayer?.status === 'critically_wounded'
    )
      return;

    const activePets = (myPlayer.pets || []).filter((p) => !p.isWounded && p.hp > 0);
    if (activePets.length === 0) return;

    const myCoord: Coordinates = {
      lat: myPlayer.lat ?? room.centerLat,
      lng: myPlayer.lng ?? room.centerLng,
    };

    crates.forEach((crate) => {
      if (crate.opened) return;
      const dist = getDistanceMeters(myCoord, crate);

      // Comprobar si alguna mascota activa tiene al alcance el suministro según su fetchRadiusMeters
      const fetchingPet = activePets.find((pet) => dist <= pet.fetchRadiusMeters);
      if (fetchingPet) {
        // Marcar caja como abierta
        setCrates((prev) =>
          prev.map((c) => (c.id === crate.id ? { ...c, opened: true } : c))
        );

        let lootedName = 'Suministros';
        setMyPlayer((prev) => {
          if (!prev) return null;
          const result = applyPetCratePickup(crate, prev, fetchingPet);
          lootedName = result.lootedItemName;
          addLogRef.current(result.logMessage, result.logType);
          return result.updatedPlayer;
        });

        realtime.broadcastCrateLooted(crate.id, myPlayer.nickname, lootedName);
        soundEffects.playCrateLoot();
      }
    });
  }, [myPlayer?.lat, myPlayer?.lng, myPlayer?.isAlive, myPlayer?.pets, crates, room?.centerLat, room?.centerLng, realtime]);

  // ==========================================
  // HABILIDAD PASIVA DEL MINI ROBOT MÉDICO (+2 HP CADA 5S FUERA DE COMBATE)
  // ==========================================
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer?.isCriticallyWounded ||
      myPlayer?.status === 'critically_wounded' ||
      isCombatArenaOpen
    )
      return;

    const hasActiveMedBot = (myPlayer.pets || []).some((p) => p.type === 'med_bot' && !p.isWounded);
    if (!hasActiveMedBot) return;

    const interval = setInterval(() => {
      setMyPlayer((prev) => {
        if (!prev || prev.hp >= prev.maxHp) return prev;
        const newHp = Math.min(prev.maxHp, prev.hp + 2);
        return {
          ...prev,
          hp: newHp,
        };
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [room?.status, myPlayer?.isAlive, myPlayer?.pets, isCombatArenaOpen]);

  // ==========================================
  // HABILIDADES ACTIVAS DE ROL / ACCIONES ESPECIALES
  // ==========================================
  const handleActivateRoleSkill = useCallback(() => {
    if (
      roleSkillCooldown > 0 ||
      !myPlayer ||
      !myPlayer.isAlive ||
      myPlayer.isCriticallyWounded ||
      myPlayer.status === 'critically_wounded'
    )
      return;

    if (myPlayer.role === 'scout') {
      // EXPLORADOR: RADAR TÁCTICO (revela al monstruo 10s, cooldown 60s)
      setIsRadarActive(true);
      setIsRoleSkillActive(true);
      setRadarRemaining(10);
      setRoleSkillRemaining(10);
      setRoleSkillCooldown(60);

      realtime.broadcastRadarActivated(myPlayer.nickname, Date.now() + 10000);
      soundEffects.playRadarPing();
      addLog('¡Radar Táctico activado! Monstruo revelado a la escuadra.', 'info');
    } else if (myPlayer.role === 'medic') {
      // MÉDICO: PULSO DE CURACIÓN (Cura +35 HP a sí mismo y aliados a <25m, cooldown 45s, duración 5s)
      setIsRoleSkillActive(true);
      setRoleSkillRemaining(5);
      setRoleSkillCooldown(45);

      setMyPlayer((prev) => (prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + 35) } : null));
      setPlayers((prev) =>
        prev.map((p) => {
          if (!p.isAlive) return p;
          const myPos = { lat: myPlayer.lat ?? room?.centerLat ?? 0, lng: myPlayer.lng ?? room?.centerLng ?? 0 };
          const pPos = { lat: p.lat ?? 0, lng: p.lng ?? 0 };
          const dist = getDistanceMeters(myPos, pPos);
          if (dist <= 25) {
            return { ...p, hp: Math.min(p.maxHp, p.hp + 35) };
          }
          return p;
        })
      );

      soundEffects.playCrateLoot();
      addLog('¡Pulso Curativo activado! +35 HP aplicados a aliados cercanos.', 'loot');
    } else if (myPlayer.role === 'tank') {
      // TANQUE: PROVOCACIÓN / ESCUDO (Atrae agro del monstruo y reduce daño 50% durante 8s, cooldown 45s)
      setIsRoleSkillActive(true);
      setRoleSkillRemaining(8);
      setRoleSkillCooldown(45);

      if (monsterAIRef.current) {
        monsterAIRef.current.setAggroTarget(myPlayer.id);
      }
      realtime.broadcastMonsterDamaged(1, monster.hp);
      soundEffects.vibrate([150, 50, 150]);
      addLog('¡Provocación y Escudo defensivo activados! El Monstruo fija su furia en ti.', 'combat');
    } else if (myPlayer.role === 'marksman') {
      // TIRADOR: DISPARO PRECISO / OJO DE HALCÓN (+50% Rango táctico durante 8s, cooldown 40s)
      setIsRoleSkillActive(true);
      setRoleSkillRemaining(8);
      setRoleSkillCooldown(40);

      soundEffects.playGunshot();
      addLog('¡Ojo de Halcón activado! Rango de disparo +50% y puntería extendida.', 'combat');
    }

    // Temporizador de duración de habilidad
    const durTimer = window.setInterval(() => {
      setRoleSkillRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(durTimer);
          setIsRoleSkillActive(false);
          setIsRadarActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Temporizador de cooldown de habilidad
    const cdTimer = window.setInterval(() => {
      setRoleSkillCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cdTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [roleSkillCooldown, myPlayer, realtime, addLog, room?.centerLat, room?.centerLng, monster.hp]);

  // ==========================================
  // GENERACIÓN DINÁMICA PROGRESIVA (HOST AIRDROP Y MASCOTAS CADA INTERVALO)
  // Control estricto de densidad: máx 3 armas/loot y máx 3 mascotas silvestres
  // ==========================================
  useEffect(() => {
    if (!room || room.status !== 'playing' || !myPlayer?.isHost) return;

    const AIRDROP_INTERVAL_MS = 50000; // Cada 50 segundos
    const PET_INTERVAL_MS = 95000; // Cada 95 segundos

    const startedAtMs = room.startedAt
      ? new Date(room.startedAt).getTime()
      : room.createdAt
      ? new Date(room.createdAt).getTime()
      : Date.now();

    const elapsedMs = Math.max(0, Date.now() - startedAtMs);

    // Sincronizar el primer disparo con el tiempo transcurrido desde el inicio de la partida
    const initialAirdropDelay = Math.max(
      1000,
      AIRDROP_INTERVAL_MS - (elapsedMs % AIRDROP_INTERVAL_MS)
    );
    const initialPetDelay = Math.max(
      1000,
      PET_INTERVAL_MS - (elapsedMs % PET_INTERVAL_MS)
    );

    let airdropInterval: any = null;
    let petInterval: any = null;

    const dropAirdrop = () => {
      // Filtrar únicamente los objetos/cajas que están actualmente en el suelo del mapa sin recoger
      const activeUnopenedCrates = cratesRef.current.filter((c) => !c.opened).length;
      const activeDroppedItems = droppedItemsRef.current.length;
      const currentLootCount = activeUnopenedCrates + activeDroppedItems;

      if (currentLootCount >= MAX_UNCLAIMED_LOOT) {
        // Hay 3 o más armas/suministros sin recoger en el terreno: pausar lanzamiento de paracaídas
        return;
      }

      const newCrate = createAirdropCrate(
        { lat: room.centerLat, lng: room.centerLng },
        room.playAreaRadius
      );
      setCrates((prev) => {
        const updated = [...prev, newCrate];
        syncRoomEntitiesToSupabase(room.id, { crates: updated });
        return updated;
      });
      realtimeRef.current.broadcastNewAirdrop(newCrate);
      soundEffects.playCrateLoot();
      addLog('🪂 ¡Airdrop táctico detectado! Cayendo en paracaídas', 'loot');
    };

    const spawnPet = () => {
      // Filtrar únicamente las mascotas libres en el mapa (no las adoptadas por jugadores)
      const currentWildPetsCount = wildPetsRef.current.length;

      if (currentWildPetsCount >= MAX_UNCLAIMED_WILD_PETS) {
        // Hay 3 o más mascotas libres: no generar nuevas
        return;
      }

      const newPet = generateSingleWildPet(
        { lat: room.centerLat, lng: room.centerLng },
        room.playAreaRadius
      );
      setWildPets((prev) => {
        const updated = [...prev, newPet];
        syncRoomEntitiesToSupabase(room.id, { wildPets: updated });
        return updated;
      });
      realtimeRef.current.broadcastNewWildPet(newPet);
      addLog(`🐾 Se ha avistado una nueva criatura en el mapa: ${newPet.pet.name} ${newPet.pet.icon}`, 'info');
    };

    const airdropTimeout = setTimeout(() => {
      dropAirdrop();
      airdropInterval = setInterval(dropAirdrop, AIRDROP_INTERVAL_MS);
    }, initialAirdropDelay);

    const petTimeout = setTimeout(() => {
      spawnPet();
      petInterval = setInterval(spawnPet, PET_INTERVAL_MS);
    }, initialPetDelay);

    return () => {
      clearTimeout(airdropTimeout);
      clearTimeout(petTimeout);
      if (airdropInterval) clearInterval(airdropInterval);
      if (petInterval) clearInterval(petInterval);
    };
  }, [
    room?.id,
    room?.status,
    room?.startedAt,
    room?.createdAt,
    room?.centerLat,
    room?.centerLng,
    room?.playAreaRadius,
    myPlayer?.isHost,
    syncRoomEntitiesToSupabase,
    addLog,
  ]);

  // ==========================================
  // REANIMACIÓN DE COMPAÑEROS CAÍDOS
  // ==========================================
  useEffect(() => {
    if (
      room?.status !== 'playing' ||
      !myPlayer?.isAlive ||
      myPlayer?.isCriticallyWounded ||
      myPlayer?.status === 'critically_wounded'
    ) {
      setRevivingPlayerId(null);
      setReviveProgress(0);
      return;
    }

    const myCoord: Coordinates = {
      lat: myPlayer.lat ?? room.centerLat,
      lng: myPlayer.lng ?? room.centerLng,
    };

    const fallenTeammate = players.find(
      (p) => (!p.isAlive || p.isCriticallyWounded) && p.id !== myPlayer.id && p.lat && p.lng
    );

    if (!fallenTeammate) {
      setRevivingPlayerId(null);
      setReviveProgress(0);
      return;
    }

    const distToTomb = getDistanceMeters(myCoord, {
      lat: fallenTeammate.lat!,
      lng: fallenTeammate.lng!,
    });

    const maxReviveDist = getReviveDistanceMeters(myPlayer.role);
    const requiredDuration = getReviveDurationSeconds(myPlayer.role);

    if (distToTomb <= maxReviveDist) {
      // Comprobar si el monstruo está a menos de 40m para congelar
      const distToMonster = getDistanceMeters(myCoord, monster);
      if (distToMonster < 40) {
        // Congelado
        return;
      }

      setRevivingPlayerId(fallenTeammate.id);
      const interval = window.setInterval(() => {
        setReviveProgress((prev) => {
          const next = prev + 1;
          if (next >= requiredDuration) {
            // Completado
            realtime.broadcastPlayerRevived(fallenTeammate.id, myPlayer.nickname);
            setMyPlayer((p) => (p ? { ...p, revivesDone: p.revivesDone + 1 } : null));
            setRevivingPlayerId(null);
            return 0;
          }
          return next;
        });
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    } else {
      setRevivingPlayerId(null);
      setReviveProgress(0);
    }
  }, [myPlayer?.lat, myPlayer?.lng, myPlayer?.isAlive, myPlayer?.role, players, monster, room?.centerLat, room?.centerLng, realtime]);

  // ==========================================
  // RESOLUCIÓN DE FIN DE PARTIDA
  // ==========================================
  const handleGameEnd = async (result: 'victory' | 'defeat') => {
    if (!room) return;

    if (room.id) {
      try {
        localStorage.removeItem(`utopia_chest_progress_${room.id}`);
        clearPlayerSessionSnapshot(room.id);
      } catch {
        // Ignorar
      }
    }
    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);
    setRoom((prev) => (prev ? { ...prev, status: result } : null));

    // Actualizar en base de datos mediante RPC o update
    try {
      await (supabase.rpc as any)('set_game_status', {
        p_game_id: room.id,
        p_status: result,
      });
    } catch {
      await (supabase.from('games') as any).update({ status: result }).eq('id', room.id);
    }

    // Inserción de estadísticas personales en match_stats
    if (myPlayer) {
      await (supabase.from('match_stats') as any).insert({
        game_id: room.id,
        nickname: myPlayer.nickname,
        role: myPlayer.role,
        damage_dealt: myPlayer.damageDealt,
        revives_done: myPlayer.revivesDone,
        crates_opened: myPlayer.cratesOpened,
        monster_kills: myPlayer.monsterKills,
        won: result === 'victory',
        score: myPlayer.damageDealt + myPlayer.revivesDone * 100,
      });
    }
  };

  // ==========================================
  // CANCELAR Y ABANDONAR PARTIDA
  // ==========================================
  const handleCancelGame = async () => {
    if (!room || !myPlayer?.isHost) return;

    soundEffects.playAlarm();
    try {
      await (supabase.rpc as any)('set_game_status', {
        p_game_id: room.id,
        p_status: 'cancelled',
      });
    } catch {
      await (supabase.from('games') as any).update({ status: 'cancelled' }).eq('id', room.id);
    }

    realtime.broadcastGameCancelled('Misión abortada por el anfitrión');
    monsterAIRef.current = null;
    soundEffects.stopAll();

    if (room.id) {
      try {
        localStorage.removeItem(`utopia_chest_progress_${room.id}`);
        clearPlayerSessionSnapshot(room.id);
      } catch {
        // Ignorar
      }
    }
    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);
    setRoom(null);
    setMyPlayer(null);
    setPlayers([]);
    setCrates([]);
    setDroppedItems([]);
    setChestPhase(1);
    setChestStep(0);
    setIsChestLockModalOpen(false);
    setIsChestInteractedGlobally(false);
  };

  const handleLeaveGame = async () => {
    if (!room || !myPlayer) return;

    try {
      await (supabase.from('players') as any).delete().eq('id', myPlayer.id);
    } catch (err) {
      console.warn('Error al desvincular jugador de la tabla players:', err);
    }

    monsterAIRef.current = null;
    soundEffects.stopAll();

    if (room.id) {
      try {
        localStorage.removeItem(`utopia_chest_progress_${room.id}`);
        clearPlayerSessionSnapshot(room.id);
      } catch {
        // Ignorar
      }
    }
    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);
    setRoom(null);
    setMyPlayer(null);
    setPlayers([]);
    setCrates([]);
    setDroppedItems([]);
    setChestPhase(1);
    setChestStep(0);
    setIsChestLockModalOpen(false);
    setIsChestInteractedGlobally(false);
  };

  // ==========================================
  // GESTIÓN DE MOCHILA / INVENTARIO Y OBJETOS DEL TERRENO
  // ==========================================
  const nearbyDroppedItems = useMemo(() => {
    if (!myPlayer?.lat || !myPlayer?.lng) return [];
    const myPos = { lat: myPlayer.lat, lng: myPlayer.lng };
    return droppedItems.filter((d) => {
      const dist = getDistanceMeters(myPos, { lat: d.lat, lng: d.lng });
      return dist <= 20;
    });
  }, [droppedItems, myPlayer?.lat, myPlayer?.lng]);

  const handleEquipItem = useCallback((item: InventoryItem) => {
    setMyPlayer((prev) => {
      if (!prev) return null;
      const weapon = inventoryItemToWeapon(item);
      addLog(`Arma equipada: ${item.name} (Tier ${item.tier}).`, 'info');
      soundEffects.vibrate(30);
      return {
        ...prev,
        equippedWeapon: weapon,
        equippedItemId: item.id,
      };
    });
  }, [addLog]);

  const handleDropItem = useCallback((itemToDrop: InventoryItem) => {
    if (!myPlayerRef.current) return;
    const player = myPlayerRef.current;
    const myPos = {
      lat: player.lat ?? roomRef.current?.centerLat ?? 0,
      lng: player.lng ?? roomRef.current?.centerLng ?? 0,
    };

    const dropped: DroppedItem = {
      id: crypto.randomUUID(),
      item: itemToDrop,
      lat: myPos.lat,
      lng: myPos.lng,
      droppedAt: Date.now(),
      droppedBy: player.nickname,
    };

    setDroppedItems((prev) => [...prev, dropped]);
    realtimeRef.current.broadcastItemDropped(dropped);

    setMyPlayer((prev) => {
      if (!prev) return null;
      const currentInv = prev.inventory || getDefaultInventoryForRole(prev.role);
      const updatedInv = currentInv.filter((it) => it.id !== itemToDrop.id);

      let nextWeapon = prev.equippedWeapon;
      let nextItemId = prev.equippedItemId;

      if (prev.equippedItemId === itemToDrop.id || updatedInv.length === 0) {
        const nextBest = getBestWeaponInInventory(updatedInv);
        nextWeapon = inventoryItemToWeapon(nextBest);
        nextItemId = nextBest.id;
      }

      addLog(`Has soltado ${itemToDrop.name} (Tier ${itemToDrop.tier}) en el terreno.`, 'info');
      if (updatedInv.length === 0) {
        addLog('Mochila vacía. ¡Combatiendo con Puños (Tier 0)!', 'warning');
      }
      soundEffects.playCrateLoot();

      return {
        ...prev,
        inventory: updatedInv,
        equippedWeapon: nextWeapon,
        equippedItemId: nextItemId,
      };
    });
  }, [addLog]);

  const handlePickDroppedItem = useCallback((dropped: DroppedItem) => {
    if (!myPlayerRef.current) return;
    const player = myPlayerRef.current;
    const myPos = {
      lat: player.lat ?? roomRef.current?.centerLat ?? 0,
      lng: player.lng ?? roomRef.current?.centerLng ?? 0,
    };

    const dist = getDistanceMeters(myPos, { lat: dropped.lat, lng: dropped.lng });
    if (dist > 25) {
      handleMapClickRef.current?.({ lat: dropped.lat, lng: dropped.lng });
      addLog(`Desplazándose hacia ${dropped.item.name}...`, 'info');
      return;
    }

    setDroppedItems((prev) => prev.filter((d) => d.id !== dropped.id));
    realtimeRef.current.broadcastItemPicked(dropped.id);

    setMyPlayer((prev) => {
      if (!prev) return null;
      const result = applyDroppedItemPickup(dropped, prev);
      addLog(result.logMessage, result.logType);
      soundEffects.playCrateLoot();
      return result.updatedPlayer;
    });
  }, [addLog]);

  const handleAdoptWildPet = useCallback((wp: WildPet) => {
    if (!myPlayerRef.current) return;
    const player = myPlayerRef.current;
    if (!player.isAlive || player.isCriticallyWounded || player.status === 'critically_wounded') return;

    const currentPets = player.pets || [];
    if (currentPets.length >= MAX_PETS_PER_PLAYER) {
      addLog('CAPACIDAD MÁXIMA DE MASCOTAS (3/3): No puedes vincular más acompañantes.', 'warning');
      soundEffects.playAlarm();
      soundEffects.vibrate(150);
      return;
    }

    const myPos = {
      lat: player.lat ?? roomRef.current?.centerLat ?? 0,
      lng: player.lng ?? roomRef.current?.centerLng ?? 0,
    };

    const dist = getDistanceMeters(myPos, { lat: wp.lat, lng: wp.lng });
    if (dist > PET_ADOPTION_RADIUS_METERS) {
      handleMapClickRef.current?.({ lat: wp.lat, lng: wp.lng });
      addLog(`Desplazándose hacia ${wp.pet.name}...`, 'info');
      return;
    }

    setWildPets((prev) => {
      const updated = prev.filter((p) => p.id !== wp.id);
      if (roomRef.current?.id) {
        syncRoomEntitiesToSupabase(roomRef.current.id, { wildPets: updated });
      }
      return updated;
    });

    setMyPlayer((prev) => {
      if (!prev) return null;
      const prevPets = prev.pets || [];
      if (prevPets.some((p) => p.id === wp.pet.id) || prevPets.length >= MAX_PETS_PER_PLAYER) return prev;

      const updatedPets = [...prevPets, wp.pet];
      addLog(`¡Has adoptado a ${wp.pet.name} ${wp.pet.icon}! Te acompañará fielmente en la misión.`, 'loot');
      soundEffects.playCrateLoot();

      realtimeRef.current.broadcastPetAdopted(wp.id, prev.nickname, wp.pet);

      if (prev.lat && prev.lng) {
        realtimeRef.current.broadcastPlayerMove(
          prev.lat,
          prev.lng,
          prev.hp,
          true,
          prev.status,
          prev.isCriticallyWounded,
          prev.insideBuildingId,
          prev.insideBuildingType,
          updatedPets
        );
      }

      return {
        ...prev,
        pets: updatedPets,
      };
    });
  }, [addLog]);

  // ==========================================
  // ACCIONES DE LOBBY: CREAR Y UNIRSE
  // ==========================================
  const handleCreateRoom = async (config: {
    roomName: string;
    isPublic: boolean;
    radiusMeters: number;
    movementMode: MovementMode;
    playerSpeed: PlayerSpeed;
    center: Coordinates;
    nickname: string;
    role: PlayerRole;
  }) => {
    soundEffects.initOnUserInteraction();
    const userId = currentUserId || (await ensureAnonymousAuth());

    // Generar código de sala de 6 letras
    let roomCode = '';
    const { data: codeData } = await (supabase.rpc as any)('generate_room_code');
    if (codeData) {
      roomCode = codeData;
    } else {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < 6; i++) {
        roomCode += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }

    // Ubicación del cofre del tesoro dentro del radio
    const treasureLoc = getRandomPointInCircle(config.center, config.radiusMeters * 0.4);

    // Spawn point seguro del anfitrión dentro del radio de juego (20% a 70% del radio)
    const hostSpawnPoint = getRandomSpawnPointInPlayArea(
      config.center,
      config.radiusMeters,
      0.2,
      0.7
    );

    // Generar lote base mínimo inicial autoritativo (3 cajas de suministros y 1 mascota silvestre)
    const initialCrates = generateInitialCrates(
      config.center,
      config.radiusMeters,
      3
    );

    const initialPets = generateWildPets(
      { lat: config.center.lat, lng: config.center.lng },
      config.radiusMeters,
      1
    );

    // Insertar partida en Supabase con tolerancia a columnas opcionales
    const hostRoomSpeed: PlayerSpeed = config.playerSpeed || DEFAULT_PLAYER_SPEED;
    const basePayload = {
      code: roomCode,
      name: config.roomName,
      host_id: userId,
      status: 'lobby',
      movement_mode: config.movementMode,
      player_speed: hostRoomSpeed,
      active_crates: initialCrates,
      active_wild_pets: initialPets,
      active_dropped_items: [],
      active_loot: initialCrates,
      settings: {
        player_speed: hostRoomSpeed,
        active_crates: initialCrates,
        active_wild_pets: initialPets,
        active_dropped_items: [],
        current_chest_index: 1,
      },
      play_area_radius: config.radiusMeters,
      center_lat: config.center.lat,
      center_lng: config.center.lng,
      treasure_lat: treasureLoc.lat,
      treasure_lng: treasureLoc.lng,
      chest_unlocked_steps: 0,
      chest_current_phase: 1,
      chest_progress_pct: 0,
    };

    let gameData: any = null;
    let gameError: any = null;

    // Inserción completa con is_public y player_speed
    const resFull = await (supabase.from('games') as any)
      .insert({ ...basePayload, is_public: config.isPublic })
      .select()
      .single();

    if (resFull.error) {
      // Fallback defensivo si player_speed no existe aún en la tabla remota
      const { player_speed, settings, ...legacyPayload } = basePayload;
      const resWithPublic = await (supabase.from('games') as any)
        .insert({ ...legacyPayload, is_public: config.isPublic })
        .select()
        .single();

      if (resWithPublic.error) {
        // Fallback mínimo sin is_public ni player_speed
        const resFallback = await (supabase.from('games') as any)
          .insert(legacyPayload)
          .select()
          .single();
        gameData = resFallback.data;
        gameError = resFallback.error;
      } else {
        gameData = resWithPublic.data;
      }
    } else {
      gameData = resFull.data;
    }

    if (gameError || !gameData) {
      console.error('Error al crear sala:', gameError);
      alert('Error al crear la sala. Verifica tu conexión a Supabase.');
      return;
    }

    const hostInventory = getDefaultInventoryForRole(config.role);
    const hostBestWeapon = getBestWeaponInInventory(hostInventory);

    // Insertar jugador Host en la posición de spawn generada
    const maxHp = getMaxHpForRole(config.role);
    const { data: playerData, error: playerError } = await (supabase
      .from('players') as any)
      .insert({
        game_id: gameData.id,
        user_id: userId,
        nickname: config.nickname,
        role: config.role,
        hp: maxHp,
        max_hp: maxHp,
        is_alive: true,
        status: 'active',
        lat: hostSpawnPoint.lat,
        lng: hostSpawnPoint.lng,
        inventory: hostInventory,
        pets: [],
      })
      .select()
      .single();

    if (playerError || !playerData) {
      console.error('Error al crear perfil de jugador:', playerError);
      return;
    }

    const resolvedHostSpeed: PlayerSpeed =
      (gameData?.settings?.player_speed as PlayerSpeed) ??
      (gameData?.player_speed as PlayerSpeed) ??
      hostRoomSpeed;

    const newRoom: GameRoom = {
      id: gameData.id,
      code: gameData.code,
      name: gameData.name ?? undefined,
      hostId: gameData.host_id,
      status: gameData.status,
      isPublic: gameData.is_public ?? config.isPublic ?? true,
      movementMode: gameData.movement_mode,
      playerSpeed: resolvedHostSpeed,
      playAreaRadius: gameData.play_area_radius,
      centerLat: gameData.center_lat,
      centerLng: gameData.center_lng,
      center_lat: gameData.center_lat,
      center_lng: gameData.center_lng,
      treasureLat: gameData.treasure_lat ?? gameData.settings?.treasure_lat,
      treasureLng: gameData.treasure_lng ?? gameData.settings?.treasure_lng,
      treasure_lat: gameData.treasure_lat ?? gameData.settings?.treasure_lat,
      treasure_lng: gameData.treasure_lng ?? gameData.settings?.treasure_lng,
      currentChestIndex: gameData?.settings?.current_chest_index ?? 1,
      chestPhase: gameData.chest_current_phase ?? 1,
      chestStep: (gameData.chest_unlocked_steps ?? 0) % 2,
      chestUnlockedSteps: gameData.chest_unlocked_steps ?? 0,
      chestCurrentPhase: gameData.chest_current_phase ?? 1,
      chestProgressPct: gameData.chest_progress_pct ?? 0,
      createdAt: gameData.created_at,
      startedAt: gameData.started_at,
    };

    const hostPlayer: Player = {
      id: playerData.id,
      userId,
      gameId: gameData.id,
      nickname: config.nickname,
      role: config.role,
      hp: maxHp,
      maxHp,
      isAlive: true,
      status: 'active',
      isCriticallyWounded: false,
      lat: hostSpawnPoint.lat,
      lng: hostSpawnPoint.lng,
      damageDealt: 0,
      revivesDone: 0,
      cratesOpened: 0,
      monsterKills: 0,
      isHost: true,
      inventory: hostInventory,
      pets: [],
      equippedWeapon: inventoryItemToWeapon(hostBestWeapon),
      equippedItemId: hostBestWeapon.id,
    };

    // Inicializar monstruo 1 en el cofre del tesoro
    const initMonster = createSequentialMonster(1, treasureLoc, config.radiusMeters);
    setMonster(initMonster);
    setMonsters([initMonster]);

    // Resetear explícitamente el progreso del cofre a 0 cerrojos y Fase 1 al crear una sala nueva
    const initialChestIdx = gameData?.settings?.current_chest_index ?? 1;
    setCurrentChestIndex(initialChestIdx);
    currentChestIndexRef.current = initialChestIdx;
    setChestPhase(1);
    setChestStep(0);
    chestPhaseRef.current = 1;
    chestStepRef.current = 0;
    setIsChestLockModalOpen(false);
    setIsChestInteractedGlobally(false);

    try {
      localStorage.setItem(`utopia_chest_progress_${gameData.id}`, JSON.stringify({ phase: 1, step: 0 }));
    } catch {
      // Ignorar error de storage
    }

    setRoom(newRoom);
    setMyPlayer(hostPlayer);
    savePlayerSessionSnapshot(gameData.id, hostPlayer, resolvedHostSpeed);
    setPlayers([hostPlayer]);
    setCrates(initialCrates);
    setWildPets(initialPets);
    setDroppedItems([]);
    resetPosition(hostSpawnPoint);
    localStorage.setItem('utopia_active_room', gameData.code);
    setSavedActiveRoomCode(gameData.code);
    setShowCreateModal(false);
  };

  const handleJoinRoom = async (config: {
    code: string;
    nickname?: string;
    role?: PlayerRole;
  }) => {
    soundEffects.initOnUserInteraction();
    const userId = currentUserId || (await ensureAnonymousAuth());

    // Buscar sala por código
    const { data: gameData, error: gameError } = await (supabase
      .from('games') as any)
      .select('*')
      .eq('code', config.code.toUpperCase())
      .single();

    if (gameError || !gameData) {
      alert('Código de sala no encontrado. Revisa que sea correcto.');
      return;
    }

    // Comprobar estado de la partida
    if (gameData.status === 'victory' || gameData.status === 'defeat' || gameData.status === 'cancelled' || gameData.ended_at) {
      alert(`La partida ya ha concluido (Estado: ${gameData.status ? gameData.status.toUpperCase() : 'FINALIZADA'}).`);
      localStorage.removeItem('utopia_active_room');
      setSavedActiveRoomCode(null);
      if (gameData.id) {
        clearPlayerSessionSnapshot(gameData.id);
      }
      return;
    }

    // 1. Verificar si este usuario ya está registrado en la sala (Reconexión sin error de unique key)
    const { data: existingPlayer } = await (supabase
      .from('players') as any)
      .select('*')
      .eq('game_id', gameData.id)
      .eq('user_id', userId)
      .maybeSingle();

    let playerData = existingPlayer;
    let spawnCoords: Coordinates;
    let localSnapshot: any = null;
    try {
      const rawLocal =
        sessionStorage.getItem(`utopia_player_session_${gameData.id}`) ||
        localStorage.getItem(`utopia_player_session_${gameData.id}`);
      if (rawLocal) {
        localSnapshot = JSON.parse(rawLocal);
      }
    } catch (err) {
      console.warn('Error leyendo snapshot local de sesión:', err);
    }

    if (!existingPlayer) {
      // 2. Si es un jugador nuevo:
      // Si falta apodo o rol, abrir el modal de unión para que lo introduzca
      if (!config.nickname || !config.role) {
        setJoinModalInitialCode(config.code.toUpperCase());
        setShowJoinModal(true);
        return;
      }

      // 3. Comprobar colisión de apodo con otros jugadores en la sala
      const { data: teammates } = await (supabase
        .from('players') as any)
        .select('nickname')
        .eq('game_id', gameData.id);

      let finalNickname = config.nickname.trim();
      if (teammates && teammates.length > 0) {
        const takenNicknames = new Set(
          teammates.map((p: any) => (p.nickname || '').trim().toLowerCase())
        );
        if (takenNicknames.has(finalNickname.toLowerCase())) {
          let suffix = 2;
          while (takenNicknames.has(`${finalNickname}_${suffix}`.toLowerCase())) {
            suffix++;
          }
          finalNickname = `${finalNickname}_${suffix}`;
          addLog(`Apodo en uso. Asignado apodo de escuadra: ${finalNickname}`, 'info');
        }
      }

      const maxHp = getMaxHpForRole(config.role);

      // Calcular spawn point dinámico dentro del radio de juego de la sala (entre 20% y 70%)
      const roomCenter: Coordinates = {
        lat: gameData.center_lat,
        lng: gameData.center_lng,
      };
      spawnCoords = getRandomSpawnPointInPlayArea(
        roomCenter,
        gameData.play_area_radius,
        0.2,
        0.7
      );

      // Insertar nuevo jugador
      const { data: insertedData, error: playerError } = await (supabase
        .from('players') as any)
        .insert({
          game_id: gameData.id,
          user_id: userId,
          nickname: finalNickname,
          role: config.role,
          hp: maxHp,
          max_hp: maxHp,
          is_alive: true,
          status: 'active',
          lat: spawnCoords.lat,
          lng: spawnCoords.lng,
          inventory: getDefaultInventoryForRole(config.role),
          pets: [],
        })
        .select()
        .single();

      if (playerError || !insertedData) {
        console.error('Error al unirse:', playerError);
        alert('No se pudo unir a la sala. Inténtalo de nuevo.');
        return;
      }
      playerData = insertedData;
      addLog(`¡Te has unido a la escuadra como ${playerData.nickname}!`, 'info');
    } else {
      // Reconexión transparente de jugador existente
      const hasValidSnapshotCoords =
        localSnapshot &&
        typeof localSnapshot.lat === 'number' &&
        !isNaN(localSnapshot.lat) &&
        localSnapshot.lat !== 0 &&
        typeof localSnapshot.lng === 'number' &&
        !isNaN(localSnapshot.lng) &&
        localSnapshot.lng !== 0;

      const hasValidPlayerCoords =
        playerData &&
        typeof playerData.lat === 'number' &&
        !isNaN(playerData.lat) &&
        playerData.lat !== 0 &&
        typeof playerData.lng === 'number' &&
        !isNaN(playerData.lng) &&
        playerData.lng !== 0;

      if (hasValidSnapshotCoords) {
        spawnCoords = { lat: localSnapshot.lat, lng: localSnapshot.lng };
      } else if (hasValidPlayerCoords) {
        spawnCoords = { lat: playerData.lat, lng: playerData.lng };
      } else {
        spawnCoords = {
          lat: gameData.center_lat,
          lng: gameData.center_lng,
        };
      }
      addLog(`¡Bienvenido de vuelta, ${playerData.nickname}! Reconectando a la misión...`, 'info');
    }

    // Determinar la velocidad autoritativa de la partida respetando los ajustes de la sala
    const roomPlayerSpeed: PlayerSpeed =
      (gameData?.settings?.player_speed as PlayerSpeed) ??
      (gameData?.player_speed as PlayerSpeed) ??
      (localSnapshot?.playerSpeed as PlayerSpeed) ??
      DEFAULT_PLAYER_SPEED;

    const currentRoom: GameRoom = {
      id: gameData.id,
      code: gameData.code,
      name: gameData.name ?? undefined,
      hostId: gameData.host_id,
      status: gameData.status,
      isPublic: gameData.is_public ?? true,
      movementMode: gameData.movement_mode,
      playerSpeed: roomPlayerSpeed,
      playAreaRadius: gameData.play_area_radius,
      centerLat: gameData.center_lat,
      centerLng: gameData.center_lng,
      center_lat: gameData.center_lat,
      center_lng: gameData.center_lng,
      treasureLat: gameData.treasure_lat ?? gameData.settings?.treasure_lat,
      treasureLng: gameData.treasure_lng ?? gameData.settings?.treasure_lng,
      treasure_lat: gameData.treasure_lat ?? gameData.settings?.treasure_lat,
      treasure_lng: gameData.treasure_lng ?? gameData.settings?.treasure_lng,
      currentChestIndex: gameData?.settings?.current_chest_index ?? 1,
      chestPhase: gameData.chest_current_phase ?? 1,
      chestStep: (gameData.chest_unlocked_steps ?? 0) % 2,
      chestUnlockedSteps: gameData.chest_unlocked_steps ?? 0,
      chestCurrentPhase: gameData.chest_current_phase ?? 1,
      chestProgressPct: gameData.chest_progress_pct ?? 0,
      createdAt: gameData.created_at,
      startedAt: gameData.started_at,
    };

    const finalRole = (playerData.role as PlayerRole) || config.role || 'medic';
    const finalMaxHp = playerData.max_hp ?? getMaxHpForRole(finalRole);

    // Recuperar inventario: Snapshot local > Base de datos > Inventario por defecto
    let restoredInventory: InventoryItem[] = getDefaultInventoryForRole(finalRole);
    if (
      localSnapshot?.inventory &&
      Array.isArray(localSnapshot.inventory) &&
      localSnapshot.inventory.length > 0
    ) {
      restoredInventory = localSnapshot.inventory;
    } else if (
      playerData.inventory &&
      Array.isArray(playerData.inventory) &&
      playerData.inventory.length > 0
    ) {
      restoredInventory = playerData.inventory;
    }

    // Recuperar mascotas: Snapshot local > Base de datos > []
    let restoredPets: Pet[] = [];
    if (
      localSnapshot?.pets &&
      Array.isArray(localSnapshot.pets) &&
      localSnapshot.pets.length > 0
    ) {
      restoredPets = localSnapshot.pets;
    } else if (
      playerData.pets &&
      Array.isArray(playerData.pets) &&
      playerData.pets.length > 0
    ) {
      restoredPets = playerData.pets;
    }

    // Recuperar salud y estado crítico
    const restoredHp =
      localSnapshot?.hp != null ? localSnapshot.hp : (playerData.hp ?? finalMaxHp);
    const restoredStatus: PlayerStatus =
      localSnapshot?.status ||
      (playerData.status as PlayerStatus) ||
      (restoredHp <= 0 ? 'critically_wounded' : 'active');
    const restoredIsCriticallyWounded: boolean =
      localSnapshot?.isCriticallyWounded ??
      (restoredStatus === 'critically_wounded' || restoredHp <= 0);

    // Recuperar arma equipada
    let restoredEquippedItemId: string | undefined = localSnapshot?.equippedItemId;
    let restoredEquippedWeapon: Weapon | undefined = localSnapshot?.equippedWeapon;

    if (!restoredEquippedWeapon) {
      const best = getBestWeaponInInventory(restoredInventory);
      restoredEquippedWeapon = inventoryItemToWeapon(best);
      restoredEquippedItemId = best.id;
    }

    const player: Player = {
      id: playerData.id,
      userId,
      gameId: gameData.id,
      nickname: playerData.nickname,
      role: finalRole,
      hp: restoredHp,
      maxHp: finalMaxHp,
      isAlive: playerData.is_alive ?? true,
      status: restoredStatus,
      isCriticallyWounded: restoredIsCriticallyWounded,
      lat: spawnCoords.lat,
      lng: spawnCoords.lng,
      damageDealt: playerData.damage_dealt ?? 0,
      revivesDone: playerData.revives_done ?? 0,
      cratesOpened: playerData.crates_opened ?? 0,
      monsterKills: playerData.monster_kills ?? 0,
      isHost: gameData.host_id === userId,
      inventory: restoredInventory,
      pets: restoredPets,
      equippedWeapon: restoredEquippedWeapon,
      equippedItemId: restoredEquippedItemId,
    };

    // Guardar snapshot local actualizado de la sesión
    savePlayerSessionSnapshot(gameData.id, player, roomPlayerSpeed);

    // Guardar sala activa en localStorage para reconexiones futuras
    localStorage.setItem('utopia_active_room', gameData.code);
    setSavedActiveRoomCode(gameData.code);

    // Sincronizar monstruos según la fase de cofre actual
    const currentChestIdx = gameData.settings?.current_chest_index ?? 1;
    const joinedMonsters: Monster[] = [];
    for (let cIdx = 1; cIdx <= currentChestIdx; cIdx++) {
      joinedMonsters.push(
        createSequentialMonster(
          cIdx,
          { lat: gameData.center_lat, lng: gameData.center_lng },
          gameData.play_area_radius
        )
      );
    }
    setMonster(joinedMonsters[0]);
    setMonsters(joinedMonsters);

    // Cargar todos los compañeros de escuadra registrados en la sala
    const { data: teammatesData } = await (supabase
      .from('players') as any)
      .select('*')
      .eq('game_id', gameData.id);

    if (teammatesData && teammatesData.length > 0) {
      setPlayers(
        teammatesData.map((d: any) => {
          if (d.id === player.id) {
            return player;
          }
          const teammateRole = (d.role as PlayerRole) || 'medic';
          const teammateInv =
            d.inventory && Array.isArray(d.inventory) && d.inventory.length > 0
              ? d.inventory
              : getDefaultInventoryForRole(teammateRole);
          const teammateBest = getBestWeaponInInventory(teammateInv);
          const teammatePets = d.pets && Array.isArray(d.pets) ? d.pets : [];
          const teammateStatus =
            (d.status as PlayerStatus) || (d.hp <= 0 ? 'critically_wounded' : 'active');
          return {
            id: d.id,
            userId: d.user_id,
            gameId: d.game_id,
            nickname: d.nickname,
            role: teammateRole,
            hp: d.hp,
            maxHp: d.max_hp,
            isAlive: d.is_alive,
            status: teammateStatus,
            isCriticallyWounded: teammateStatus === 'critically_wounded',
            lat: d.lat ?? gameData.center_lat,
            lng: d.lng ?? gameData.center_lng,
            damageDealt: d.damage_dealt,
            revivesDone: d.revives_done,
            cratesOpened: d.crates_opened,
            monsterKills: d.monster_kills,
            isHost: d.user_id === gameData.host_id,
            inventory: teammateInv,
            pets: teammatePets,
            equippedWeapon: inventoryItemToWeapon(teammateBest),
            equippedItemId: teammateBest.id,
          };
        })
      );
    } else {
      setPlayers([player]);
    }

    // Hidratar con las entidades autoritativas que realmente siguen vivas en la sala de Supabase
    // Guardia booleana estricta: prohibido regenerar lotes masivos si la partida ya existe o está en curso
    const dbCrates: SupplyCrate[] =
      (Array.isArray(gameData.active_crates) && gameData.active_crates.length > 0)
        ? gameData.active_crates
        : (Array.isArray(gameData.settings?.active_crates) && gameData.settings.active_crates.length > 0)
          ? gameData.settings.active_crates
          : (Array.isArray(gameData.active_loot) && gameData.active_loot.length > 0)
            ? gameData.active_loot
            : [];

    const dbWildPets: WildPet[] =
      (Array.isArray(gameData.active_wild_pets) && gameData.active_wild_pets.length > 0)
        ? gameData.active_wild_pets
        : (Array.isArray(gameData.settings?.active_wild_pets) && gameData.settings.active_wild_pets.length > 0)
          ? gameData.settings.active_wild_pets
          : [];

    const dbDroppedItems: DroppedItem[] =
      (Array.isArray(gameData.active_dropped_items) && gameData.active_dropped_items.length > 0)
        ? gameData.active_dropped_items
        : (Array.isArray(gameData.settings?.active_dropped_items) && gameData.settings.active_dropped_items.length > 0)
          ? gameData.settings.active_dropped_items
          : [];

    // Solo si la sala está en lobby y por alguna razón legacy estuviera vacía, sembrar lote inicial
    const finalCrates = (dbCrates.length > 0 || gameData.status === 'playing')
      ? dbCrates
      : generateInitialCrates({ lat: gameData.center_lat, lng: gameData.center_lng }, gameData.play_area_radius, 3);

    const finalWildPets = (dbWildPets.length > 0 || gameData.status === 'playing')
      ? dbWildPets
      : generateWildPets({ lat: gameData.center_lat, lng: gameData.center_lng }, gameData.play_area_radius, 1);

    setCrates(finalCrates);
    setWildPets(finalWildPets);
    setDroppedItems(dbDroppedItems);

    const joinedChestIdx = currentRoom.currentChestIndex ?? 1;
    setCurrentChestIndex(joinedChestIdx);
    currentChestIndexRef.current = joinedChestIdx;

    setRoom(currentRoom);
    setMyPlayer(player);
    resetPosition(spawnCoords);
    setShowJoinModal(false);
  };
  handleJoinRoomRef.current = handleJoinRoom;

  const handleStartGame = async () => {
    if (!room || !myPlayer?.isHost) return;

    const nowIso = new Date().toISOString();
    try {
      await (supabase.rpc as any)('set_game_status', {
        p_game_id: room.id,
        p_status: 'playing',
      });
      await (supabase.from('games') as any).update({ started_at: nowIso }).eq('id', room.id);
    } catch {
      await (supabase.from('games') as any).update({ status: 'playing', started_at: nowIso }).eq('id', room.id);
    }

    setRoom((prev) => (prev ? { ...prev, status: 'playing', startedAt: nowIso } : null));
    addLog('¡OPERACIÓN INICIADA! Buscad suministros y asegurad el tesoro.', 'info');
  };

  const handleMapClick = useCallback((coords: Coordinates) => {
    if (!room || isCombatArenaOpen || isHospitalModalOpen) return;

    if (myPlayer && !myPlayer.isAlive) {
      // MODO FANTASMA: EMITIR PING TÁCTICO
      const ping: GhostPing = {
        id: crypto.randomUUID(),
        lat: coords.lat,
        lng: coords.lng,
        timestamp: Date.now(),
        playerNickname: myPlayer.nickname,
        type: 'danger',
      };
      setGhostPings((prev) => [...prev, ping]);
      realtime.broadcastGhostPing(ping);
      soundEffects.playGhostPing();
    } else if (room.movementMode === 'manual' && myPlayer?.isAlive) {
      // MODO MANUAL: MOVERSE AL PUNTO SELECCIONADO
      // Si el toque es fuera del perímetro de juego, reajustar hacia el límite interior (95% del radio)
      const clickDist = getDistanceMeters(coords, { lat: room.centerLat, lng: room.centerLng });
      if (clickDist > room.playAreaRadius) {
        addLog('Destino fuera del área de operaciones. Reajustando al límite.', 'warning');
        const bearing = getBearing({ lat: room.centerLat, lng: room.centerLng }, coords);
        const clampedTarget = getDestinationPoint(
          { lat: room.centerLat, lng: room.centerLng },
          room.playAreaRadius * 0.95,
          bearing
        );
        setManualDestination(clampedTarget);
      } else {
        setManualDestination(coords);
      }
    }
  }, [room, myPlayer, addLog, realtime]);
  handleMapClickRef.current = handleMapClick;

  const handleGhostPing = (type: GhostPing['type']) => {
    if (!myPlayer) return;
    const ping: GhostPing = {
      id: crypto.randomUUID(),
      lat: myPlayer.lat ?? room?.centerLat ?? 0,
      lng: myPlayer.lng ?? room?.centerLng ?? 0,
      timestamp: Date.now(),
      playerNickname: myPlayer.nickname,
      type,
    };
    setGhostPings((prev) => [...prev, ping]);
    realtime.broadcastGhostPing(ping);
    soundEffects.playGhostPing();
  };

  const distToMonster = myPlayer
    ? getDistanceMeters(
        { lat: myPlayer.lat ?? room?.centerLat ?? 0, lng: myPlayer.lng ?? room?.centerLng ?? 0 },
        monster
      )
    : 999;

  const distToCenter =
    room && myPlayer?.lat != null && myPlayer?.lng != null
      ? getDistanceMeters(
          { lat: myPlayer.lat, lng: myPlayer.lng },
          { lat: room.centerLat, lng: room.centerLng }
        )
      : 0;
  const isOutOfPlayArea = room ? distToCenter > room.playAreaRadius : false;
  const outOfAreaMeters = room ? Math.round(distToCenter - room.playAreaRadius) : 0;

  const mapCenter = useMemo(
    () => ({ lat: room?.centerLat ?? 0, lng: room?.centerLng ?? 0 }),
    [room?.centerLat, room?.centerLng]
  );
  const mapTreasureLocation = useMemo(
    () => ({
      lat:
        (room as any)?.treasure_lat ??
        room?.treasureLat ??
        (room as any)?.settings?.treasure_lat ??
        (room as any)?.settings?.treasureLat ??
        room?.centerLat ??
        0,
      lng:
        (room as any)?.treasure_lng ??
        room?.treasureLng ??
        (room as any)?.settings?.treasure_lng ??
        (room as any)?.settings?.treasureLng ??
        room?.centerLng ??
        0,
    }),
    [
      room?.treasureLat,
      (room as any)?.treasure_lat,
      room?.treasureLng,
      (room as any)?.treasure_lng,
      room?.centerLat,
      room?.centerLng,
      (room as any)?.settings,
    ]
  );

  // ==========================================
  // RENDERIZADO DE LA INTERFAZ
  // ==========================================
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-hud-dark font-sans select-none">
      {/* 1. MAPA TÁCTICO WEBGL A PANTALLA COMPLETA */}
      {room && myPlayer ? (
        <GameMap
          center={mapCenter}
          playAreaRadius={room.playAreaRadius}
          treasureLocation={mapTreasureLocation}
          myPlayer={myPlayer}
          players={players}
          monster={monster}
          monsters={monsters}
          crates={crates}
          ghostPings={ghostPings}
          movementMode={room.movementMode}
          playerSpeed={room.playerSpeed}
          isRadarActive={isRadarActive}
          structures={structures}
          droppedItems={droppedItems}
          wildPets={wildPets}
          inCombat={isCombatArenaOpen}
          isChestOpened={room.status === 'victory'}
          isVictory={room.status === 'victory'}
          isChestLockModalOpen={isChestLockModalOpen}
          isChestTransitioning={isChestTransitioning}
          isChestGuarded={isChestGuarded}
          onMapClick={handleMapClick}
          onPickDroppedItem={handlePickDroppedItem}
          onAdoptWildPet={handleAdoptWildPet}
          onOpenChest={handleOpenChestModal}
        />
      ) : (
        /* PANTALLA DE INICIO / LOBBY PRINCIPAL */
        <div className="w-full h-full flex flex-col justify-between p-4 sm:p-8 relative overflow-y-auto bg-gradient-to-b from-[#080c10] via-[#0d1520] to-[#080c10]">
          {/* LÍNEAS TÁCTICAS HUD */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff08_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff08_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

          {/* CABECERA */}
          <div className="relative z-10 flex items-center justify-between pb-3 border-b border-hud-border/40">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <span className="text-xs font-mono font-black text-hud-cyan tracking-widest uppercase">
                UTOPIA // PROTOCOLO DE CAZA
              </span>
            </div>

            <button
              onClick={() => {
                soundEffects.initOnUserInteraction();
                setShowLeaderboard(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hud-panel border border-hud-border text-xs font-mono text-hud-muted hover:text-hud-cyan hover:border-hud-cyan transition-all"
            >
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span>Salón de la Fama</span>
            </button>
          </div>

          {/* CONTENEDOR CENTRAL */}
          <div className="relative z-10 max-w-2xl mx-auto w-full flex flex-col items-center gap-6 my-auto py-6">
            {/* HERO PRINCIPAL */}
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-hud-cyan/10 border-2 border-hud-cyan/60 flex items-center justify-center text-3xl sm:text-4xl shadow-2xl shadow-hud-cyan/20 animate-pulse">
                👹
              </div>

              <h1 className="text-2xl sm:text-4xl font-mono font-black tracking-wider uppercase text-white drop-shadow">
                Las Meriendas <br />
                <span className="bg-gradient-to-r from-hud-cyan via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                  Monster Hunt
                </span>
              </h1>

              <p className="text-xs sm:text-sm font-mono text-slate-300 max-w-md">
                Juego cooperativo táctico en tiempo real. Explora el mapa con GPS o Tap-to-Move, saquea airdrops con tu escuadra y asegura el cofre antes de que el Monstruo os devore.
              </p>

              {/* BOTÓN DESTACADO: REANUDAR MISIÓN EN CURSO */}
              {savedActiveRoomCode && (
                <div className="w-full max-w-sm p-3.5 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15 border-2 border-amber-500/80 rounded-2xl shadow-xl shadow-amber-500/10 flex flex-col gap-2 animate-pulse mt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-amber-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      MISIÓN EN CURSO
                    </span>
                    <span className="text-white font-mono font-bold tracking-widest bg-hud-dark px-2.5 py-0.5 rounded border border-amber-500/50">
                      {savedActiveRoomCode}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        soundEffects.initOnUserInteraction();
                        handleJoinRoom({ code: savedActiveRoomCode });
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-mono font-black text-xs uppercase tracking-wider shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Reanudar Misión en Curso</span>
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('utopia_active_room');
                        setSavedActiveRoomCode(null);
                      }}
                      className="px-3 py-2.5 rounded-xl bg-hud-dark border border-hud-border text-hud-muted hover:text-white font-mono text-xs hover:border-red-500/50"
                      title="Descartar sesión previa"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* ACCIONES RÁPIDAS DE LOBBY */}
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm mt-1">
                <button
                  onClick={() => {
                    soundEffects.initOnUserInteraction();
                    setShowCreateModal(true);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-hud-cyan to-teal-400 text-black font-mono font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-hud-cyan/30 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Crear Partida</span>
                </button>

                <button
                  onClick={() => {
                    soundEffects.initOnUserInteraction();
                    setTargetPrivateGame(null);
                    setJoinModalInitialCode('');
                    setShowJoinModal(true);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-hud-panel border-2 border-hud-cyan/60 hover:border-hud-cyan text-hud-cyan font-mono font-black text-xs sm:text-sm uppercase tracking-wider shadow-md hover:bg-hud-cyan/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Unirse con Código</span>
                </button>
              </div>
            </div>

            {/* SEPARADOR TÁCTICO */}
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 h-px bg-hud-border/60" />
              <span className="text-[10px] font-mono text-hud-muted uppercase tracking-widest">
                RADAR DE OPERACIONES TÁCTICAS
              </span>
              <div className="flex-1 h-px bg-hud-border/60" />
            </div>

            {/* EXPLORADOR DE OPERACIONES TÁCTICAS (PÚBLICAS Y PRIVADAS) */}
            <GameExplorer
              onJoinGame={(code: string, isPrivate?: boolean, targetGame?: ActiveGameItem) => {
                soundEffects.initOnUserInteraction();
                if (isPrivate && targetGame) {
                  setTargetPrivateGame({ id: targetGame.id, code: targetGame.code, name: targetGame.name });
                  setJoinModalInitialCode('');
                } else {
                  setTargetPrivateGame(null);
                  setJoinModalInitialCode(code);
                }
                setShowJoinModal(true);
              }}
              onCreateGame={() => {
                soundEffects.initOnUserInteraction();
                setShowCreateModal(true);
              }}
            />
          </div>

          {/* PIE DE PÁGINA */}
          <div className="relative z-10 text-center text-[10px] font-mono text-hud-muted pt-4 border-t border-hud-border/40">
            Desarrollado para Utopia • Supabase Realtime • MapLibre OpenFreeMap • Web Audio API
          </div>
        </div>
      )}

      {/* 2. HUD DE JUEGO (SI ESTÁ EN CURSO) */}
      {room && myPlayer && room.status === 'playing' && (
        <>
          <TacticalHeader
            roomCode={room.code}
            myPlayer={myPlayer}
            players={players}
            monster={monster}
            isRadarActive={isRadarActive}
            radarTimeRemaining={radarRemaining}
            stealthMode={stealthMode}
            onToggleStealth={() => {
              const next = !stealthMode;
              soundEffects.setStealthMode(next);
              setStealthMode(next);
            }}
            distToMonster={distToMonster}
            onCancelGame={handleCancelGame}
            onLeaveGame={handleLeaveGame}
          />

          {/* BARRA DE ACCIONES INFERIOR ORGANIZADA (MOCHILA + ARMA + HABILIDAD/CURA) */}
          <div className="fixed bottom-4 left-3 right-3 flex items-center gap-2 z-30 pointer-events-none pb-[env(safe-area-inset-bottom,0.5rem)]">
            <WeaponWheel
              weapon={myPlayer.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[myPlayer.role]}
              distToMonster={distToMonster}
              isInRange={
                distToMonster <=
                ((myPlayer.equippedWeapon?.rangeMeters ?? 25) *
                  (isRoleSkillActive && myPlayer.role === 'marksman' ? 1.5 : 1))
              }
              isFiring={isFiringWeapon}
              isCriticallyWounded={myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded'}
              backpackItemCount={myPlayer.inventory?.length ?? 2}
              onOpenBackpack={() => setIsBackpackOpen(true)}
              onAttack={manualAttack}
            />

            <RoleSkillButton
              role={myPlayer.role}
              cooldownRemaining={roleSkillCooldown}
              isActive={isRoleSkillActive || isRadarActive}
              onActivate={handleActivateRoleSkill}
              isAlive={myPlayer.isAlive}
              isCriticallyWounded={myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded'}
            />
          </div>

          {/* MODAL DE MOCHILA E INVENTARIO */}
          <BackpackModal
            isOpen={isBackpackOpen}
            onClose={() => setIsBackpackOpen(false)}
            inventory={myPlayer.inventory || getDefaultInventoryForRole(myPlayer.role)}
            pets={myPlayer.pets || []}
            equippedItemId={myPlayer.equippedItemId || myPlayer.equippedWeapon?.id}
            onEquipItem={handleEquipItem}
            onDropItem={handleDropItem}
            nearbyDroppedItems={nearbyDroppedItems}
            onPickDroppedItem={handlePickDroppedItem}
          />

          {/* OVERLAY DE ESTADO HERIDO DE MUERTE (VIGNETTE ROJA Y BRÚJULA AL HOSPITAL) */}
          {(myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded') && (
            <CriticallyWoundedOverlay
              playerCoord={{
                lat: myPlayer.lat ?? room.centerLat,
                lng: myPlayer.lng ?? room.centerLng,
              }}
              hospital={hospitalStructure}
            />
          )}

          {/* CONTENEDOR FLEXBOX VERTICAL PARA ALERTAS CENTRALES (Prioridad z-40, centro superior despejado) */}
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none w-full max-w-sm px-4">
            {/* BANNER DE ESTADO EN INTERIOR DE ESTRUCTURA (HOSPITAL O REFUGIO) */}
            {currentBuilding &&
              !isHospitalModalOpen &&
              !isCombatArenaOpen &&
              !(myPlayer.isCriticallyWounded || myPlayer.status === 'critically_wounded') && (
                <IndoorStatusBanner
                  building={currentBuilding}
                  isFullyHealed={isSquadFullyHealed}
                  onEnterHospital={() => {
                    setIsHospitalModalOpen(true);
                    cancelMovementRef.current();
                  }}
                />
              )}

            {/* AVISO TÁCTICO: FUERA DEL ÁREA DE JUEGO */}
            {isOutOfPlayArea && (
              <div className="pointer-events-auto w-full bg-red-950/90 border-2 border-red-500 text-red-200 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-pulse">
                <span className="text-xl shrink-0">⚠️</span>
                <div className="flex-1 text-xs font-mono min-w-0">
                  <span className="font-bold text-red-400 block uppercase tracking-wider truncate">
                    Fuera de Operaciones
                  </span>
                  <span className="text-[11px] leading-tight block text-red-200 truncate">
                    Estás a <strong className="text-white">{outOfAreaMeters}m</strong> del perímetro.
                    {room.movementMode === 'gps'
                      ? ' Acércate a la zona para combatir.'
                      : ' Toca dentro del círculo para volver.'}
                  </span>
                </div>
              </div>
            )}

            {/* AVISO TÁCTICO: HUIDA ACTIVA (5s) */}
            {fleeImmunityUntil > Date.now() && (
              <div className="pointer-events-auto w-full bg-amber-950/90 border-2 border-amber-400 text-amber-200 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-2.5 animate-pulse">
                <div className="flex items-center gap-2">
                  <Footprints className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="text-xs font-mono font-black uppercase tracking-wider">
                    ¡HUIDA ACTIVA! Aléjate del monstruo (+30% Sprint)
                  </span>
                </div>
                <span className="font-mono font-black text-sm text-amber-300">
                  {Math.max(1, Math.ceil((fleeImmunityUntil - Date.now()) / 1000))}s
                </span>
              </div>
            )}
          </div>

          {!isHospitalModalOpen && <CombatLog messages={combatLogs} onDismiss={handleDismissLog} />}

          {/* OVERLAY DE MODO FANTASMA CUANDO EL JUGADOR ESTÁ MUERTO */}
          {!myPlayer.isAlive && (
            <GhostOverlay
              reviveProgressSeconds={reviveProgress}
              reviveRequiredSeconds={getReviveDurationSeconds(myPlayer.role)}
              isBeingRevived={revivingPlayerId === myPlayer.id}
              isMonsterNearby={distToMonster < 40}
              onSendPing={handleGhostPing}
            />
          )}
        </>
      )}

      {/* 3. SALA DE ESPERA (LOBBY PRE-PARTIDA) */}
      {room && myPlayer && room.status === 'lobby' && (
        <WaitingRoom
          room={room}
          players={players}
          myPlayerId={myPlayer.id}
          isHost={!!myPlayer.isHost}
          onStartGame={handleStartGame}
          onLeaveRoom={myPlayer.isHost ? handleCancelGame : handleLeaveGame}
        />
      )}

      {/* 4. MODAL DE VICTORIA */}
      {room && room.status === 'victory' && (
        <VictoryModal
          players={players}
          myPlayer={myPlayer}
          currentUserId={myPlayer?.id || myPlayer?.userId}
          startedAt={room.startedAt}
          winnerNickname={room.winner}
          onRestart={() => {
            if (room?.id) {
              try {
                localStorage.removeItem(`utopia_chest_progress_${room.id}`);
                clearPlayerSessionSnapshot(room.id);
              } catch {
                // Ignorar
              }
            }
            localStorage.removeItem('utopia_active_room');
            setSavedActiveRoomCode(null);
            setRoom(null);
            setMyPlayer(null);
            setPlayers([]);
            setCrates([]);
            setDroppedItems([]);
            setWildPets([]);
            setChestPhase(1);
            setChestStep(0);
            setIsChestLockModalOpen(false);
            setIsChestInteractedGlobally(false);
          }}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {/* 5. MODAL DE DERROTA */}
      {room && room.status === 'defeat' && (
        <DefeatModal
          players={players}
          onRestart={() => {
            if (room?.id) {
              try {
                localStorage.removeItem(`utopia_chest_progress_${room.id}`);
                clearPlayerSessionSnapshot(room.id);
              } catch {
                // Ignorar
              }
            }
            localStorage.removeItem('utopia_active_room');
            setSavedActiveRoomCode(null);
            setRoom(null);
            setMyPlayer(null);
            setPlayers([]);
          }}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {/* MODALES FLOTANTES */}
      {showCreateModal && (
        <CreateRoomModal
          onConfirm={handleCreateRoom}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {showJoinModal && (
        <JoinRoomModal
          initialCode={joinModalInitialCode}
          targetPrivateGame={targetPrivateGame}
          onConfirm={handleJoinRoom}
          onCancel={() => {
            setShowJoinModal(false);
            setTargetPrivateGame(null);
          }}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}

      {/* 4. MODALES DE COMBATE EN TIEMPO REAL Y COFRE TÁCTICO */}
      {room && myPlayer && isCombatArenaOpen && (
        <CombatArena
          isOpen={isCombatArenaOpen}
          myPlayer={myPlayer}
          monster={monster}
          isRoleSkillActive={isRoleSkillActive}
          onAttack={handleArenaAttack}
          onPlayerDamaged={handleArenaPlayerDamaged}
          onPetDamaged={(updatedPets) => {
            setMyPlayer((prev) => (prev ? { ...prev, pets: updatedPets } : null));
            if (myPlayerRef.current) {
              myPlayerRef.current = { ...myPlayerRef.current, pets: updatedPets };
            }
            setPlayers((prev) =>
              prev.map((p) => (p.id === myPlayer.id ? { ...p, pets: updatedPets } : p))
            );
            if (myPlayer.lat && myPlayer.lng) {
              realtimeRef.current.broadcastPlayerMove(
                myPlayer.lat,
                myPlayer.lng,
                myPlayer.hp,
                true,
                myPlayer.status,
                myPlayer.isCriticallyWounded,
                myPlayer.insideBuildingId,
                myPlayer.insideBuildingType,
                updatedPets
              );
            }
          }}
          onAddLog={addLog}
          onFlee={handleArenaFlee}
          onClose={handleArenaClose}
        />
      )}

      {/* 4.1. MODAL DE ARENA DE COMBATE PVP EN TIEMPO REAL */}
      {room && myPlayer && isPvPModalOpen && pvpCombatId && pvpOpponentPlayerId && (
        <PvPArena
          isOpen={isPvPModalOpen}
          combatId={pvpCombatId}
          myPlayer={myPlayer}
          opponentPlayer={
            players.find((p) => p.id === pvpOpponentPlayerId) || {
              id: pvpOpponentPlayerId,
              userId: pvpOpponentPlayerId,
              gameId: room.id,
              nickname: 'Oponente',
              role: 'tank',
              hp: 100,
              maxHp: 100,
              isAlive: true,
              lat: myPlayer.lat,
              lng: myPlayer.lng,
              damageDealt: 0,
              revivesDone: 0,
              cratesOpened: 0,
              monsterKills: 0,
            }
          }
          queuedMonster={queuedMonster}
          isRoleSkillActive={isRoleSkillActive}
          onPlayerDamaged={(newHp) => {
            setMyPlayer((prev) => (prev ? { ...prev, hp: newHp } : null));
            if (myPlayerRef.current) {
              myPlayerRef.current.hp = newHp;
            }
            setPlayers((prev) =>
              prev.map((p) => (p.id === myPlayer.id ? { ...p, hp: newHp } : p))
            );
            if (room?.id) {
              (supabase.from('players') as any)
                .update({ hp: newHp })
                .eq('id', myPlayer.id);
            }
          }}
          onOpponentDamaged={(newHp) => {
            setPlayers((prev) =>
              prev.map((p) => (p.id === pvpOpponentPlayerId ? { ...p, hp: newHp } : p))
            );
          }}
          onPvPVictory={handlePvPVictory}
          onPvPDefeat={handlePvPDefeat}
          onFlee={handlePvPFlee}
          onClose={() => {
            setIsPvPModalOpen(false);
            isPvPModalOpenRef.current = false;
          }}
        />
      )}

      {/* 5. MODAL TÁCTICO DEL HOSPITAL DE CAMPAÑA */}
      {room && myPlayer && (
        <HospitalModal
          isOpen={isHospitalModalOpen}
          player={myPlayer}
          myPlayer={myPlayer}
          onClose={() => {
            setIsHospitalModalOpen(false);
            isHospitalModalOpenRef.current = false;
          }}
          onHealTick={handleHospitalHealTick}
          onDischargeComplete={handleHospitalDischargeComplete}
          onUpdatePlayer={setMyPlayer}
          onAddLog={addLog}
        />
      )}

      {Boolean(myPlayer && isChestLockModalOpen && !isCombatArenaOpen && !isPvPModalOpen) && (
        <ChestLockModal
          isOpen={isChestLockModalOpen && !isCombatArenaOpen && !isPvPModalOpen}
          currentPhase={chestPhase}
          currentStep={chestStep}
          currentChestIndex={currentChestIndex}
          totalChests={3}
          distToMonster={distToMonster}
          isMonsterAlive={isMonsterAlive(monster)}
          isGuarded={isChestGuarded}
          onStepSuccess={handleChestStepSuccess}
          onChestDecrypted={handleChestDecrypted}
          onVictory={handleChestDecrypted}
          onClose={handleCloseChestModal}
        />
      )}

      {/* OVERLAY DE CANCELACIÓN DE PARTIDA */}
      {cancelledAlertMessage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-hud-dark border-2 border-red-500 rounded-2xl p-6 max-w-sm w-full text-center flex flex-col items-center gap-3 shadow-2xl shadow-red-500/30 animate-pulse">
            <span className="text-4xl">⚠️</span>
            <h2 className="text-base font-mono font-black text-red-400 uppercase tracking-wider">
              {cancelledAlertMessage}
            </h2>
            <p className="text-xs font-mono text-hud-muted">
              Redirigiendo al lobby táctico principal...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
