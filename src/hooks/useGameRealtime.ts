import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  Monster,
  GhostPing,
  SupplyCrate,
  PlayerStatus,
  StructureType,
  DroppedItem,
  Pet,
  WildPet,
  PlayerSpeed,
} from '../types/game';
import { soundEffects } from '../services/soundEffects';

interface RealtimeCallbacks {
  onMonsterUpdate?: (monster: Monster) => void;
  onMonstersUpdate?: (monsters: Monster[]) => void;
  onChestTransition?: (payload: {
    currentChestIndex: number;
    treasureLat: number;
    treasureLng: number;
    newMonster?: Monster;
    monsters?: Monster[];
  }) => void;
  onPlayerMove?: (payload: {
    playerId?: string;
    userId?: string;
    lat: number;
    lng: number;
    hp?: number;
    isAlive?: boolean;
    status?: PlayerStatus;
    isCriticallyWounded?: boolean;
    insideBuildingId?: string | null;
    insideBuildingType?: StructureType | null;
    pets?: Pet[];
  }) => void;
  onPlayerDamaged?: (payload: { playerId: string; damage: number; currentHp: number }) => void;
  onMonsterDamaged?: (payload: { damage: number; fromPlayerId: string; currentHp: number; monsterId?: string }) => void;
  onGhostPing?: (ping: GhostPing) => void;
  onRadarActivated?: (payload: { activatedBy: string; expiresAt: number }) => void;
  onCrateLooted?: (payload: { crateId: string; playerId: string; playerNickname: string; weaponName: string }) => void;
  onPlayerRevived?: (payload: { revivedPlayerId: string; reviverNickname: string }) => void;
  onChestCountdown?: (payload: { secondsRemaining: number; holdersCount: number }) => void;
  onChestProgress?: (payload: { phase: number; step: number; updatedByNickname?: string }) => void;
  onChestInteracting?: (payload: { isInteracting: boolean; playerId: string }) => void;
  onItemDropped?: (dropped: DroppedItem) => void;
  onItemPicked?: (payload: { droppedItemId: string; playerId: string }) => void;
  onPetAdopted?: (payload: { wildPetId: string; playerId: string; playerNickname: string; pet: Pet }) => void;
  onNewAirdrop?: (payload: { crate: SupplyCrate }) => void;
  onNewWildPet?: (payload: { wildPet: WildPet }) => void;
  onRequestStateSync?: () => void;
  onFullStateSync?: (payload: {
    monster: Monster;
    monsters?: Monster[];
    crates: SupplyCrate[];
    chestCountdown: number;
    holdersCount: number;
    chestPhase?: number;
    chestStep?: number;
    currentChestIndex?: number;
    treasureLat?: number;
    treasureLng?: number;
    droppedItems?: DroppedItem[];
    wildPets?: WildPet[];
    playerSpeed?: PlayerSpeed;
  }) => void;
  onGameCancelled?: (payload: { reason?: string }) => void;
  onGameVictory?: (payload: { winnerTeam: boolean; unlockedBy: string }) => void;
  onPvPEncounter?: (payload: { combatId: string; player1Id: string; player2Id: string }) => void;
  onPvPEncounterEnd?: (payload: { combatId: string; winnerId?: string; loserId?: string }) => void;
  onChestClaimed?: (payload: { playerId: string; playerNickname: string; chestIndex: number }) => void;
  onPresenceSync?: (activeUserIds: string[]) => void;
}

export function useGameRealtime(
  roomCode: string | null,
  myPlayerId: string | null,
  myUserId: string | null,
  callbacks: RealtimeCallbacks,
  isHost?: boolean,
  gameId?: string | null,
  gameStatus?: string | null
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Keep-alive de actividad del Host (cada 2 minutos) para evitar que la sala expire
  useEffect(() => {
    if (!isHost || !gameId) return;
    if (gameStatus && gameStatus !== 'lobby' && gameStatus !== 'playing') return;

    const touchGameActivity = async () => {
      try {
        await (supabase.from('games') as any)
          .update({ updated_at: new Date().toISOString() })
          .eq('id', gameId);
      } catch (err) {
        console.warn('Error al enviar pulso de actividad del host:', err);
      }
    };

    // Actualización inicial
    touchGameActivity();

    const interval = setInterval(touchGameActivity, 120_000); // 2 minutos

    return () => clearInterval(interval);
  }, [isHost, gameId, gameStatus]);

  useEffect(() => {
    const targetRoomId = gameId || roomCode;
    if (!targetRoomId || !myPlayerId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isSubscribedRef.current = false;
        setIsConnected(false);
      }
      return;
    }

    // Estandarización del canal usando game.id (UUID)
    const channelName = `game_room:${targetRoomId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: myUserId || myPlayerId },
      },
    });

    // 1. ESCUCHAR ACTUALIZACIONES DEL MONSTRUO
    channel.on('broadcast', { event: 'monster_update' }, ({ payload }) => {
      callbacksRef.current.onMonsterUpdate?.(payload.monster);
    });

    channel.on('broadcast', { event: 'monsters_update' }, ({ payload }) => {
      callbacksRef.current.onMonstersUpdate?.(payload.monsters);
    });

    // 1.1. TRANSICIÓN SECUENCIAL DE COFRE Y MONSTRUOS
    channel.on('broadcast', { event: 'chest_transition' }, ({ payload }) => {
      callbacksRef.current.onChestTransition?.(payload);
    });

    // 2. ESCUCHAR MOVIMIENTO DE JUGADORES
    channel.on('broadcast', { event: 'player_move' }, ({ payload }) => {
      console.log('[Realtime:Move] Receive:', payload);
      callbacksRef.current.onPlayerMove?.(payload);
    });

    // 3. DAÑO A JUGADOR
    channel.on('broadcast', { event: 'player_hit' }, ({ payload }) => {
      callbacksRef.current.onPlayerDamaged?.(payload);
    });

    // 4. DAÑO AL MONSTRUO
    channel.on('broadcast', { event: 'monster_damaged' }, ({ payload }) => {
      callbacksRef.current.onMonsterDamaged?.(payload);
    });

    // 5. PINGS DE FANTASMA
    channel.on('broadcast', { event: 'ghost_ping' }, ({ payload }) => {
      soundEffects.playGhostPing();
      callbacksRef.current.onGhostPing?.(payload.ping);
    });

    // 6. ACTIVACIÓN DE RADAR
    channel.on('broadcast', { event: 'radar_activated' }, ({ payload }) => {
      soundEffects.playRadarPing();
      callbacksRef.current.onRadarActivated?.(payload);
    });

    // 7. CAJA SAQUEADA
    channel.on('broadcast', { event: 'crate_looted' }, ({ payload }) => {
      soundEffects.playCrateLoot();
      callbacksRef.current.onCrateLooted?.(payload);
    });

    // 8. JUGADOR REVIVIDO
    channel.on('broadcast', { event: 'player_revived' }, ({ payload }) => {
      callbacksRef.current.onPlayerRevived?.(payload);
    });

    // 9. CUENTA ATRÁS DEL COFRE (VICTORIA)
    channel.on('broadcast', { event: 'chest_countdown' }, ({ payload }) => {
      callbacksRef.current.onChestCountdown?.(payload);
    });

    // 9.1. PROGRESO COOPERATIVO DE FASES DEL COFRE
    channel.on('broadcast', { event: 'chest_progress' }, ({ payload }) => {
      callbacksRef.current.onChestProgress?.(payload);
    });

    // 9.2. INTERACCIÓN ACTIVA CON EL COFRE (ALERTA DE DEFENSA DEL MONSTRUO)
    channel.on('broadcast', { event: 'chest_interacting' }, ({ payload }) => {
      callbacksRef.current.onChestInteracting?.(payload);
    });

    // 9.3. DESCARTE DE OBJETOS EN EL MAPA
    channel.on('broadcast', { event: 'item_dropped' }, ({ payload }) => {
      callbacksRef.current.onItemDropped?.(payload.dropped);
    });

    // 9.4. RECOLECCIÓN DE OBJETOS DESCARTADOS
    channel.on('broadcast', { event: 'item_picked' }, ({ payload }) => {
      callbacksRef.current.onItemPicked?.(payload);
    });

    // 9.5. ADOPCIÓN DE MASCOTA SILVESTRE EN EL MAPA
    channel.on('broadcast', { event: 'pet_adopted' }, ({ payload }) => {
      callbacksRef.current.onPetAdopted?.(payload);
    });

    // 9.6. NUEVO AIRDROP DINÁMICO
    channel.on('broadcast', { event: 'new_airdrop' }, ({ payload }) => {
      callbacksRef.current.onNewAirdrop?.(payload);
    });

    // 9.7. NUEVA MASCOTA SILVESTRE DINÁMICA
    channel.on('broadcast', { event: 'new_wild_pet' }, ({ payload }) => {
      callbacksRef.current.onNewWildPet?.(payload);
    });

    // 10. PETICIÓN DE SINCRONIZACIÓN DE ESTADO (LATE JOIN)
    channel.on('broadcast', { event: 'request_state_sync' }, () => {
      callbacksRef.current.onRequestStateSync?.();
    });

    // 11. RESPUESTA CON ESTADO COMPLETO DEL JUEGO
    channel.on('broadcast', { event: 'full_state_sync' }, ({ payload }) => {
      callbacksRef.current.onFullStateSync?.(payload);
    });

    // 12. CANCELACIÓN / ABORTO DE PARTIDA POR EL HOST
    channel.on('broadcast', { event: 'game_cancelled' }, ({ payload }) => {
      callbacksRef.current.onGameCancelled?.(payload);
    });

    // 12.1. VICTORIA DEFINITIVA (COFRE DESBLOQUEADO)
    channel.on('broadcast', { event: 'game_victory' }, ({ payload }) => {
      callbacksRef.current.onGameVictory?.(payload);
    });

    // 12.2. ENCUENTRO PVP ENTRE JUGADORES
    channel.on('broadcast', { event: 'pvp_encounter' }, ({ payload }) => {
      callbacksRef.current.onPvPEncounter?.(payload);
    });

    channel.on('broadcast', { event: 'pvp_encounter_end' }, ({ payload }) => {
      callbacksRef.current.onPvPEncounterEnd?.(payload);
    });

    // 12.3. RECLAMO DE COFRE EN MODO COMPETITIVO
    channel.on('broadcast', { event: 'chest_claimed' }, ({ payload }) => {
      callbacksRef.current.onChestClaimed?.(payload);
    });

    // 13. PRESENCE (QUIÉN ESTÁ ONLINE)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.keys(state);
        setOnlineUsers(users);
        callbacksRef.current.onPresenceSync?.(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          setIsConnected(true);
          await channel.track({
            playerId: myPlayerId,
            userId: myUserId,
            onlineAt: new Date().toISOString(),
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isSubscribedRef.current = false;
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      isSubscribedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
    };
  }, [roomCode, gameId, myPlayerId, myUserId]);

  // EMISORES BROADCAST

  const broadcastMonsterUpdate = useCallback((monster: Monster) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'monster_update',
      payload: { monster },
    });
  }, []);

  const broadcastPlayerMove = useCallback(
    (
      lat: number,
      lng: number,
      hp?: number,
      isAlive?: boolean,
      status?: PlayerStatus,
      isCriticallyWounded?: boolean,
      insideBuildingId?: string | null,
      insideBuildingType?: StructureType | null,
      pets?: Pet[]
    ) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      const payload = {
        userId: myUserId,
        playerId: myPlayerId,
        lat,
        lng,
        hp,
        isAlive,
        status,
        isCriticallyWounded,
        insideBuildingId,
        insideBuildingType,
        pets,
      };
      console.log('[Realtime:Move] Emit:', payload);
      channelRef.current.send({
        type: 'broadcast',
        event: 'player_move',
        payload,
      });
    },
    [myUserId, myPlayerId]
  );

  const broadcastPlayerHit = useCallback((playerId: string, damage: number, currentHp: number) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_hit',
      payload: { playerId, damage, currentHp },
    });
  }, []);

  const broadcastMonsterDamaged = useCallback(
    (damage: number, currentHp: number, monsterId?: string) => {
      if (!channelRef.current || !isSubscribedRef.current || !myPlayerId) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'monster_damaged',
        payload: { damage, fromPlayerId: myPlayerId, currentHp, monsterId },
      });
    },
    [myPlayerId]
  );

  const broadcastGhostPing = useCallback((ping: GhostPing) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'ghost_ping',
      payload: { ping },
    });
  }, []);

  const broadcastRadarActivated = useCallback((nickname: string, expiresAt: number) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'radar_activated',
      payload: { activatedBy: nickname, expiresAt },
    });
  }, []);

  const broadcastCrateLooted = useCallback((crateId: string, playerNickname: string, weaponName: string) => {
    if (!channelRef.current || !isSubscribedRef.current || !myPlayerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'crate_looted',
      payload: { crateId, playerId: myPlayerId, playerNickname, weaponName },
    });
  }, [myPlayerId]);

  const broadcastPlayerRevived = useCallback((revivedPlayerId: string, reviverNickname: string) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_revived',
      payload: { revivedPlayerId, reviverNickname },
    });
  }, []);

  const broadcastChestCountdown = useCallback((secondsRemaining: number, holdersCount: number) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'chest_countdown',
      payload: { secondsRemaining, holdersCount },
    });
  }, []);

  const broadcastChestProgress = useCallback((phase: number, step: number, nickname?: string) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'chest_progress',
      payload: { phase, step, updatedByNickname: nickname },
    });
  }, []);

  const broadcastChestInteracting = useCallback((isInteracting: boolean) => {
    if (!channelRef.current || !isSubscribedRef.current || !myPlayerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'chest_interacting',
      payload: { isInteracting, playerId: myPlayerId },
    });
  }, [myPlayerId]);

  const broadcastItemDropped = useCallback((dropped: DroppedItem) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'item_dropped',
      payload: { dropped },
    });
  }, []);

  const broadcastItemPicked = useCallback((droppedItemId: string) => {
    if (!channelRef.current || !isSubscribedRef.current || !myPlayerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'item_picked',
      payload: { droppedItemId, playerId: myPlayerId },
    });
  }, [myPlayerId]);

  const broadcastPetAdopted = useCallback((wildPetId: string, playerNickname: string, pet: Pet) => {
    if (!channelRef.current || !isSubscribedRef.current || !myPlayerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'pet_adopted',
      payload: { wildPetId, playerId: myPlayerId, playerNickname, pet },
    });
  }, [myPlayerId]);

  const broadcastNewAirdrop = useCallback((crate: SupplyCrate) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'new_airdrop',
      payload: { crate },
    });
  }, []);

  const broadcastNewWildPet = useCallback((wildPet: WildPet) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'new_wild_pet',
      payload: { wildPet },
    });
  }, []);

  const broadcastRequestStateSync = useCallback(() => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'request_state_sync',
      payload: {},
    });
  }, []);

  const broadcastMonstersUpdate = useCallback((monsters: Monster[]) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'monsters_update',
      payload: { monsters },
    });
  }, []);

  const broadcastChestTransition = useCallback(
    (payload: {
      currentChestIndex: number;
      treasureLat: number;
      treasureLng: number;
      newMonster?: Monster;
      monsters?: Monster[];
    }) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'chest_transition',
        payload,
      });
    },
    []
  );

  const broadcastFullStateSync = useCallback((state: {
    monster: Monster;
    monsters?: Monster[];
    crates: SupplyCrate[];
    chestCountdown: number;
    holdersCount: number;
    chestPhase?: number;
    chestStep?: number;
    currentChestIndex?: number;
    treasureLat?: number;
    treasureLng?: number;
    droppedItems?: DroppedItem[];
    wildPets?: WildPet[];
    playerSpeed?: PlayerSpeed;
  }) => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'full_state_sync',
      payload: state,
    });
  }, []);

  const broadcastGameCancelled = useCallback((reason: string = 'Misión abortada por el anfitrión') => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'game_cancelled',
      payload: { reason },
    });
  }, []);

  const broadcastGameVictory = useCallback((winnerTeam: boolean = true, unlockedBy: string = 'Escuadra') => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'game_victory',
      payload: { winnerTeam, unlockedBy },
    });
  }, []);

  const broadcastPvPEncounter = useCallback(
    (payload: { combatId: string; player1Id: string; player2Id: string }) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_encounter',
        payload,
      });
    },
    []
  );

  const broadcastPvPEncounterEnd = useCallback(
    (payload: { combatId: string; winnerId?: string; loserId?: string }) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_encounter_end',
        payload,
      });
    },
    []
  );

  const broadcastChestClaimed = useCallback(
    (payload: { playerId: string; playerNickname: string; chestIndex: number }) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'chest_claimed',
        payload,
      });
    },
    []
  );

  return {
    isConnected,
    onlineUsers,
    broadcastMonsterUpdate,
    broadcastMonstersUpdate,
    broadcastChestTransition,
    broadcastPlayerMove,
    broadcastPlayerHit,
    broadcastMonsterDamaged,
    broadcastGhostPing,
    broadcastRadarActivated,
    broadcastCrateLooted,
    broadcastPlayerRevived,
    broadcastChestCountdown,
    broadcastChestProgress,
    broadcastChestInteracting,
    broadcastItemDropped,
    broadcastItemPicked,
    broadcastPetAdopted,
    broadcastNewAirdrop,
    broadcastNewWildPet,
    broadcastRequestStateSync,
    broadcastFullStateSync,
    broadcastGameCancelled,
    broadcastGameVictory,
    broadcastPvPEncounter,
    broadcastPvPEncounterEnd,
    broadcastChestClaimed,
  };
}
