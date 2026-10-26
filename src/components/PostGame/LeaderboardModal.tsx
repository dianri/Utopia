import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/supabase';
import { Trophy, RefreshCw } from 'lucide-react';

type MatchStat = Database['public']['Tables']['match_stats']['Row'];

interface LeaderboardModalProps {
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose }) => {
  const [stats, setStats] = useState<MatchStat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('match_stats')
        .select('*')
        .order('damage_dealt', { ascending: false })
        .limit(25);

      if (error) {
        console.error('Error al cargar ranking:', error);
      } else {
        setStats(data || []);
      }
    } catch (err) {
      console.error('Error general de ranking:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full bg-hud-dark border border-hud-border/80 rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 max-h-[85vh] my-auto">
        <div className="flex items-center justify-between border-b border-hud-border pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-mono font-black text-white uppercase tracking-wider">
              Salón de la Fama: Monster Hunt
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="p-1.5 rounded-lg bg-hud-panel border border-hud-border text-hud-muted hover:text-white"
              title="Actualizar ranking"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="text-hud-muted hover:text-white font-mono text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TABLA DE POSICIONES */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-hud-muted animate-pulse">
              Descargando registros tácticos de la base de datos...
            </div>
          ) : stats.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-hud-muted">
              Aún no hay registros de partidas guardados. ¡Sé el primero en cazar al Monstruo!
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-12 text-[10px] font-mono text-hud-muted uppercase px-3 py-1 font-bold">
                <span className="col-span-1">#</span>
                <span className="col-span-5">Cazador</span>
                <span className="col-span-2 text-right">Daño</span>
                <span className="col-span-2 text-right">Revives</span>
                <span className="col-span-2 text-right">Resultado</span>
              </div>

              {stats.map((row, idx) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-12 items-center p-2.5 rounded-lg text-xs font-mono border ${
                    idx === 0
                      ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'
                      : idx === 1
                      ? 'bg-slate-300/10 border-slate-300/30 text-slate-200'
                      : idx === 2
                      ? 'bg-amber-600/10 border-amber-600/30 text-amber-200'
                      : 'bg-hud-panel border-hud-border/60 text-slate-300'
                  }`}
                >
                  <span className="col-span-1 font-black flex items-center gap-1">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                  </span>
                  <div className="col-span-5 flex flex-col">
                    <span className="font-bold truncate text-white">{row.nickname}</span>
                    <span className="text-[10px] text-hud-muted uppercase">{row.role}</span>
                  </div>
                  <span className="col-span-2 text-right font-black text-red-400">
                    {row.damage_dealt}
                  </span>
                  <span className="col-span-2 text-right font-black text-emerald-400">
                    {row.revives_done}
                  </span>
                  <span className="col-span-2 text-right">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        row.won
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}
                    >
                      {row.won ? 'VICTORIA' : 'DERROTA'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-hud-panel border border-hud-border rounded-xl text-xs font-mono font-bold text-white hover:border-hud-cyan transition-all"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
