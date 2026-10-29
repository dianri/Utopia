import { useEffect, useRef } from 'react';
import type { Monster, Player, Coordinates, GameRoom, PlayerStatus } from '../types/game';
import { MonsterAIController } from '../services/monsterAI';
import { soundEffects } from '../services/soundEffects';

export interface UseMonsterAIParams {
  room: GameRoom | null;
  isHost: boolean;
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
  onLog: (message: string, type?: 'info' | 'combat' | 'warning' | 'loot') => void;
}

export function useMonsterAI({
  room,
  isHost,
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
  onLog,
}: UseMonsterAIParams) {
  const monsterAIsRef = useRef<Map<string, MonsterAIController>>(new Map());
  const monsterAIRef = useRef<MonsterAIController | null>(null);

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

  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    // Si la partida no está en curso o este cliente no es el anfitrión activo, pausar bucle
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
    isHost,
    room?.treasureLat,
    room?.treasureLng,
    room?.centerLat,
    room?.centerLng,
    room?.playAreaRadius,
  ]);
}
