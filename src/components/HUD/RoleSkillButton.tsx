import React from 'react';
import type { PlayerRole } from '../../types/game';
import { Radio, Shield, HeartPulse, Crosshair, Lock } from 'lucide-react';

interface RoleSkillButtonProps {
  role: PlayerRole;
  cooldownRemaining: number;
  isActive: boolean;
  onActivate: () => void;
  isAlive: boolean;
  isCriticallyWounded?: boolean;
  className?: string;
}

export const RoleSkillButton: React.FC<RoleSkillButtonProps> = ({
  role,
  cooldownRemaining,
  isActive,
  onActivate,
  isAlive,
  isCriticallyWounded = false,
  className,
}) => {
  if (!isAlive) return null;

  const isReady = cooldownRemaining <= 0 && !isCriticallyWounded;

  // Parámetros y temática visual según la clase
  const roleConfig = {
    scout: {
      name: 'RADAR',
      title: 'Radar Táctico (Revela al monstruo 10s)',
      icon: Radio,
      maxCd: 60,
      activeColor: 'bg-hud-cyan/30 border-hud-cyan text-hud-cyan ring-4 ring-hud-cyan/50 shadow-hud-cyan/50',
      readyColor: 'bg-gradient-to-br from-cyan-600 to-teal-500 border-cyan-300 text-white shadow-cyan-500/50 hover:brightness-110',
      strokeColor: '#00f0ff',
    },
    medic: {
      name: 'CURA',
      title: 'Pulso de Curación (+35 HP aliados cercanos)',
      icon: HeartPulse,
      maxCd: 45,
      activeColor: 'bg-emerald-500/30 border-emerald-400 text-emerald-300 ring-4 ring-emerald-400/50 shadow-emerald-500/50',
      readyColor: 'bg-gradient-to-br from-emerald-600 to-green-500 border-emerald-300 text-white shadow-emerald-500/50 hover:brightness-110',
      strokeColor: '#10b981',
    },
    tank: {
      name: 'ESCUDO',
      title: 'Provocación y Escudo (Atrae agro y -50% daño)',
      icon: Shield,
      maxCd: 45,
      activeColor: 'bg-blue-500/30 border-blue-400 text-blue-300 ring-4 ring-blue-400/50 shadow-blue-500/50',
      readyColor: 'bg-gradient-to-br from-blue-600 to-indigo-600 border-blue-300 text-white shadow-blue-500/50 hover:brightness-110',
      strokeColor: '#3b82f6',
    },
    marksman: {
      name: 'ALCANCE',
      title: 'Ojo de Halcón (+50% Rango de disparo)',
      icon: Crosshair,
      maxCd: 40,
      activeColor: 'bg-amber-500/30 border-amber-400 text-amber-300 ring-4 ring-amber-400/50 shadow-amber-500/50',
      readyColor: 'bg-gradient-to-br from-amber-600 to-orange-500 border-yellow-300 text-white shadow-amber-500/50 hover:brightness-110',
      strokeColor: '#f59e0b',
    },
  }[role];

  const IconComponent = roleConfig.icon;

  // Cálculo del anillo circular SVG de cooldown
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = cooldownRemaining > 0 ? cooldownRemaining / roleConfig.maxCd : 0;
  const strokeDashoffset = circumference * progressPercent;

  return (
    <div className={`shrink-0 pointer-events-auto flex flex-col items-center select-none ${className || ''}`}>
      <button
        onClick={onActivate}
        disabled={!isReady}
        className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex flex-col items-center justify-center shadow-2xl transition-all ${
          isCriticallyWounded
            ? 'bg-red-950/90 border-red-500/80 text-red-400 cursor-not-allowed opacity-80'
            : isActive
            ? `${roleConfig.activeColor} animate-pulse scale-105 cursor-pointer`
            : isReady
            ? `${roleConfig.readyColor} active:scale-95 cursor-pointer`
            : 'bg-hud-dark/95 border-hud-border/80 text-hud-muted cursor-not-allowed opacity-90'
        }`}
        title={isCriticallyWounded ? 'Habilidad bloqueada: Herido de Muerte' : roleConfig.title}
        aria-label={roleConfig.title}
      >
        {/* Anillo SVG de progreso circular para el tiempo de recarga */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          viewBox="0 0 64 64"
        >
          {/* Anillo de fondo */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="rgba(0, 0, 0, 0.5)"
            strokeWidth="3.5"
          />
          {/* Anillo de cuenta atrás activo */}
          {!isReady && !isCriticallyWounded && (
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={roleConfig.strokeColor}
              strokeWidth="3.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          )}
        </svg>

        {/* Contenido interior: Icono y etiqueta o temporizador */}
        {isCriticallyWounded ? (
          <div className="flex flex-col items-center justify-center">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            <span className="text-[7px] sm:text-[8px] font-mono font-bold text-red-400 uppercase tracking-tight mt-0.5">
              BLOQ
            </span>
          </div>
        ) : isReady || isActive ? (
          <>
            <IconComponent className={`w-5 h-5 sm:w-6 sm:h-6 ${isActive ? 'animate-bounce' : ''}`} />
            <span className="text-[7px] sm:text-[8px] font-mono font-black uppercase tracking-tighter mt-0.5 leading-none">
              {isActive ? 'ACTIVO' : roleConfig.name}
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <span className="text-xs sm:text-sm font-mono font-black text-white leading-tight">
              {cooldownRemaining}s
            </span>
            <span className="text-[7px] font-mono text-hud-muted uppercase tracking-tighter leading-none">
              {roleConfig.name}
            </span>
          </div>
        )}
      </button>
    </div>
  );
};
