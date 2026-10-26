import React from 'react';
import type { TacticalLogMessage } from '../../types/game';

interface CombatLogProps {
  messages: TacticalLogMessage[];
}

export const CombatLog: React.FC<CombatLogProps> = ({ messages }) => {
  if (messages.length === 0) return null;

  const getTypeStyle = (type: TacticalLogMessage['type']) => {
    switch (type) {
      case 'combat':
        return 'text-red-400 border-red-500/30 bg-red-950/20';
      case 'warning':
        return 'text-amber-400 border-amber-500/30 bg-amber-950/20';
      case 'loot':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20';
      case 'victory':
        return 'text-yellow-300 border-yellow-500/30 bg-yellow-950/20';
      default:
        return 'text-hud-cyan border-hud-cyan/30 bg-hud-cyan/10';
    }
  };

  return (
    <div className="absolute bottom-20 left-4 z-10 pointer-events-none max-w-xs flex flex-col-reverse gap-1">
      {messages.slice(-4).map((msg) => (
        <div
          key={msg.id}
          className={`px-2.5 py-1 rounded text-[11px] font-mono border backdrop-blur-md shadow-md animate-fade-in ${getTypeStyle(
            msg.type
          )}`}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
};
