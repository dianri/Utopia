import React, { useEffect, useState } from 'react';
import type { TacticalLogMessage } from '../../types/game';
import { X } from 'lucide-react';

interface CombatLogProps {
  messages: TacticalLogMessage[];
  onDismiss?: (id: string) => void;
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages, onDismiss }) => {
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());

  // Auto-descarte individual de mensajes tras 3.5 segundos con animación de fade-out
  useEffect(() => {
    if (messages.length === 0 || !onDismiss) return;

    const interval = setInterval(() => {
      const now = Date.now();
      messages.forEach((m) => {
        const age = now - m.timestamp;
        // Comenzar transición de desvanecimiento suave a los 3.1 segundos
        if (age >= 3100 && !fadingIds.has(m.id)) {
          setFadingIds((prev) => new Set(prev).add(m.id));
        }
        // Descartar completamente a los 3.5 segundos
        if (age >= 3500) {
          onDismiss(m.id);
        }
      });
    }, 100);

    return () => clearInterval(interval);
  }, [messages, onDismiss, fadingIds]);

  if (messages.length === 0) return null;

  const getTypeStyle = (type: TacticalLogMessage['type']) => {
    switch (type) {
      case 'combat':
        return 'text-red-300 border-red-500/40 bg-red-950/90 shadow-red-500/20';
      case 'warning':
        return 'text-amber-300 border-amber-500/40 bg-amber-950/90 shadow-amber-500/20';
      case 'loot':
        return 'text-emerald-300 border-emerald-500/40 bg-emerald-950/90 shadow-emerald-500/20';
      case 'victory':
        return 'text-yellow-200 border-yellow-500/40 bg-yellow-950/90 shadow-yellow-500/20';
      default:
        return 'text-hud-cyan border-hud-cyan/40 bg-slate-900/90 shadow-cyan-500/20';
    }
  };

  // Limitar estrictamente el registro visual a un máximo de 2 notificaciones simultáneas
  const visibleMessages = messages.slice(-2);

  return (
    <div className="fixed bottom-32 left-2 sm:bottom-28 sm:left-4 z-40 pointer-events-none max-w-[calc(100vw-1rem)] sm:max-w-xs flex flex-col-reverse gap-1.5">
      {visibleMessages.map((msg) => {
        const isFading = fadingIds.has(msg.id);
        return (
          <div
            key={msg.id}
            className={`pointer-events-auto flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border backdrop-blur-md shadow-lg transition-all duration-300 ${
              isFading
                ? 'opacity-0 -translate-y-1 scale-95'
                : 'opacity-100 translate-y-0 scale-100 animate-fade-in'
            } ${getTypeStyle(msg.type)}`}
          >
            <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
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
                className="shrink-0 p-1 -mr-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                title="Descartar aviso"
                aria-label="Cerrar notificación"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
