import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Monster, GhostPing, SupplyCrate } from '../types/game';
import { soundEffects } from '../services/soundEffects';

interface RealtimeCallbacks {
  onMonsterUpdate?: (monster: Monster) => void;
  onPlayerMove?: (payload: { playerId: string; lat: number; lng: number }) => void;
  onPlayerDamaged?: (payload: { playerId: string; damage: number; currentHp: number }) => void;
  onMonsterDamaged?: (payload: { damage: number; fromPlayerId: string; currentHp: number }) => void;
  onGhostPing?: (ping: GhostPing) => void;
  onRadarActivated?: (payload: { activatedBy: string; expiresAt: number }) => void;
  onCrateLooted?: (payload: { crateId: string; playerId: string; playerNickname: string; weaponName: string }) => void;
  onPlayerRevived?: (payload: { revivedPlayerId: string; reviverNickname: string }) => void;
  onChestCountdown?: (payload: { secondsRemaining: number; holdersCount: number }) => void;
  onRequestStateSync?: () => void;
  onFullStateSync?: (payload: { monster: Monster; crates: SupplyCrate[]; chestCountdown: number; holdersCount: number }) => void;
  onGameCancelled?: (payload: { reason?: string }) => void;
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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Keep-alive de actividad del Host (cada 2 minutos) para evitar que la sala expire
  useEffect(() => {
    if (!isHost || !gameId) return;
    if (gameStatus && gameStatus !== 'lobby' && gameStatus !== 'playing') return;

    // Actualización inicial
    (supabase.from('games') as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', gameId)
      .then();

    const interval = setInterval(() => {
      (supabase.from('games') as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', gameId)
        .then();
    }, 120_000); // 2 minutos

    return () => clearInterval(interval);
  }, [isHost, gameId, gameStatus]);

  useEffect(() => {
    if (!roomCode || !myPlayerId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const channelName = `room:${roomCode.toUpperCase()}`;
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

    // 2. ESCUCHAR MOVIMIENTO DE JUGADORES
    channel.on('broadcast', { event: 'player_move' }, ({ payload }) => {
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
          setIsConnected(true);
          await channel.track({
            playerId: myPlayerId,
            userId: myUserId,
            onlineAt: new Date().toISOString(),
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        setIsConnected(false);
      }
    };
  }, [roomCode, myPlayerId, myUserId]);

  // EMISORES BROADCAST

  const broadcastMonsterUpdate = useCallback((monster: Monster) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'monster_update',
      payload: { monster },
    });
  }, []);

  const broadcastPlayerMove = useCallback((lat: number, lng: number) => {
    if (!myPlayerId) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_move',
      payload: { playerId: myPlayerId, lat, lng },
    });
  }, [myPlayerId]);

  const broadcastPlayerHit = useCallback((playerId: string, damage: number, currentHp: number) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_hit',
      payload: { playerId, damage, currentHp },
    });
  }, []);

  const broadcastMonsterDamaged = useCallback((damage: number, currentHp: number) => {
    if (!myPlayerId) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'monster_damaged',
      payload: { damage, fromPlayerId: myPlayerId, currentHp },
    });
  }, [myPlayerId]);

  const broadcastGhostPing = useCallback((ping: GhostPing) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'ghost_ping',
      payload: { ping },
    });
  }, []);

  const broadcastRadarActivated = useCallback((nickname: string, expiresAt: number) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'radar_activated',
      payload: { activatedBy: nickname, expiresAt },
    });
  }, []);

  const broadcastCrateLooted = useCallback((crateId: string, playerNickname: string, weaponName: string) => {
    if (!myPlayerId) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'crate_looted',
      payload: { crateId, playerId: myPlayerId, playerNickname, weaponName },
    });
  }, [myPlayerId]);

  const broadcastPlayerRevived = useCallback((revivedPlayerId: string, reviverNickname: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_revived',
      payload: { revivedPlayerId, reviverNickname },
    });
  }, []);

  const broadcastChestCountdown = useCallback((secondsRemaining: number, holdersCount: number) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'chest_countdown',
      payload: { secondsRemaining, holdersCount },
    });
  }, []);

  const broadcastRequestStateSync = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'request_state_sync',
      payload: {},
    });
  }, []);

  const broadcastFullStateSync = useCallback((state: {
    monster: Monster;
    crates: SupplyCrate[];
    chestCountdown: number;
    holdersCount: number;
  }) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'full_state_sync',
      payload: state,
    });
  }, []);

  const broadcastGameCancelled = useCallback((reason: string = 'Misión abortada por el anfitrión') => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game_cancelled',
      payload: { reason },
    });
  }, []);

  return {
    isConnected,
    onlineUsers,
    broadcastMonsterUpdate,
    broadcastPlayerMove,
    broadcastPlayerHit,
    broadcastMonsterDamaged,
    broadcastGhostPing,
    broadcastRadarActivated,
    broadcastCrateLooted,
    broadcastPlayerRevived,
    broadcastChestCountdown,
    broadcastRequestStateSync,
    broadcastFullStateSync,
    broadcastGameCancelled,
  };
}
