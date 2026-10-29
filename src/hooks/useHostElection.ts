import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Player, GameRoom } from '../types/game';

export interface PresenceMeta {
  playerId: string;
  userId: string;
  onlineAt?: string;
  joinedAt?: number;
}

export interface UseHostElectionParams {
  room: GameRoom | null;
  myPlayer: Player | null;
  presenceState: Record<string, any[]>;
  onHostClaimed?: (newHostId: string, isMe: boolean) => void;
  broadcastHostMigrated?: (payload: {
    newHostPlayerId: string;
    newHostUserId: string;
    newHostNickname: string;
  }) => void;
}

export function useHostElection({
  room,
  myPlayer,
  presenceState,
  onHostClaimed,
  broadcastHostMigrated,
}: UseHostElectionParams) {
  const [electedHostId, setElectedHostId] = useState<string | null>(null);
  const claimingInProgressRef = useRef<boolean>(false);

  // Obtener lista ordenada de todos los jugadores activos conectados actualmente en presence
  const sortedActivePlayers = useMemo(() => {
    const activePresences: PresenceMeta[] = Object.values(presenceState)
      .flat()
      .filter((p: any) => p && p.playerId);

    if (activePresences.length === 0) return [];

    // Orden determinista estricto:
    // 1º por timestamp de llegada ('joinedAt' o 'onlineAt')
    // 2º por ID alfanumérico como desempate determinista
    return activePresences.sort((a, b) => {
      const timeA = a.joinedAt || (a.onlineAt ? new Date(a.onlineAt).getTime() : 0);
      const timeB = b.joinedAt || (b.onlineAt ? new Date(b.onlineAt).getTime() : 0);
      if (timeA !== timeB) return timeA - timeB;
      return a.playerId.localeCompare(b.playerId);
    });
  }, [presenceState]);

  // Candidato determinista prioritario
  const designatedCandidate = sortedActivePlayers[0] || null;
  const designatedHostPlayerId = designatedCandidate?.playerId || null;

  // Algoritmo de detección de desconexión del host y failover
  useEffect(() => {
    if (!room || !myPlayer) return;

    // Si aún no hay presencia de jugadores, mantener host actual si soy yo
    if (sortedActivePlayers.length === 0) {
      if (myPlayer.isHost) {
        setElectedHostId(myPlayer.id);
      }
      return;
    }

    const currentHostUserId = room.hostId;
    const isCurrentHostOnline = sortedActivePlayers.some(
      (p) => p.userId === currentHostUserId
    );

    // Si el host actual de la sala sigue conectado en presence, respetamos su liderazgo
    if (isCurrentHostOnline) {
      const activeHost = sortedActivePlayers.find((p) => p.userId === currentHostUserId);
      if (activeHost) {
        setElectedHostId(activeHost.playerId);
        return;
      }
    }

    // EL HOST ACTUAL SE HA DESCONECTADO (Presence Leave / Timeout) -> FAILOVER DETERMINISTA
    if (designatedHostPlayerId) {
      setElectedHostId(designatedHostPlayerId);
      const isMe = designatedHostPlayerId === myPlayer.id;

      if (isMe && !claimingInProgressRef.current) {
        claimingInProgressRef.current = true;

        // 1. Reclamar propiedad de la sala en Supabase
        (supabase.from('games') as any)
          .update({
            host_id: myPlayer.userId,
          })
          .eq('id', room.id)
          .then(({ error }: any) => {
            claimingInProgressRef.current = false;
            if (error) {
              console.warn('[HostElection] Error al persistir nuevo host en Supabase:', error);
            }
          });

        // 2. Difundir evento de relevo inmediato vía Realtime broadcast
        broadcastHostMigrated?.({
          newHostPlayerId: myPlayer.id,
          newHostUserId: myPlayer.userId,
          newHostNickname: myPlayer.nickname,
        });

        onHostClaimed?.(myPlayer.id, true);
      } else if (!isMe) {
        onHostClaimed?.(designatedHostPlayerId, false);
      }
    }
  }, [
    room?.id,
    room?.hostId,
    myPlayer?.id,
    myPlayer?.userId,
    myPlayer?.nickname,
    designatedHostPlayerId,
    sortedActivePlayers,
    onHostClaimed,
    broadcastHostMigrated,
  ]);

  const isElectedHost = Boolean(
    (electedHostId && myPlayer && electedHostId === myPlayer.id) ||
    (!electedHostId && designatedHostPlayerId && myPlayer && designatedHostPlayerId === myPlayer.id) ||
    myPlayer?.isHost ||
    (room && myPlayer && room.hostId === myPlayer.userId)
  );

  return {
    electedHostId: electedHostId || designatedHostPlayerId,
    isElectedHost,
    sortedActivePlayers,
    setElectedHostId,
  };
}
