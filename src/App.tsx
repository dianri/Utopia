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
} from './types/game';
import { PLAYER_SPEED_MPS } from './types/game';
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
import { GameExplorer, type ActiveGameItem } from './components/Lobby/GameExplorer';

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
            .select('id, code, status')
            .eq('code', activeCode.toUpperCase())
            .in('status', ['lobby', 'playing'])
            .maybeSingle();

          if (activeGame) {
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
            .select('id, code, status')
            .eq('code', codeUpper)
            .in('status', ['lobby', 'playing'])
            .maybeSingle();

          if (urlGame) {
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
      },
      onPlayerMove: ({ playerId, userId, lat, lng, hp, isAlive }) => {
        setPlayers((prev) =>
          prev.map((p) => {
            const matches =
              (playerId && p.id === playerId) ||
              (userId && p.userId === userId);
            if (!matches) return p;
            return {
              ...p,
              lat,
              lng,
              hp: hp !== undefined ? hp : p.hp,
              isAlive: isAlive !== undefined ? isAlive : p.isAlive,
            };
          })
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
        if (fromPlayerId && monsterAIRef.current) {
          monsterAIRef.current.setAggroTarget(fromPlayerId);
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
      onGameCancelled: (payload) => {
        handleRemoteGameCancelled(payload?.reason || 'Misión abortada por el anfitrión');
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

  const handlePositionChange = useCallback(
    (coords: Coordinates, isFinal?: boolean) => {
      if (!myPlayerRef.current) return;

      setMyPlayer((prev) => (prev ? { ...prev, lat: coords.lat, lng: coords.lng } : null));
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayerRef.current?.id ? { ...p, lat: coords.lat, lng: coords.lng } : p
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
          myPlayerRef.current.isAlive
        );
      }
    },
    [realtime]
  );

  const { setManualDestination, resetPosition } = useGeolocation({
    mode: room?.movementMode ?? 'manual',
    baseSpeedMps: room?.playerSpeed ? PLAYER_SPEED_MPS[room.playerSpeed] : 1.4,
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
                const existing = prev.find(
                  (p) => p.id === d.id || (d.user_id && p.userId === d.user_id)
                );
                return {
                  id: d.id,
                  userId: d.user_id,
                  gameId: d.game_id,
                  nickname: d.nickname,
                  role: d.role as PlayerRole,
                  hp: d.hp,
                  maxHp: d.max_hp,
                  isAlive: d.is_alive,
                  lat: existing?.lat ?? d.lat ?? room.centerLat,
                  lng: existing?.lng ?? d.lng ?? room.centerLng,
                  damageDealt: d.damage_dealt,
                  revivesDone: d.revives_done,
                  cratesOpened: d.crates_opened,
                  monsterKills: d.monster_kills,
                  isHost: d.user_id === room.hostId,
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

    if (!monsterAIRef.current) {
      monsterAIRef.current = new MonsterAIController(treasureCoords);
    } else {
      monsterAIRef.current.setTreasureLocation(treasureCoords);
    }

    const interval = window.setInterval(() => {
      if (!monsterAIRef.current) return;

      const isContest =
        chestHoldersCountRef.current >=
        Math.min(2, playersRef.current.filter((p) => p.isAlive).length);

      const result = monsterAIRef.current.update(
        monsterRef.current,
        playersRef.current,
        isContest
      );

      setMonster(result.updatedMonster);
      realtimeRef.current.broadcastMonsterUpdate(result.updatedMonster);

      // Si el monstruo atacó a un jugador
      if (result.attackedPlayerId && result.attackDamage > 0) {
        const victim = playersRef.current.find((p) => p.id === result.attackedPlayerId);
        if (victim) {
          const isShielded = isRoleSkillActiveRef.current && victim.id === myPlayerRef.current?.id && myPlayerRef.current?.role === 'tank';
          const damageApplied = isShielded ? Math.round(result.attackDamage * 0.5) : result.attackDamage;
          const newHp = Math.max(0, victim.hp - damageApplied);
          realtimeRef.current.broadcastPlayerHit(victim.id, damageApplied, newHp);
          // Si el host es la víctima
          if (victim.id === myPlayerRef.current?.id) {
            setMyPlayer((prev) => (prev ? { ...prev, hp: newHp, isAlive: newHp > 0 } : null));
          }
        }
      }

      if (result.justEnraged) {
        addLogRef.current('¡EL MONSTRUO SE HA ENFURECIDO (FASE 2)! RUGIDO Y VELOCIDAD +40%', 'warning');
      }

      if (result.justRespawned) {
        addLogRef.current('¡El Monstruo ha resucitado en el cofre del tesoro!', 'warning');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [room?.status, isHost, room?.treasureLat, room?.treasureLng, room?.centerLat, room?.centerLng]);

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
      const baseStats = getModifiedWeaponStats(equippedWeapon, player.role);
      const isMarksmanBoosted = isRoleSkillActiveRef.current && player.role === 'marksman';
      const rangeMeters = isMarksmanBoosted ? Math.round(baseStats.rangeMeters * 1.5) : baseStats.rangeMeters;
      const damage = isMarksmanBoosted ? Math.round(baseStats.damage * 1.25) : baseStats.damage;

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
  // HABILIDADES ACTIVAS DE ROL / ACCIONES ESPECIALES
  // ==========================================
  const handleActivateRoleSkill = useCallback(() => {
    if (roleSkillCooldown > 0 || !myPlayer || !myPlayer.isAlive) return;

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

    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);
    setRoom(null);
    setMyPlayer(null);
    setPlayers([]);
    setCrates([]);
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

    localStorage.removeItem('utopia_active_room');
    setSavedActiveRoomCode(null);
    setRoom(null);
    setMyPlayer(null);
    setPlayers([]);
    setCrates([]);
  };

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

    // Insertar partida en Supabase con tolerancia a columnas opcionales
    const basePayload = {
      code: roomCode,
      name: config.roomName,
      host_id: userId,
      status: 'lobby',
      movement_mode: config.movementMode,
      player_speed: config.playerSpeed || 'normal',
      play_area_radius: config.radiusMeters,
      center_lat: config.center.lat,
      center_lng: config.center.lng,
      treasure_lat: treasureLoc.lat,
      treasure_lng: treasureLoc.lng,
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
      const { player_speed, ...legacyPayload } = basePayload;
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
      playerSpeed: (gameData.player_speed as PlayerSpeed) ?? config.playerSpeed ?? 'normal',
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

    // Generar airdrops iniciales con variedad táctica y recompensas visibles
    const generatedCrates: SupplyCrate[] = [];
    const crateTemplates: {
      type: CrateType;
      weapon: typeof WEAPON_REGISTRY[keyof typeof WEAPON_REGISTRY];
      heal: number;
      ammo: number;
    }[] = [
      { type: 'rifle', weapon: WEAPON_REGISTRY.assault_rifle, heal: 25, ammo: 60 },
      { type: 'shotgun', weapon: WEAPON_REGISTRY.combat_shotgun, heal: 25, ammo: 24 },
      { type: 'medkit', weapon: WEAPON_REGISTRY.pistol_9mm, heal: 80, ammo: 20 },
      { type: 'ammo', weapon: WEAPON_REGISTRY.pistol_9mm, heal: 20, ammo: 90 },
      { type: 'melee', weapon: WEAPON_REGISTRY.baseball_bat, heal: 35, ammo: 15 },
    ];

    for (let i = 0; i < 5; i++) {
      const dropPoint = getRandomPointInCircle(config.center, config.radiusMeters * 0.7);
      const template = crateTemplates[i % crateTemplates.length];
      generatedCrates.push({
        id: crypto.randomUUID(),
        lat: dropPoint.lat,
        lng: dropPoint.lng,
        opened: false,
        droppedAt: Date.now(),
        crateType: template.type,
        weaponReward: template.weapon,
        healReward: template.heal,
        ammoReward: template.ammo,
      });
    }

    setRoom(newRoom);
    setMyPlayer(hostPlayer);
    setPlayers([hostPlayer]);
    setCrates(generatedCrates);
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
    if (gameData.status === 'victory' || gameData.status === 'defeat' || gameData.status === 'cancelled') {
      alert(`La partida ya ha concluido (Estado: ${gameData.status.toUpperCase()}).`);
      localStorage.removeItem('utopia_active_room');
      setSavedActiveRoomCode(null);
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
          lat: spawnCoords.lat,
          lng: spawnCoords.lng,
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
      spawnCoords = {
        lat: playerData.lat ?? gameData.center_lat,
        lng: playerData.lng ?? gameData.center_lng,
      };
      addLog(`¡Bienvenido de vuelta, ${playerData.nickname}! Reconectando a la misión...`, 'info');
    }

    const currentRoom: GameRoom = {
      id: gameData.id,
      code: gameData.code,
      name: gameData.name ?? undefined,
      hostId: gameData.host_id,
      status: gameData.status,
      isPublic: gameData.is_public ?? true,
      movementMode: gameData.movement_mode,
      playerSpeed: (gameData.player_speed as PlayerSpeed) ?? 'normal',
      playAreaRadius: gameData.play_area_radius,
      centerLat: gameData.center_lat,
      centerLng: gameData.center_lng,
      treasureLat: gameData.treasure_lat,
      treasureLng: gameData.treasure_lng,
      createdAt: gameData.created_at,
    };

    const finalRole = (playerData.role as PlayerRole) || config.role || 'medic';
    const finalMaxHp = playerData.max_hp ?? getMaxHpForRole(finalRole);

    const player: Player = {
      id: playerData.id,
      userId,
      gameId: gameData.id,
      nickname: playerData.nickname,
      role: finalRole,
      hp: playerData.hp ?? finalMaxHp,
      maxHp: finalMaxHp,
      isAlive: playerData.is_alive ?? true,
      lat: spawnCoords.lat,
      lng: spawnCoords.lng,
      damageDealt: playerData.damage_dealt ?? 0,
      revivesDone: playerData.revives_done ?? 0,
      cratesOpened: playerData.crates_opened ?? 0,
      monsterKills: playerData.monster_kills ?? 0,
      isHost: gameData.host_id === userId,
      equippedWeapon: DEFAULT_WEAPONS_BY_ROLE[finalRole],
    };

    // Guardar sala activa en localStorage para reconexiones futuras
    localStorage.setItem('utopia_active_room', gameData.code);
    setSavedActiveRoomCode(gameData.code);

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
          lat: d.id === player.id ? spawnCoords.lat : (d.lat ?? gameData.center_lat),
          lng: d.id === player.id ? spawnCoords.lng : (d.lng ?? gameData.center_lng),
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

    // Si la partida ya está en combate (late join o reconexión), configurar airdrops iniciales de contingencia
    if (gameData.status === 'playing') {
      const fallbackCrates: SupplyCrate[] = [];
      const crateTemplates: {
        type: CrateType;
        weapon: typeof WEAPON_REGISTRY[keyof typeof WEAPON_REGISTRY];
        heal: number;
        ammo: number;
      }[] = [
        { type: 'rifle', weapon: WEAPON_REGISTRY.assault_rifle, heal: 25, ammo: 60 },
        { type: 'shotgun', weapon: WEAPON_REGISTRY.combat_shotgun, heal: 25, ammo: 24 },
        { type: 'medkit', weapon: WEAPON_REGISTRY.pistol_9mm, heal: 80, ammo: 20 },
        { type: 'ammo', weapon: WEAPON_REGISTRY.pistol_9mm, heal: 20, ammo: 90 },
        { type: 'melee', weapon: WEAPON_REGISTRY.baseball_bat, heal: 35, ammo: 15 },
      ];
      for (let i = 0; i < 5; i++) {
        const dropPoint = getRandomPointInCircle(
          { lat: gameData.center_lat, lng: gameData.center_lng },
          gameData.play_area_radius * 0.7
        );
        const template = crateTemplates[i % crateTemplates.length];
        fallbackCrates.push({
          id: `crate_${gameData.id}_${i}`,
          lat: dropPoint.lat,
          lng: dropPoint.lng,
          opened: false,
          droppedAt: Date.now(),
          crateType: template.type,
          weaponReward: template.weapon,
          healReward: template.heal,
          ammoReward: template.ammo,
        });
      }
      setCrates(fallbackCrates);
    }

    setRoom(currentRoom);
    setMyPlayer(player);
    resetPosition(spawnCoords);
    setShowJoinModal(false);
  };
  handleJoinRoomRef.current = handleJoinRoom;

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

  const handleMapClick = useCallback((coords: Coordinates) => {
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
  }, [room, myPlayer, addLog, realtime]);

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
    () => ({ lat: room?.treasureLat ?? 0, lng: room?.treasureLng ?? 0 }),
    [room?.treasureLat, room?.treasureLng]
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
          crates={crates}
          ghostPings={ghostPings}
          movementMode={room.movementMode}
          playerSpeed={room.playerSpeed}
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

          <WeaponWheel
            weapon={myPlayer.equippedWeapon || DEFAULT_WEAPONS_BY_ROLE[myPlayer.role]}
            distToMonster={distToMonster}
            isInRange={
              distToMonster <=
              ((myPlayer.equippedWeapon?.rangeMeters ?? 25) *
                (isRoleSkillActive && myPlayer.role === 'marksman' ? 1.5 : 1))
            }
            isFiring={isFiringWeapon}
          />

          <RoleSkillButton
            role={myPlayer.role}
            cooldownRemaining={roleSkillCooldown}
            isActive={isRoleSkillActive || isRadarActive}
            onActivate={handleActivateRoleSkill}
            isAlive={myPlayer.isAlive}
          />

          {/* CONTENEDOR FLEXBOX VERTICAL PARA ALERTAS CENTRALES (Evita solapamientos) */}
          <div className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-40 pointer-events-none w-full max-w-sm px-4">
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
          </div>

          <CombatLog messages={combatLogs} onDismiss={handleDismissLog} />

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
