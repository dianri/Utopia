import { useState, useEffect, useCallback, useRef } from 'react';

export interface EvasionConfig {
  intervalMs: number;
  rangeX: number;
  rangeY: number;
  minOffset: number;
  minScale: number;
  maxScale: number;
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
    // Muy ágil / evasión rápida (Acechador o Explorador): escala compacta y saltos amplios
    return {
      intervalMs: 650,
      rangeX: 95,
      rangeY: 60,
      minOffset: 30,
      minScale: 0.7,
      maxScale: 1.1,
      speedClass: 'duration-300',
    };
  }

  if (
    normalized.includes('alpha') ||
    normalized.includes('monster_2') ||
    normalized === 'marksman'
  ) {
    // Medio / equilibrado (Alfa o Tirador)
    return {
      intervalMs: 850,
      rangeX: 85,
      rangeY: 55,
      minOffset: 28,
      minScale: 0.75,
      maxScale: 1.2,
      speedClass: 'duration-400',
    };
  }

  if (
    normalized.includes('colossus') ||
    normalized.includes('monster_3') ||
    normalized === 'tank'
  ) {
    // Pesado / lento (Coloso o Tanque): porte más grande pero desplazado del centro
    return {
      intervalMs: 1200,
      rangeX: 70,
      rangeY: 45,
      minOffset: 25,
      minScale: 0.85,
      maxScale: 1.25,
      speedClass: 'duration-600',
    };
  }

  // Por defecto (Médico o entidad estándar)
  return {
    intervalMs: 800,
    rangeX: 80,
    rangeY: 50,
    minOffset: 25,
    minScale: 0.75,
    maxScale: 1.15,
    speedClass: 'duration-400',
  };
};

/**
 * Calcula posición y escala procedural evitando acampar en el centro exacto (0,0)
 */
const getRandomPositionAndScale = (cfg: EvasionConfig) => {
  const signX = Math.random() < 0.5 ? -1 : 1;
  const signY = Math.random() < 0.5 ? -1 : 1;
  const minX = cfg.minOffset;
  const minY = 15;
  const spanX = Math.max(15, cfg.rangeX - minX);
  const spanY = Math.max(10, cfg.rangeY - minY);

  const newX = signX * (minX + Math.random() * spanX);
  const newY = signY * (minY + Math.random() * spanY);
  const newScale = Number((cfg.minScale + Math.random() * (cfg.maxScale - cfg.minScale)).toFixed(2));

  return {
    offset: { x: Math.round(newX), y: Math.round(newY) },
    scale: newScale,
  };
};

export interface UseEnemyEvasionProps {
  enemyType?: string;
  isCombatFinished: boolean;
}

/**
 * Hook de motor de evasión táctica, escala dinámica y respuesta física inmediata para arenas de combate
 */
export const useEnemyEvasion = ({ enemyType, isCombatFinished }: UseEnemyEvasionProps) => {
  const [targetOffset, setTargetOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [targetScale, setTargetScale] = useState<number>(1.0);
  const [isHitReaction, setIsHitReaction] = useState<boolean>(false);
  const hitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = getEvasionConfig(enemyType);

  // Bucle de evasión procedimental continuo con cambio de posición y escala dinámica
  useEffect(() => {
    if (isCombatFinished) {
      setTargetOffset({ x: 0, y: 0 });
      setTargetScale(1.0);
      return;
    }

    const interval = setInterval(() => {
      const next = getRandomPositionAndScale(config);
      setTargetOffset(next.offset);
      setTargetScale(next.scale);
    }, config.intervalMs);

    return () => clearInterval(interval);
  }, [
    enemyType,
    isCombatFinished,
    config.intervalMs,
    config.rangeX,
    config.rangeY,
    config.minOffset,
    config.minScale,
    config.maxScale,
  ]);

  // Disparo de micro-reacción física y esquiva refleja al recibir impacto
  const triggerHitReaction = useCallback(() => {
    if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
    setIsHitReaction(true);

    // Evasión instantánea a una nueva coordenada de fuga y variación de escala al ser alcanzado
    const next = getRandomPositionAndScale(config);
    setTargetOffset(next.offset);
    setTargetScale(next.scale);

    hitTimeoutRef.current = setTimeout(() => {
      setIsHitReaction(false);
      hitTimeoutRef.current = null;
    }, 200);
  }, [config]);

  useEffect(() => {
    return () => {
      if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
    };
  }, []);

  return {
    targetOffset,
    targetScale,
    isHitReaction,
    evasionSpeedClass: config.speedClass,
    triggerHitReaction,
  };
};
