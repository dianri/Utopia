import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, ensureAnonymousAuth } from './lib/supabase';
import type {
  GameRoom,
  Player,
  Monster,
  SupplyCrate,
  GhostPing,
  TacticalLogMessage,
  MovementMode,
  PlayerRole,
  Coordinates,
} from './types/game';
import {
  DEFAULT_WEAPONS_BY_ROLE,
  WEAPON_REGISTRY,
  getMaxHpForRole,
  getModifiedWeaponStats,
  getReviveDistanceMeters,
  getReviveDurationSeconds,
} from './services/combatEngine';
import {
  getDistanceMeters,
  getRandomPointInCircle,
  getRandomSpawnPointInPlayArea,
  getBearing,
  getDestinationPoint,
} from './services/geoUtils';
import { soundEffects } from './services/soundEffects';
import { MonsterAIController } from './services/monsterAI';
import { useGameRealtime } from './hooks/useGameRealtime';
import { useGeolocation } from './hooks/useGeolocation';

import { GameMap } from './components/GameMap';
import { TacticalHeader } from './components/HUD/TacticalHeader';
import { WeaponWheel } from './components/HUD/WeaponWheel';
import { RoleSkillButton } from './components/HUD/RoleSkillButton';
import { ChestCountdown } from './components/HUD/ChestCountdown';
import { RespawnTimer } from './components/HUD/RespawnTimer';
import { CombatLog } from './components/HUD/CombatLog';
import { GhostOverlay } from './components/HUD/GhostOverlay';

import { CreateRoomModal } from './components/Lobby/CreateRoomModal';
import { JoinRoomModal } from './components/Lobby/JoinRoomModal';
import { WaitingRoom } from './components/Lobby/WaitingRoom';
import { GameExplorer } from './components/Lobby/GameExplorer';

import { VictoryModal } from './components/PostGame/VictoryModal';
import { DefeatModal } from './components/PostGame/DefeatModal';
import { LeaderboardModal } from './components/PostGame/LeaderboardModal';

import { Play, Users, Trophy } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);

  // MONSTRUO Y ESTADO
  const [monster, setMonster] = useState<Monster>({
    lat: 0,
    lng: 0,
    hp: 1200,
    maxHp: 1200,
    state: 'patrol',
    targetPlayerId: null,
    speedMps: 2.8,
    isEnraged: false,
  });

  const [crates, setCrates] = useState<SupplyCrate[]>([]);
  const [ghostPings, setGhostPings] = useState<GhostPing[]>([]);
  const [combatLogs, setCombatLogs] = useState<TacticalLogMessage[]>([]);

  // RADAR (EXPLORADOR)
  const [isRadarActive, setIsRadarActive] = useState<boolean>(false);
  const [radarCooldown, setRadarCooldown] = useState<number>(0);
  const [radarRemaining, setRadarRemaining] = useState<number>(0);

  // COFRE Y EXTRACCIÓN (30s)
  const [chestCountdown, setChestCountdown] = useState<number>(30);
  const [chestHoldersCount, setChestHoldersCount] = useState<number>(0);

  // REANIMACIÓN
  const [revivingPlayerId, setRevivingPlayerId] = useState<string | null>(null);
  const [reviveProgress, setReviveProgress] = useState<number>(0);

  // MODALES
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [joinModalInitialCode, setJoinModalInitialCode] = useState<string>('');
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [stealthMode, setStealthMode] = useState<boolean>(soundEffects.isStealth());

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

  // Logging táctico
  const addLog = useCallback((text: string, type: TacticalLogMessage['type'] = 'info') => {
    const newMsg: TacticalLogMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      text,
      type,
    };
    setCombatLogs((prev) => [...prev.slice(-20), newMsg]);
  }, []);

  // 1. INICIALIZAR SESIÓN ANÓNIMA Y DETECTAR URL PARAM ?room=CODE
  useEffect(() => {
    ensureAnonymousAuth().then((uid) => {
      setCurrentUserId(uid);
    });

    const params = new URLSearchParams(window.location.search);
    const roomCodeParam = params.get('room');
    if (roomCodeParam) {
      setJoinModalInitialCode(roomCodeParam.toUpperCase());
      setShowJoinModal(true);
    }
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
      },
      onPlayerMove: ({ playerId, lat, lng }) => {
        setPlayers((prev) =>
          prev.map((p) => (p.id === playerId ? { ...p, lat, lng } : p))
        );
      },
      onPlayerDamaged: ({ playerId, damage, currentHp }) => {
        setPlayers((prev) =>
          prev.map((p) => {
            if (p.id === playerId) {
              const alive = currentHp > 0;
              return { ...p, hp: currentHp, isAlive: alive };
            }
            return p;
          })
        );
        if (myPlayerRef.current?.id === playerId) {
          setMyPlayer((prev) =>
            prev ? { ...prev, hp: currentHp, isAlive: currentHp > 0 } : null
          );
          soundEffects.triggerDamageHaptics();
          soundEffects.playAlarm();
          addLog(`¡Has recibido ${damage} de daño!`, 'combat');
        }
      },
      onMonsterDamaged: ({ damage, fromPlayerId, currentHp }) => {
        setMonster((prev) => ({ ...prev, hp: currentHp }));
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
      onRequestStateSync: () => {
        // Si somos el Host, transmitimos el estado actual del juego al jugador recién incorporado
        if (myPlayerRef.current?.isHost) {
          realtime.broadcastFullStateSync({
            monster: monsterRef.current,
            crates: cratesRef.current,
            chestCountdown: chestCountdownRef.current,
            holdersCount: chestHoldersCountRef.current,
          });
        }
      },
      onFullStateSync: (payload) => {
        // Jugador que se une en partida empezada recibe el estado completo del juego
        if (!myPlayerRef.current?.isHost) {
          if (payload.monster) {
            setMonster(payload.monster);
          }
          if (payload.crates && payload.crates.length > 0) {
            setCrates(payload.crates);
          }
          if (typeof payload.chestCountdown === 'number') {
            setChestCountdown(payload.chestCountdown);
          }
          if (typeof payload.holdersCount === 'number') {
            setChestHoldersCount(payload.holdersCount);
          }
        }
      },
    }
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
  const handlePositionChange = useCallback(
    (coords: Coordinates) => {
      if (!myPlayerRef.current) return;

      setMyPlayer((prev) => (prev ? { ...prev, lat: coords.lat, lng: coords.lng } : null));
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id ? { ...p, lat: coords.lat, lng: coords.lng } : p
        )
      );

      // Transmitir posición a los compañeros de equipo en tiempo real
      realtime.broadcastPlayerMove(coords.lat, coords.lng);
    },
    [realtime]
  );

  const { setManualDestination, resetPosition } = useGeolocation({
    mode: room?.movementMode ?? 'manual',
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
  });

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
            const updated = payload.new as GameRoom;
            setRoom((prev) => (prev ? { ...prev, status: updated.status } : null));
            if (updated.status === 'victory' || updated.status === 'defeat') {
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
            setPlayers(
              (data as any[]).map((d) => ({
                id: d.id,
                userId: d.user_id,
                gameId: d.game_id,
                nickname: d.nickname,
                role: d.role as PlayerRole,
                hp: d.hp,
                maxHp: d.max_hp,
                isAlive: d.is_alive,
                lat: d.lat ?? room.centerLat,
                lng: d.lng ?? room.centerLng,
                damageDealt: d.damage_dealt,
                revivesDone: d.revives_done,
                cratesOpened: d.crates_opened,
                monsterKills: d.monster_kills,
              }))
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
    if (room?.status !== 'playing' || !myPlayer?.isHost) return;

    if (!monsterAIRef.current) {
      monsterAIRef.current = new MonsterAIController({
        lat: room.treasureLat,
        lng: room.treasureLng,
      });
    }

    const interval = window.setInterval(() => {
      if (!monsterAIRef.current) return;

      const isContest = chestHoldersCount >= Math.min(2, playersRef.current.filter((p) => p.isAlive).length);

      const result = monsterAIRef.current.update(
        monsterRef.current,
        playersRef.current,
        isContest
      );

      setMonster(result.updatedMonster);
      realtime.broadcastMonsterUpdate(result.updatedMonster);

      // Si el monstruo atacó a un jugador
      if (result.attackedPlayerId && result.attackDamage > 0) {
        const victim = playersRef.current.find((p) => p.id === result.attackedPlayerId);
        if (victim) {
          const newHp = Math.max(0, victim.hp - result.attackDamage);
          realtime.broadcastPlayerHit(victim.id, result.attackDamage, newHp);
          // Si el host es la víctima
          if (victim.id === myPlayerRef.current?.id) {
            setMyPlayer((prev) => (prev ? { ...prev, hp: newHp, isAlive: newHp > 0 } : null));
          }
        }
      }

      if (result.justEnraged) {
        addLog('¡EL MONSTRUO SE HA ENFURECIDO (FASE 2)! RUGIDO Y VELOCIDAD +40%', 'warning');
      }

      if (result.justRespawned) {
        addLog('¡El Monstruo ha resucitado en el cofre del tesoro!', 'warning');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [room?.status, myPlayer?.isHost, chestHoldersCount, realtime, addLog]);

  // ==========================================
  // BUCLE DE COMBATE AUTOMÁTICO Y CADENCIA DE DISPARO (250MS)
  // ==========================================
  const [isFiringWeapon, setIsFiringWeapon] = useState<boolean>(false);

  useEffect(() => {
    if (room?.status !== 'playing' || !myPlayer?.isAlive) return;

    const interval = window.setInterval(() => {
      const player = myPlayerRef.current;
      const currentMonster = monsterRef.current;

      if (!player || !player.isAlive || currentMonster.hp <= 0 || currentMonster.state === 'dead') {
        setIsFiringWeapon(false);
        return;
      }

      const playerCoords: Coordinates = {
        lat: player.lat ?? room.centerLat,
        lng: player.lng ?? room.centerLng,
      };

      const dist = getDistanceMeters(playerCoords, currentMonster);
      const equippedWeapon = player.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[player.role];
      const { damage, rangeMeters } = getModifiedWeaponStats(equippedWeapon, player.role);

      // Verificar si el monstruo está en rango y visible
      const isVisible = dist <= 120; // Si está a rango de disparo efectivo
      if (dist <= rangeMeters && isVisible) {
        const now = Date.now();
        const lastAttack = player.lastAttackTime || 0;

        if (now - lastAttack >= equippedWeapon.fireRateMs) {
          // Comprobar munición
          if (equippedWeapon.ammo !== -1 && equippedWeapon.ammo <= 0) {
            // Munición agotada: cambiar a arma cuerpo a cuerpo de emergencia
            setMyPlayer((prev) =>
              prev ? { ...prev, equippedWeapon: WEAPON_REGISTRY.baseball_bat } : null
            );
            addLog('¡Sin munición! Cambiando a bate de emergencia', 'warning');
            return;
          }

          // Disparo efectuado
          setIsFiringWeapon(true);
          setTimeout(() => setIsFiringWeapon(false), 200);

          soundEffects.playGunshot(equippedWeapon.type === 'melee' ? 'melee' : 'rifle');
          soundEffects.vibrate(30);

          const newHp = Math.max(0, currentMonster.hp - damage);
          realtime.broadcastMonsterDamaged(damage, newHp);
          setMonster((prev) => ({ ...prev, hp: newHp }));

          // Actualizar estado del jugador
          setMyPlayer((prev) => {
            if (!prev) return null;
            const updatedWeapon =
              equippedWeapon.ammo > 0
                ? { ...equippedWeapon, ammo: equippedWeapon.ammo - 1 }
                : equippedWeapon;

            return {
              ...prev,
              lastAttackTime: now,
              damageDealt: prev.damageDealt + damage,
              equippedWeapon: updatedWeapon,
            };
          });
        }
      } else {
        setIsFiringWeapon(false);
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [room?.status, myPlayer?.isAlive, room?.centerLat, room?.centerLng, realtime, addLog]);

  // ==========================================
  // BUCLE DE CAPTURA DEL COFRE (CONDICIÓN DE VICTORIA)
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing') return;

    const interval = window.setInterval(async () => {
      const living = playersRef.current.filter((p) => p.isAlive && p.lat && p.lng);
      if (living.length === 0) return;

      const treasureCoord: Coordinates = {
        lat: room.treasureLat,
        lng: room.treasureLng,
      };

      const defenders = living.filter((p) => {
        return getDistanceMeters(treasureCoord, { lat: p.lat!, lng: p.lng! }) <= 20;
      });

      const requiredHolders = Math.min(2, living.length);
      setChestHoldersCount(defenders.length);

      if (defenders.length >= requiredHolders) {
        setChestCountdown((prev) => {
          const next = prev - 1;
          realtime.broadcastChestCountdown(next, defenders.length);
          if (next <= 0) {
            // ¡VICTORIA!
            handleGameEnd('victory');
            return 0;
          }
          return next;
        });
      } else {
        // Reiniciar cuenta atrás si abandonan la zona
        setChestCountdown(30);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [room?.status, room?.treasureLat, room?.treasureLng, realtime]);

  // ==========================================
  // DETECCIÓN DE DERROTA (TODOS LOS JUGADORES MUERTOS)
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing' || players.length === 0) return;

    const living = players.filter((p) => p.isAlive);
    if (living.length === 0) {
      handleGameEnd('defeat');
    }
  }, [players, room?.status]);

  // ==========================================
  // SAQUEO DE AIRDROPS (CAJAS DE SUMINISTROS A 40 METROS)
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing' || !myPlayer?.isAlive) return;

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

        // Equipar arma y curar
        setMyPlayer((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            equippedWeapon: crate.weaponReward,
            hp: Math.min(prev.maxHp, prev.hp + crate.healReward),
            cratesOpened: prev.cratesOpened + 1,
          };
        });

        realtime.broadcastCrateLooted(crate.id, myPlayer.nickname, crate.weaponReward.name);
        soundEffects.playCrateLoot();
      }
    });
  }, [myPlayer?.lat, myPlayer?.lng, myPlayer?.isAlive, crates, room?.centerLat, room?.centerLng, realtime]);

  // ==========================================
  // HABILIDAD RADAR DEL EXPLORADOR (COOLDOWN 60s, DURACIÓN 10s)
  // ==========================================
  const handleActivateRadar = () => {
    if (radarCooldown > 0 || !myPlayer || myPlayer.role !== 'scout') return;

    setIsRadarActive(true);
    setRadarRemaining(10);
    setRadarCooldown(60);

    realtime.broadcastRadarActivated(myPlayer.nickname, Date.now() + 10000);

    // Temporizador de duración de 10s
    const durTimer = window.setInterval(() => {
      setRadarRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(durTimer);
          setIsRadarActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Temporizador de cooldown de 60s
    const cdTimer = window.setInterval(() => {
      setRadarCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cdTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ==========================================
  // REANIMACIÓN DE COMPAÑEROS CAÍDOS
  // ==========================================
  useEffect(() => {
    if (room?.status !== 'playing' || !myPlayer?.isAlive) return;

    const myCoord: Coordinates = {
      lat: myPlayer.lat ?? room.centerLat,
      lng: myPlayer.lng ?? room.centerLng,
    };

    const fallenTeammate = players.find(
      (p) => !p.isAlive && p.id !== myPlayer.id && p.lat && p.lng
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
  // ACCIONES DE LOBBY: CREAR Y UNIRSE
  // ==========================================
  const handleCreateRoom = async (config: {
    roomName: string;
    isPublic: boolean;
    radiusMeters: number;
    movementMode: MovementMode;
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

    // Insertar partida en Supabase con tolerancia a columnas opcionales
    const basePayload = {
      code: roomCode,
      name: config.roomName,
      host_id: userId,
      status: 'lobby',
      movement_mode: config.movementMode,
      play_area_radius: config.radiusMeters,
      center_lat: config.center.lat,
      center_lng: config.center.lng,
      treasure_lat: treasureLoc.lat,
      treasure_lng: treasureLoc.lng,
    };

    let gameData: any = null;
    let gameError: any = null;

    const resWithPublic = await (supabase.from('games') as any)
      .insert({ ...basePayload, is_public: config.isPublic })
      .select()
      .single();

    if (resWithPublic.error) {
      // Fallback si la columna is_public no existiera en la tabla remota
      const resFallback = await (supabase.from('games') as any)
        .insert(basePayload)
        .select()
        .single();
      gameData = resFallback.data;
      gameError = resFallback.error;
    } else {
      gameData = resWithPublic.data;
    }

    if (gameError || !gameData) {
      console.error('Error al crear sala:', gameError);
      alert('Error al crear la sala. Verifica tu conexión a Supabase.');
      return;
    }

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
        lat: hostSpawnPoint.lat,
        lng: hostSpawnPoint.lng,
      })
      .select()
      .single();

    if (playerError || !playerData) {
      console.error('Error al crear perfil de jugador:', playerError);
      return;
    }

    const newRoom: GameRoom = {
      id: gameData.id,
      code: gameData.code,
      name: gameData.name ?? undefined,
      hostId: gameData.host_id,
      status: gameData.status,
      isPublic: gameData.is_public ?? config.isPublic ?? true,
      movementMode: gameData.movement_mode,
      playAreaRadius: gameData.play_area_radius,
      centerLat: gameData.center_lat,
      centerLng: gameData.center_lng,
      treasureLat: gameData.treasure_lat,
      treasureLng: gameData.treasure_lng,
      createdAt: gameData.created_at,
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
      lat: hostSpawnPoint.lat,
      lng: hostSpawnPoint.lng,
      damageDealt: 0,
      revivesDone: 0,
      cratesOpened: 0,
      monsterKills: 0,
      isHost: true,
      equippedWeapon: DEFAULT_WEAPONS_BY_ROLE[config.role],
    };

    // Inicializar ubicación del monstruo en el cofre del tesoro
    setMonster({
      lat: treasureLoc.lat,
      lng: treasureLoc.lng,
      hp: 1200,
      maxHp: 1200,
      state: 'patrol',
      targetPlayerId: null,
      speedMps: 2.8,
      isEnraged: false,
    });

    // Generar airdrops iniciales
    const generatedCrates: SupplyCrate[] = [];
    const weaponPool = [
      WEAPON_REGISTRY.combat_shotgun,
      WEAPON_REGISTRY.assault_rifle,
      WEAPON_REGISTRY.pistol_9mm,
    ];

    for (let i = 0; i < 4; i++) {
      const dropPoint = getRandomPointInCircle(config.center, config.radiusMeters * 0.7);
      generatedCrates.push({
        id: crypto.randomUUID(),
        lat: dropPoint.lat,
        lng: dropPoint.lng,
        opened: false,
        droppedAt: Date.now(),
        weaponReward: weaponPool[i % weaponPool.length],
        healReward: 40,
        ammoReward: 30,
      });
    }

    setRoom(newRoom);
    setMyPlayer(hostPlayer);
    setPlayers([hostPlayer]);
    setCrates(generatedCrates);
    resetPosition(hostSpawnPoint);
    setShowCreateModal(false);
  };

  const handleJoinRoom = async (config: {
    code: string;
    nickname: string;
    role: PlayerRole;
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

    const maxHp = getMaxHpForRole(config.role);

    // Calcular spawn point dinámico dentro del radio de juego de la sala (entre 20% y 70%)
    const roomCenter: Coordinates = {
      lat: gameData.center_lat,
      lng: gameData.center_lng,
    };
    const playerSpawnPoint = getRandomSpawnPointInPlayArea(
      roomCenter,
      gameData.play_area_radius,
      0.2,
      0.7
    );

    // Insertar jugador en la sala con su posición de spawn dinámica
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
        lat: playerSpawnPoint.lat,
        lng: playerSpawnPoint.lng,
      })
      .select()
      .single();

    if (playerError || !playerData) {
      console.error('Error al unirse:', playerError);
      alert('No se pudo unir a la sala. Es posible que ya estés dentro.');
      return;
    }

    const currentRoom: GameRoom = {
      id: gameData.id,
      code: gameData.code,
      name: gameData.name ?? undefined,
      hostId: gameData.host_id,
      status: gameData.status,
      isPublic: gameData.is_public ?? true,
      movementMode: gameData.movement_mode,
      playAreaRadius: gameData.play_area_radius,
      centerLat: gameData.center_lat,
      centerLng: gameData.center_lng,
      treasureLat: gameData.treasure_lat,
      treasureLng: gameData.treasure_lng,
      createdAt: gameData.created_at,
    };

    const player: Player = {
      id: playerData.id,
      userId,
      gameId: gameData.id,
      nickname: config.nickname,
      role: config.role,
      hp: maxHp,
      maxHp,
      isAlive: true,
      lat: playerSpawnPoint.lat,
      lng: playerSpawnPoint.lng,
      damageDealt: 0,
      revivesDone: 0,
      cratesOpened: 0,
      monsterKills: 0,
      isHost: gameData.host_id === userId,
      equippedWeapon: DEFAULT_WEAPONS_BY_ROLE[config.role],
    };

    // Sincronizar posición del monstruo en el cofre del tesoro de la sala como base
    setMonster({
      lat: gameData.treasure_lat,
      lng: gameData.treasure_lng,
      hp: 1200,
      maxHp: 1200,
      state: 'patrol',
      targetPlayerId: null,
      speedMps: 2.8,
      isEnraged: false,
    });

    // Cargar todos los compañeros de escuadra registrados en la sala
    const { data: teammatesData } = await (supabase
      .from('players') as any)
      .select('*')
      .eq('game_id', gameData.id);

    if (teammatesData && teammatesData.length > 0) {
      setPlayers(
        teammatesData.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          gameId: d.game_id,
          nickname: d.nickname,
          role: d.role as PlayerRole,
          hp: d.hp,
          maxHp: d.max_hp,
          isAlive: d.is_alive,
          lat: d.id === player.id ? playerSpawnPoint.lat : (d.lat ?? gameData.center_lat),
          lng: d.id === player.id ? playerSpawnPoint.lng : (d.lng ?? gameData.center_lng),
          damageDealt: d.damage_dealt,
          revivesDone: d.revives_done,
          cratesOpened: d.crates_opened,
          monsterKills: d.monster_kills,
          isHost: d.user_id === gameData.host_id,
          equippedWeapon: DEFAULT_WEAPONS_BY_ROLE[d.role as PlayerRole],
        }))
      );
    } else {
      setPlayers([player]);
    }

    // Si la partida ya está en combate (late join), configurar airdrops iniciales de contingencia
    if (gameData.status === 'playing') {
      const fallbackCrates: SupplyCrate[] = [];
      const weaponPool = [
        WEAPON_REGISTRY.combat_shotgun,
        WEAPON_REGISTRY.assault_rifle,
        WEAPON_REGISTRY.pistol_9mm,
      ];
      for (let i = 0; i < 4; i++) {
        const dropPoint = getRandomPointInCircle(
          { lat: gameData.center_lat, lng: gameData.center_lng },
          gameData.play_area_radius * 0.7
        );
        fallbackCrates.push({
          id: `crate_${gameData.id}_${i}`,
          lat: dropPoint.lat,
          lng: dropPoint.lng,
          opened: false,
          droppedAt: Date.now(),
          weaponReward: weaponPool[i % weaponPool.length],
          healReward: 40,
          ammoReward: 30,
        });
      }
      setCrates(fallbackCrates);
      addLog('¡Te has incorporado a una partida en combate! Encuentra a tu escuadra.', 'warning');
    }

    setRoom(currentRoom);
    setMyPlayer(player);
    resetPosition(playerSpawnPoint);
    setShowJoinModal(false);
  };

  const handleStartGame = async () => {
    if (!room || !myPlayer?.isHost) return;

    try {
      await (supabase.rpc as any)('set_game_status', {
        p_game_id: room.id,
        p_status: 'playing',
      });
    } catch {
      await (supabase.from('games') as any).update({ status: 'playing' }).eq('id', room.id);
    }

    setRoom((prev) => (prev ? { ...prev, status: 'playing' } : null));
    addLog('¡OPERACIÓN INICIADA! Buscad suministros y asegurad el tesoro.', 'info');
  };

  const handleMapClick = (coords: Coordinates) => {
    if (!room) return;

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
  };

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

  // ==========================================
  // RENDERIZADO DE LA INTERFAZ
  // ==========================================
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-hud-dark font-sans select-none">
      {/* 1. MAPA TÁCTICO WEBGL A PANTALLA COMPLETA */}
      {room && myPlayer ? (
        <GameMap
          center={{ lat: room.centerLat, lng: room.centerLng }}
          playAreaRadius={room.playAreaRadius}
          treasureLocation={{ lat: room.treasureLat, lng: room.treasureLng }}
          myPlayer={myPlayer}
          players={players}
          monster={monster}
          crates={crates}
          ghostPings={ghostPings}
          movementMode={room.movementMode}
          isRadarActive={isRadarActive}
          onMapClick={handleMapClick}
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
                RADAR PÚBLICO
              </span>
              <div className="flex-1 h-px bg-hud-border/60" />
            </div>

            {/* EXPLORADOR DE PARTIDAS PÚBLICAS */}
            <GameExplorer
              onJoinGame={(code: string) => {
                soundEffects.initOnUserInteraction();
                setJoinModalInitialCode(code);
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
          />

          <WeaponWheel
            weapon={myPlayer.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[myPlayer.role]}
            distToMonster={distToMonster}
            isInRange={distToMonster <= (myPlayer.equippedWeapon?.rangeMeters ?? 25)}
            isFiring={isFiringWeapon}
          />

          <RoleSkillButton
            role={myPlayer.role}
            cooldownRemaining={radarCooldown}
            isActive={isRadarActive}
            onActivate={handleActivateRadar}
            isAlive={myPlayer.isAlive}
          />

          <ChestCountdown
            secondsRemaining={chestCountdown}
            holdersCount={chestHoldersCount}
            requiredHolders={Math.min(2, players.filter((p) => p.isAlive).length)}
            isInChestZone={
              getDistanceMeters(
                { lat: myPlayer.lat ?? room.centerLat, lng: myPlayer.lng ?? room.centerLng },
                { lat: room.treasureLat, lng: room.treasureLng }
              ) <= 20
            }
          />

          <RespawnTimer secondsRemaining={monster.respawnTimeRemaining} />

          <CombatLog messages={combatLogs} />

          {/* AVISO TÁCTICO: FUERA DEL ÁREA DE JUEGO */}
          {isOutOfPlayArea && (
            <div className="fixed top-20 left-4 right-4 z-40 max-w-md mx-auto bg-red-950/90 border-2 border-red-500 text-red-200 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-pulse">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1 text-xs font-mono">
                <span className="font-bold text-red-400 block uppercase tracking-wider">
                  Fuera del Área de Operaciones
                </span>
                <span>
                  Estás a <strong className="text-white">{outOfAreaMeters} metros</strong> del perímetro de juego.
                  {room.movementMode === 'gps'
                    ? ' Desplázate físicamente hacia la zona para participar en el combate.'
                    : ' Toca dentro del círculo de juego para regresar a la zona.'}
                </span>
              </div>
            </div>
          )}

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
          onLeaveRoom={() => {
            setRoom(null);
            setMyPlayer(null);
            setPlayers([]);
          }}
        />
      )}

      {/* 4. MODAL DE VICTORIA */}
      {room && room.status === 'victory' && (
        <VictoryModal
          players={players}
          onRestart={() => {
            setRoom(null);
            setMyPlayer(null);
            setPlayers([]);
          }}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {/* 5. MODAL DE DERROTA */}
      {room && room.status === 'defeat' && (
        <DefeatModal
          players={players}
          onRestart={() => {
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
          onConfirm={handleJoinRoom}
          onCancel={() => setShowJoinModal(false)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
};
export default App;
