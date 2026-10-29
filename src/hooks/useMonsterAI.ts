import { useEffect, useRef, useMemo, useState } from 'react';
import type { Monster, Player, Coordinates, GameRoom, PlayerStatus } from '../types/game';
import { MonsterAIController } from '../services/monsterAI';
import { soundEffects } from '../services/soundEffects';
import { supabase } from '../lib/supabase';

export interface UseMonsterAIParams {
  room: GameRoom | null;
  isHost: boolean;
  presenceState?: Record<string, any[]>;
  lastExternalTick?: number;
  myPlayer: Player | null;
  players: Player[];
  monsters: Monster[];
  monster: Monster;
  isChestInteractedGlobally: boolean;
  isChestLockModalOpen: boolean;
  isCombatArenaOpen: boolean;
  isRoleSkillActive: boolean;
  activeCombatMonsterId: string | null;
  onMonstersUpdated: (updatedMonsters: Monster[]) => void;
  onMonsterUpdated: (focusedMonster: Monster) => void;
  onPlayerDamagedLocally: (newHp: number, isWounded: boolean, damageApplied: number, monsterName: string) => void;
  onPetDamagedLocally: (victimId: string, updatedPets: any[], targetPetName: string, damageApplied: number, monsterName: string, petIsWounded: boolean) => void;
  onBroadcastMonstersUpdate: (monsters: Monster[]) => void;
  onBroadcastMonsterUpdate: (monster: Monster) => void;
  onBroadcastPlayerHit: (victimId: string, damage: number, newHp: number) => void;
  onBroadcastHostHeartbeat?: (payload: { timestamp: number; hostId: string }) => void;
  onLog: (message: string, type?: 'info' | 'combat' | 'warning' | 'loot') => void;
}

export function useMonsterAI({
  room,
  isHost,
  presenceState,
  lastExternalTick,
  myPlayer,
  players,
  monsters,
  monster,
  isChestInteractedGlobally,
  isChestLockModalOpen,
  isCombatArenaOpen,
  isRoleSkillActive,
  activeCombatMonsterId,
  onMonstersUpdated,
  onMonsterUpdated,
  onPlayerDamagedLocally,
  onPetDamagedLocally,
  onBroadcastMonstersUpdate,
  onBroadcastMonsterUpdate,
  onBroadcastPlayerHit,
  onBroadcastHostHeartbeat,
  onLog,
}: UseMonsterAIParams) {
  const monsterAIsRef = useRef<Map<string, MonsterAIController>>(new Map());
  const monsterAIRef = useRef<MonsterAIController | null>(null);

  // 1. Obtener todos los jugadores conectados actualmente según presence
  const activePresences = useMemo(() => {
    return Object.values(presenceState || {})
      .flat()
      .filter((p: any) => p && p.playerId);
  }, [presenceState]);

  // 2. Ordenación determinista por joinedAt y playerId como desempate
  const sortedConnected = useMemo(() => {
    const list = [...activePresences];
    return list.sort((a: any, b: any) => {
      const timeA = a.joinedAt || (a.onlineAt ? new Date(a.onlineAt).getTime() : 0);
      const timeB = b.joinedAt || (b.onlineAt ? new Date(b.onlineAt).getTime() : 0);
      if (timeA !== timeB) return timeA - timeB;
      return (a.playerId || '').localeCompare(b.playerId || '');
    });
  }, [activePresences]);

  const alivePlayerIds = useMemo(() => {
    return new Set(
      players
        .filter((p) => p.isAlive && p.status !== 'critically_wounded')
        .map((p) => p.id)
    );
  }, [players]);

  // 3. El primer jugador conectado vivo en la lista es el host de facto
  const currentHostId = useMemo(() => {
    if (sortedConnected.length === 0) {
      return isHost && myPlayer ? myPlayer.id : null;
    }
    const designated =
      sortedConnected.find((p: any) => alivePlayerIds.has(p.playerId)) ||
      sortedConnected[0];
    return designated?.playerId || null;
  }, [sortedConnected, alivePlayerIds, isHost, myPlayer]);

  const isSimulatingHost = useMemo(() => {
    if (currentHostId && myPlayer) {
      return currentHostId === myPlayer.id;
    }
    return Boolean(isHost);
  }, [currentHostId, myPlayer, isHost]);

  const lastHostHeartbeatRef = useRef<number>(Date.now());
  const [failoverClaimed, setFailoverClaimed] = useState<boolean>(false);

  // Cada vez que recibimos un tick o latido externo de la IA, refrescamos el watchdog
  useEffect(() => {
    if (lastExternalTick && lastExternalTick > 0) {
      lastHostHeartbeatRef.current = lastExternalTick;
      if (failoverClaimed && !isSimulatingHost) {
        setFailoverClaimed(false);
      }
    }
  }, [lastExternalTick, failoverClaimed, isSimulatingHost]);

  // Watchdog de 5 segundos: si el host no emite ticks durante > 5s, forzar relevo determinista
  useEffect(() => {
    if (room?.status !== 'playing' || isSimulatingHost || failoverClaimed) return;

    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastHostHeartbeatRef.current;
      if (elapsed > 5000 && sortedConnected.length > 0) {
        // Descartar el host inactivo y buscar el siguiente candidato en sortedConnected
        const remaining = sortedConnected.filter(
          (p: any) => p.playerId !== currentHostId
        );
        const nextInLine =
          remaining.find((p: any) => alivePlayerIds.has(p.playerId)) ||
          remaining[0];
        if (nextInLine?.playerId === myPlayer?.id) {
          console.warn(
            `[MonsterAI] Host ${currentHostId} inactivo por ${elapsed}ms. Asumiendo rol de simulación.`
          );
          setFailoverClaimed(true);
        }
      }
    }, 1000);

    return () => clearInterval(watchdog);
  }, [
    room?.status,
    isSimulatingHost,
    failoverClaimed,
    currentHostId,
    sortedConnected,
    alivePlayerIds,
    myPlayer?.id,
  ]);

  const shouldSimulate = isSimulatingHost || failoverClaimed;

  const roomRef = useRef<GameRoom | null>(room);
  roomRef.current = room;

  const tickCountRef = useRef<number>(0);

  const playersRef = useRef<Player[]>(players);
  playersRef.current = players;

  const monstersRef = useRef<Monster[]>(monsters);
  monstersRef.current = monsters;

  const monsterRef = useRef<Monster>(monster);
  monsterRef.current = monster;

  const myPlayerRef = useRef<Player | null>(myPlayer);
  myPlayerRef.current = myPlayer;

  const isChestInteractedGloballyRef = useRef(isChestInteractedGlobally);
  isChestInteractedGloballyRef.current = isChestInteractedGlobally;

  const isChestLockModalOpenRef = useRef(isChestLockModalOpen);
  isChestLockModalOpenRef.current = isChestLockModalOpen;

  const isCombatArenaOpenRef = useRef(isCombatArenaOpen);
  isCombatArenaOpenRef.current = isCombatArenaOpen;

  const isRoleSkillActiveRef = useRef(isRoleSkillActive);
  isRoleSkillActiveRef.current = isRoleSkillActive;

  const activeCombatMonsterIdRef = useRef(activeCombatMonsterId);
  activeCombatMonsterIdRef.current = activeCombatMonsterId;

  const onMonstersUpdatedRef = useRef(onMonstersUpdated);
  onMonstersUpdatedRef.current = onMonstersUpdated;

  const onMonsterUpdatedRef = useRef(onMonsterUpdated);
  onMonsterUpdatedRef.current = onMonsterUpdated;

  const onPlayerDamagedLocallyRef = useRef(onPlayerDamagedLocally);
  onPlayerDamagedLocallyRef.current = onPlayerDamagedLocally;

  const onPetDamagedLocallyRef = useRef(onPetDamagedLocally);
  onPetDamagedLocallyRef.current = onPetDamagedLocally;

  const onBroadcastMonstersUpdateRef = useRef(onBroadcastMonstersUpdate);
  onBroadcastMonstersUpdateRef.current = onBroadcastMonstersUpdate;

  const onBroadcastMonsterUpdateRef = useRef(onBroadcastMonsterUpdate);
  onBroadcastMonsterUpdateRef.current = onBroadcastMonsterUpdate;

  const onBroadcastPlayerHitRef = useRef(onBroadcastPlayerHit);
  onBroadcastPlayerHitRef.current = onBroadcastPlayerHit;

  const onBroadcastHostHeartbeatRef = useRef(onBroadcastHostHeartbeat);
  onBroadcastHostHeartbeatRef.current = onBroadcastHostHeartbeat;

  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    // Si la partida no está en curso o este cliente no debe simular activamente, pausar bucle
    if (room?.status !== 'playing' || !shouldSimulate) return;

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
      tickCountRef.current += 1;

      // Registrar y difundir latido de la IA activa
      lastHostHeartbeatRef.current = Date.now();
      if (myPlayerRef.current?.id) {
        onBroadcastHostHeartbeatRef.current?.({
          timestamp: Date.now(),
          hostId: myPlayerRef.current.id,
        });
      }

      // Guardar marca de tiempo en la sala (host_heartbeat) periódicamente cada 5 segundos
      if (tickCountRef.current % 5 === 0 && roomRef.current?.id) {
        (supabase.from('games') as any)
          .update({
            settings: {
              ...((roomRef.current as any).settings || {}),
              host_heartbeat: Date.now(),
            },
          })
          .eq('id', roomRef.current.id)
          .then();
      }

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

            const isShielded =
              isRoleSkillActiveRef.current &&
              victim.id === myPlayerRef.current?.id &&
              myPlayerRef.current?.role === 'tank';
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

              onPetDamagedLocallyRef.current?.(
                victim.id,
                updatedPets,
                targetPet.name,
                damageApplied,
                m.name || 'El monstruo',
                petIsWounded
              );
              continue;
            }

            const currentVictimHp =
              victim.id === myPlayerRef.current?.id && myPlayerRef.current ? myPlayerRef.current.hp : victim.hp;
            const calculatedHp = Math.max(0, currentVictimHp - damageApplied);
            const isWounded = calculatedHp <= 0 || calculatedHp === 1;
            const newHp = isWounded ? 1 : calculatedHp;

            onBroadcastPlayerHitRef.current?.(victim.id, damageApplied, newHp);

            // Si el host local es la víctima
            if (victim.id === myPlayerRef.current?.id) {
              onPlayerDamagedLocallyRef.current?.(newHp, isWounded, damageApplied, m.name || 'El monstruo');
            }
          }
        }

        if (result.justEnraged) {
          onLogRef.current?.(
            `¡${m.name || 'EL MONSTRUO'} SE HA ENFURECIDO (FASE 2)! RUGIDO Y VELOCIDAD +40%`,
            'warning'
          );
        }
      }

      onMonstersUpdatedRef.current?.(updatedMonsters);
      onBroadcastMonstersUpdateRef.current?.(updatedMonsters);

      const focused =
        updatedMonsters.find((m) => m.id === activeCombatMonsterIdRef.current) || updatedMonsters[0];
      if (focused) {
        onMonsterUpdatedRef.current?.(focused);
        onBroadcastMonsterUpdateRef.current?.(focused);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [
    room?.status,
    shouldSimulate,
    room?.treasureLat,
    room?.treasureLng,
    room?.centerLat,
    room?.centerLng,
    room?.playAreaRadius,
  ]);
}
