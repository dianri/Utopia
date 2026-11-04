import { useState, useEffect, useCallback, useRef } from 'react';

export interface EvasionConfig {
  intervalMs: number;
  rangeX: number;
  rangeY: number;
  speedClass: string;
}

/**
 * Configuración de movilidad y evasión procedural según el tipo de amenaza o rol militar
 */
export const getEvasionConfig = (threatType?: string): EvasionConfig => {
  const normalized = threatType?.toLowerCase() || '';

  if (
    normalized.includes('stalker') ||
    normalized.includes('monster_1') ||
    normalized === 'scout'
  ) {
    // Muy ágil / evasión rápida (Acechador o Explorador)
    return { intervalMs: 650, rangeX: 75, rangeY: 55, speedClass: 'duration-300' };
  }

  if (
    normalized.includes('alpha') ||
    normalized.includes('monster_2') ||
    normalized === 'marksman'
  ) {
    // Medio / equilibrado (Alfa o Tirador)
    return { intervalMs: 850, rangeX: 65, rangeY: 45, speedClass: 'duration-400' };
  }

  if (
    normalized.includes('colossus') ||
    normalized.includes('monster_3') ||
    normalized === 'tank'
  ) {
    // Pesado / lento (Coloso o Tanque)
    return { intervalMs: 1200, rangeX: 45, rangeY: 30, speedClass: 'duration-600' };
  }

  // Por defecto (Médico o entidad estándar)
  return { intervalMs: 800, rangeX: 60, rangeY: 40, speedClass: 'duration-400' };
};

export interface UseEnemyEvasionProps {
  enemyType?: string;
  isCombatFinished: boolean;
}

/**
 * Hook de motor de evasión táctica y respuesta física inmediata para arenas de combate
 */
export const useEnemyEvasion = ({ enemyType, isCombatFinished }: UseEnemyEvasionProps) => {
  const [targetOffset, setTargetOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHitReaction, setIsHitReaction] = useState<boolean>(false);
  const hitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = getEvasionConfig(enemyType);

  // Bucle de evasión procedimental continuo
  useEffect(() => {
    if (isCombatFinished) {
      setTargetOffset({ x: 0, y: 0 });
      return;
    }

    const interval = setInterval(() => {
      // Calcular nueva posición aleatoria sin salirse del área visual
      const newX = (Math.random() * 2 - 1) * config.rangeX;
      const newY = (Math.random() * 2 - 1) * config.rangeY;
      setTargetOffset({ x: Math.round(newX), y: Math.round(newY) });
    }, config.intervalMs);

    return () => clearInterval(interval);
  }, [enemyType, isCombatFinished, config.intervalMs, config.rangeX, config.rangeY]);

  // Disparo de micro-reacción física y esquiva refleja al recibir impacto
  const triggerHitReaction = useCallback(() => {
    if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
    setIsHitReaction(true);

    // Evasión instantánea a una nueva coordenada de fuga al ser alcanzado
    const newX = (Math.random() * 2 - 1) * config.rangeX;
    const newY = (Math.random() * 2 - 1) * config.rangeY;
    setTargetOffset({ x: Math.round(newX), y: Math.round(newY) });

    hitTimeoutRef.current = setTimeout(() => {
      setIsHitReaction(false);
      hitTimeoutRef.current = null;
    }, 200);
  }, [config.rangeX, config.rangeY]);

  useEffect(() => {
    return () => {
      if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
    };
  }, []);

  return {
    targetOffset,
    isHitReaction,
    evasionSpeedClass: config.speedClass,
    triggerHitReaction,
  };
};
