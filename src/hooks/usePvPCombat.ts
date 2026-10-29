import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { PvPAttackPayload } from '../types/game';

export interface PvPPetAttackPayload {
  attackerId: string;
  petId: string;
  petName: string;
  petIcon: string;
  damage: number;
  timestamp: number;
}

export interface PvPHpSyncPayload {
  playerId: string;
  hp: number;
  maxHp: number;
}

export interface PvPDefeatPayload {
  winnerId: string;
  loserId: string;
  timestamp?: number;
}

export interface PvPFleePayload {
  fleeingPlayerId: string;
}

interface UsePvPCombatOptions {
  combatId: string | null;
  myPlayerId: string;
  isOpen: boolean;
  onReceiveAttack?: (payload: PvPAttackPayload) => void;
  onReceivePetAttack?: (payload: PvPPetAttackPayload) => void;
  onReceiveHpSync?: (payload: PvPHpSyncPayload) => void;
  onOpponentDefeated?: (payload: PvPDefeatPayload) => void;
  onOpponentFlee?: (payload: PvPFleePayload) => void;
}

export function usePvPCombat({
  combatId,
  myPlayerId,
  isOpen,
  onReceiveAttack,
  onReceivePetAttack,
  onReceiveHpSync,
  onOpponentDefeated,
  onOpponentFlee,
}: UsePvPCombatOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const callbacksRef = useRef({
    onReceiveAttack,
    onReceivePetAttack,
    onReceiveHpSync,
    onOpponentDefeated,
    onOpponentFlee,
  });

  callbacksRef.current = {
    onReceiveAttack,
    onReceivePetAttack,
    onReceiveHpSync,
    onOpponentDefeated,
    onOpponentFlee,
  };

  useEffect(() => {
    if (!isOpen || !combatId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isSubscribedRef.current = false;
        setIsConnected(false);
      }
      return;
    }

    const channelName = `pvp_combat_${combatId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
      },
    });

    // 1. Recibir ataque del oponente
    channel.on('broadcast', { event: 'pvp_attack' }, ({ payload }) => {
      if (payload.attackerId !== myPlayerId) {
        callbacksRef.current.onReceiveAttack?.(payload as PvPAttackPayload);
      }
    });

    // 2. Recibir ataque de mascota del oponente
    channel.on('broadcast', { event: 'pvp_pet_attack' }, ({ payload }) => {
      if (payload.attackerId !== myPlayerId) {
        callbacksRef.current.onReceivePetAttack?.(payload as PvPPetAttackPayload);
      }
    });

    // 3. Sincronización de HP
    channel.on('broadcast', { event: 'pvp_sync_hp' }, ({ payload }) => {
      if (payload.playerId !== myPlayerId) {
        callbacksRef.current.onReceiveHpSync?.(payload as PvPHpSyncPayload);
      }
    });

    // 4. Derrota en duelo (soporte para pvp_defeat y pvp_player_defeated)
    channel.on('broadcast', { event: 'pvp_defeat' }, ({ payload }) => {
      callbacksRef.current.onOpponentDefeated?.(payload as PvPDefeatPayload);
    });
    channel.on('broadcast', { event: 'pvp_player_defeated' }, ({ payload }) => {
      callbacksRef.current.onOpponentDefeated?.(payload as PvPDefeatPayload);
    });

    // 5. Retirada / Huida del duelo
    channel.on('broadcast', { event: 'pvp_flee' }, ({ payload }) => {
      if (payload.fleeingPlayerId !== myPlayerId) {
        callbacksRef.current.onOpponentFlee?.(payload as PvPFleePayload);
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribedRef.current = true;
        setIsConnected(true);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        isSubscribedRef.current = false;
        setIsConnected(false);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        isSubscribedRef.current = false;
        setIsConnected(false);
      }
    };
  }, [isOpen, combatId, myPlayerId]);

  // Método de envío de ataque individual
  const sendAttack = useCallback(
    (damage: number, weaponId: string) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_attack',
        payload: {
          attackerId: myPlayerId,
          damage,
          weaponId,
          timestamp: Date.now(),
        },
      });
    },
    [myPlayerId]
  );

  // Método de ataque por mascota activa
  const sendPetAttack = useCallback(
    (damage: number, petId: string, petName: string, petIcon: string) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_pet_attack',
        payload: {
          attackerId: myPlayerId,
          petId,
          petName,
          petIcon,
          damage,
          timestamp: Date.now(),
        },
      });
    },
    [myPlayerId]
  );

  // Sincronizar HP actual
  const sendHpSync = useCallback(
    (hp: number, maxHp: number) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_sync_hp',
        payload: {
          playerId: myPlayerId,
          hp,
          maxHp,
        },
      });
    },
    [myPlayerId]
  );

  // Emitir evento de derrota (notificando pvp_defeat y pvp_player_defeated)
  const sendDefeat = useCallback(
    (winnerId: string, loserId: string) => {
      if (!channelRef.current || !isSubscribedRef.current) return;
      const payload: PvPDefeatPayload = {
        winnerId,
        loserId,
        timestamp: Date.now(),
      };
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_defeat',
        payload,
      });
      channelRef.current.send({
        type: 'broadcast',
        event: 'pvp_player_defeated',
        payload,
      });
    },
    []
  );

  // Emitir evento de retirada
  const sendFlee = useCallback(() => {
    if (!channelRef.current || !isSubscribedRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'pvp_flee',
      payload: {
        fleeingPlayerId: myPlayerId,
      },
    });
  }, [myPlayerId]);

  return {
    isConnected,
    sendAttack,
    sendPetAttack,
    sendHpSync,
    sendDefeat,
    sendFlee,
  };
}
