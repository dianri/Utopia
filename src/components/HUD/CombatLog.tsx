import React, { useEffect } from 'react';
import type { TacticalLogMessage } from '../../types/game';
import { X } from 'lucide-react';

interface CombatLogProps {
  messages: TacticalLogMessage[];
  onDismiss?: (id: string) => void;
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages, onDismiss }) => {
  // Auto-descarte individual de mensajes tras 4 segundos de inactividad
  useEffect(() => {
    if (messages.length === 0 || !onDismiss) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const expired = messages.filter((m) => now - m.timestamp >= 4000);
      if (expired.length > 0) {
        expired.forEach((m) => onDismiss(m.id));
      }
    }, 200);

    return () => clearInterval(interval);
  }, [messages, onDismiss]);

  if (messages.length === 0) return null;

  const getTypeStyle = (type: TacticalLogMessage['type']) => {
    switch (type) {
      case 'combat':
        return 'text-red-300 border-red-500/40 bg-red-950/80 shadow-red-500/20';
      case 'warning':
        return 'text-amber-300 border-amber-500/40 bg-amber-950/80 shadow-amber-500/20';
      case 'loot':
        return 'text-emerald-300 border-emerald-500/40 bg-emerald-950/80 shadow-emerald-500/20';
      case 'victory':
        return 'text-yellow-200 border-yellow-500/40 bg-yellow-950/80 shadow-yellow-500/20';
      default:
        return 'text-hud-cyan border-hud-cyan/40 bg-slate-900/80 shadow-cyan-500/20';
    }
  };

  // Limitar estrictamente el registro visual a un máximo de 3 mensajes simultáneos
  const visibleMessages = messages.slice(-3);

  return (
    <div className="absolute bottom-20 left-4 z-30 pointer-events-none max-w-sm flex flex-col-reverse gap-1.5">
      {visibleMessages.map((msg) => (
        <div
          key={msg.id}
          className={`pointer-events-auto flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-md shadow-lg transition-all animate-fade-in ${getTypeStyle(
            msg.type
          )}`}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="truncate">{msg.text}</span>
            {msg.count && msg.count > 1 && (
              <span className="shrink-0 px-1.5 py-0.2 text-[10px] font-black rounded-full bg-white/20 text-white font-mono shadow-sm">
                (x{msg.count})
              </span>
            )}
          </div>

          {onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(msg.id);
              }}
              className="shrink-0 p-1 -mr-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
              title="Descartar aviso"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
