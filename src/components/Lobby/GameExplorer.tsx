import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Navigation, Radio, Flame, RefreshCw, ChevronRight, ShieldAlert, Lock, Globe } from 'lucide-react';

export interface ActiveGameItem {
  id: string;
  code: string;
  name: string;
  is_public?: boolean;
  status: 'lobby' | 'playing';
  movement_mode: 'gps' | 'manual';
  play_area_radius: number;
  created_at: string;
  updated_at?: string;
  players?: { id: string; is_alive: boolean }[];
}

interface GameExplorerProps {
  onJoinGame: (code: string, isPrivate?: boolean, targetGame?: ActiveGameItem) => void;
  onCreateGame?: () => void;
}

export const GameExplorer: React.FC<GameExplorerProps> = ({ onJoinGame, onCreateGame }) => {
  const [games, setGames] = useState<ActiveGameItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveGames = useCallback(async (showRefreshingState = false) => {
    if (showRefreshingState) setIsRefreshing(true);
    setError(null);

    try {
      // Filtrar partidas fantasma cuyo updated_at tenga más de 45 minutos de antigüedad
      const cutoffTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();

      let { data, error: fetchErr } = await (supabase
        .from('games') as any)
        .select(`
          id,
          code,
          name,
          is_public,
          status,
          movement_mode,
          play_area_radius,
          created_at,
          updated_at,
          ended_at,
          players (
            id,
            is_alive
          )
        `)
        .in('status', ['lobby', 'playing'])
        .is('ended_at', null)
        .or(`updated_at.gt.${cutoffTime},and(updated_at.is.null,created_at.gt.${cutoffTime})`)
        .order('created_at', { ascending: false });

      if (fetchErr && (fetchErr.message?.includes('updated_at') || fetchErr.code === '42703')) {
        // Fallback defensivo si la migración de updated_at aún no se ha ejecutado en Supabase
        const fallback = await (supabase.from('games') as any)
          .select(`
            id,
            code,
            name,
            is_public,
            status,
            movement_mode,
            play_area_radius,
            created_at,
            ended_at,
            players (
              id,
              is_alive
            )
          `)
          .in('status', ['lobby', 'playing'])
          .is('ended_at', null)
          .gt('created_at', cutoffTime)
          .order('created_at', { ascending: false });
        data = fallback.data;
        fetchErr = fallback.error;
      }

      if (fetchErr) {
        console.error('Error fetching active games:', fetchErr);
        setError('No se pudieron cargar las operaciones.');
      } else if (data) {
        setGames(data as ActiveGameItem[]);
      }
    } catch (err: any) {
      console.error('Exception fetching active games:', err);
      setError('Error de conexión con el radar de salas.');
    } finally {
      setLoading(false);
      if (showRefreshingState) {
        setTimeout(() => setIsRefreshing(false), 300);
      }
    }
  }, []);

  useEffect(() => {
    // Purga oportunista de partidas inactivas en segundo plano al montar el explorador
    const runStaleCleanup = async () => {
      try {
        await (supabase.rpc as any)('cleanup_stale_games');
      } catch (err) {
        console.warn('No se pudo ejecutar cleanup_stale_games en GameExplorer:', err);
      }
    };
    runStaleCleanup();

    fetchActiveGames();

    // Suscripción en tiempo real para cambios en games y players
    const channel = supabase
      .channel('public_games_browser')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => {
          fetchActiveGames();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        () => {
          fetchActiveGames();
        }
      )
      .subscribe();

    // Actualizar periódicamente cada 10 segundos
    const interval = setInterval(() => {
      fetchActiveGames();
    }, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchActiveGames]);

  // Formato relativo de tiempo
  const formatTimeAgo = (dateStr: string) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (diffSec < 60) return 'Hace unos segundos';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    return `Hace ${diffHours}h`;
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* CABECERA DE LA SECCIÓN */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-hud-cyan animate-pulse" />
          <h2 className="text-xs sm:text-sm font-mono font-black text-white tracking-wider uppercase">
            Operaciones en Curso / Disponibles
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-hud-cyan/15 border border-hud-cyan/40 text-hud-cyan font-bold">
            {games.length} {games.length === 1 ? 'activa' : 'activas'}
          </span>
        </div>

        <button
          onClick={() => fetchActiveGames(true)}
          disabled={loading || isRefreshing}
          title="Actualizar listado"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-hud-panel border border-hud-border text-[11px] font-mono text-hud-muted hover:text-hud-cyan hover:border-hud-cyan transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-hud-cyan' : ''}`} />
          <span className="hidden sm:inline">Refrescar</span>
        </button>
      </div>

      {/* ESTADOS DE CARGA Y ERROR */}
      {loading ? (
        <div className="p-8 rounded-2xl bg-hud-panel/40 border border-hud-border/60 flex flex-col items-center justify-center gap-3 text-hud-muted font-mono text-xs">
          <RefreshCw className="w-5 h-5 animate-spin text-hud-cyan" />
          <span>Escaneando operaciones tácticas activas...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchActiveGames(true)}
            className="underline hover:text-white"
          >
            Reintentar
          </button>
        </div>
      ) : games.length === 0 ? (
        /* ESTADO VACÍO */
        <div className="p-6 sm:p-8 rounded-2xl bg-hud-panel/30 border border-hud-border/60 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-hud-cyan/5 border border-hud-cyan/20 flex items-center justify-center text-2xl">
            🛰️
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              No hay operaciones activas
            </span>
            <span className="text-[11px] font-mono text-hud-muted">
              Sé el primero en desplegar una partida en este sector o ingresa mediante código directo.
            </span>
          </div>
          {onCreateGame && (
            <button
              onClick={onCreateGame}
              className="mt-1 px-4 py-2 rounded-xl bg-hud-cyan/15 border border-hud-cyan/60 text-hud-cyan hover:bg-hud-cyan/25 font-mono text-xs font-bold uppercase tracking-wider transition-all"
            >
              + Desplegar Operación
            </button>
          )}
        </div>
      ) : (
        /* LISTADO DE PARTIDAS ACTIVAS */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] sm:max-h-[380px] overflow-y-auto pr-1">
          {games.map((g) => {
            const playerList = g.players || [];
            const totalPlayers = playerList.length;
            const livingPlayers = playerList.filter((p) => p.is_alive).length;
            const isPlaying = g.status === 'playing';
            const isPrivate = g.is_public === false;

            return (
              <div
                key={g.id}
                className={`bg-hud-panel/80 hover:bg-hud-panel border rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-all shadow-md group ${
                  isPrivate
                    ? 'border-amber-500/30 hover:border-amber-500/60'
                    : 'border-hud-border hover:border-hud-cyan/60'
                }`}
              >
                {/* FILA SUPERIOR: NOMBRE, CÓDIGO Y ESTADOS */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-mono font-black text-white truncate max-w-[140px] sm:max-w-[180px]">
                        {g.name || 'Operación Las Meriendas'}
                      </span>

                      {/* BADGE DE PRIVACIDAD */}
                      {isPrivate ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">
                          <Lock className="w-2.5 h-2.5 text-amber-400" />
                          <span>Acceso Restringido</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-hud-cyan/15 border border-hud-cyan/40 text-hud-cyan">
                          <Globe className="w-2.5 h-2.5 text-hud-cyan" />
                          <span>Pública</span>
                        </span>
                      )}

                      {/* CÓDIGO: VISIBLE EN PÚBLICAS, ENMASCARADO EN PRIVADAS */}
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold transition-colors ${
                          isPrivate
                            ? 'bg-amber-950/40 border border-amber-500/30 text-amber-300 tracking-widest'
                            : 'bg-hud-dark border border-hud-border text-hud-muted group-hover:text-hud-cyan'
                        }`}
                      >
                        {isPrivate ? '••••••' : `#${g.code}`}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-hud-muted mt-0.5">
                      {formatTimeAgo(g.created_at)}
                    </span>
                  </div>

                  {/* BADGE DE ESTADO DE JUEGO */}
                  {isPlaying ? (
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-400">
                      <Flame className="w-3 h-3 text-red-400 animate-pulse" />
                      <span>En Combate</span>
                    </span>
                  ) : (
                    <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      <Radio className="w-3 h-3 text-amber-400" />
                      <span>En Espera</span>
                    </span>
                  )}
                </div>

                {/* FILA INTERMEDIA: DETALLES DE JUEGO */}
                <div className="flex items-center flex-wrap gap-2 text-[11px] font-mono text-hud-muted">
                  <span className="inline-flex items-center gap-1 bg-hud-dark/80 px-2 py-1 rounded border border-hud-border/70">
                    <Users className="w-3 h-3 text-hud-cyan" />
                    <span className="text-white font-bold">{totalPlayers}</span>
                    <span>{totalPlayers === 1 ? 'agente' : 'agentes'}</span>
                    {isPlaying && (
                      <span className="text-emerald-400 font-bold">
                        ({livingPlayers} vivos)
                      </span>
                    )}
                  </span>

                  <span className="inline-flex items-center gap-1 bg-hud-dark/80 px-2 py-1 rounded border border-hud-border/70">
                    {g.movement_mode === 'gps' ? (
                      <>
                        <Navigation className="w-3 h-3 text-emerald-400" />
                        <span className="text-white font-semibold">GPS Real</span>
                      </>
                    ) : (
                      <>
                        <span>👆</span>
                        <span className="text-white font-semibold">Manual Tap</span>
                      </>
                    )}
                  </span>

                  <span className="bg-hud-dark/80 px-2 py-1 rounded border border-hud-border/70 text-hud-muted">
                    Zona: <strong className="text-white">{g.play_area_radius}m</strong>
                  </span>
                </div>

                {/* BOTÓN DE ACCIÓN: VERDE EN PÚBLICAS, ÁMBAR/DESBLOQUEO EN PRIVADAS */}
                <button
                  onClick={() => onJoinGame(g.code, isPrivate, g)}
                  className={`w-full py-2 px-3 rounded-lg font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 ${
                    isPrivate
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/20'
                      : isPlaying
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-black shadow-emerald-500/20'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-black shadow-emerald-500/20'
                  }`}
                >
                  {isPrivate ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Acceso Privado</span>
                    </>
                  ) : (
                    <>
                      <span>{isPlaying ? 'Unirse al Combate' : 'Unirse'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
