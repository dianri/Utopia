import { useState, useEffect, useRef, useCallback } from 'react';
import type { Coordinates, MovementMode } from '../types/game';
import { stepTowards } from '../services/geoUtils';

interface UseGeolocationOptions {
  mode: MovementMode;
  baseSpeedMps?: number;
  initialPosition: Coordinates | null;
  positionKey?: string | null;
  onPositionChange: (pos: Coordinates, isFinal?: boolean) => void;
  isAlive: boolean;
  isSlowed?: boolean;
  speedMultiplier?: number;
  isMovingBlocked?: boolean;
}

export function useGeolocation({
  mode,
  baseSpeedMps = 1.4,
  initialPosition,
  positionKey,
  onPositionChange,
  isAlive,
  isSlowed = false,
  speedMultiplier = 1,
  isMovingBlocked = false,
}: UseGeolocationOptions) {
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(initialPosition);
  const [targetPosition, setTargetPosition] = useState<Coordinates | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const currentPosRef = useRef<Coordinates | null>(currentPosition);
  currentPosRef.current = currentPosition;

  const targetPositionRef = useRef<Coordinates | null>(null);
  const isHandlingPositionChangeRef = useRef<boolean>(false);

  const baseSpeedMpsRef = useRef<number>(baseSpeedMps);
  baseSpeedMpsRef.current = baseSpeedMps;

  const lastKeyRef = useRef<string | null | undefined>(positionKey);

  // Sincronizar posición inicial cuando cambia de sala o cuando se recibe posición de spawn válida
  useEffect(() => {
    if (initialPosition) {
      if (lastKeyRef.current !== positionKey || !currentPosRef.current) {
        lastKeyRef.current = positionKey;
        setCurrentPosition(initialPosition);
        currentPosRef.current = initialPosition;
        targetPositionRef.current = null;
        setTargetPosition(null);
      }
    }
  }, [initialPosition, positionKey]);

  // Permitir reseteo explícito de posición (por ejemplo al spawnear en una sala)
  const resetPosition = useCallback((coords: Coordinates) => {
    targetPositionRef.current = null;
    setCurrentPosition(coords);
    currentPosRef.current = coords;
    setTargetPosition(null);
    if (isHandlingPositionChangeRef.current) return;
    isHandlingPositionChangeRef.current = true;
    try {
      onPositionChangeRef.current(coords, true);
    } finally {
      isHandlingPositionChangeRef.current = false;
    }
  }, []);

  // Cancelar inmediatamente cualquier desplazamiento activo y fijar posición
  const cancelMovement = useCallback(() => {
    const wasMoving = targetPositionRef.current !== null;
    targetPositionRef.current = null;
    setTargetPosition(null);
    // Si no había movimiento activo o ya estamos dentro de un ciclo de cambio de posición,
    // NO re-disparar onPositionChange sincrónicamente para prevenir llamadas recursivas y desbordamiento de pila
    if (!wasMoving || isHandlingPositionChangeRef.current) return;
    if (currentPosRef.current) {
      isHandlingPositionChangeRef.current = true;
      try {
        onPositionChangeRef.current(currentPosRef.current, true);
      } finally {
        isHandlingPositionChangeRef.current = false;
      }
    }
  }, []);

  // Si se bloquea el movimiento (ej. al entrar en combate), cancelar destino inmediatamente
  useEffect(() => {
    if (isMovingBlocked) {
      cancelMovement();
    }
  }, [isMovingBlocked, cancelMovement]);

  // ==========================================
  // MODO GPS REAL (watchPosition)
  // ==========================================
  useEffect(() => {
    if (mode !== 'gps' || !isAlive) {
      setIsGpsActive(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocalización no soportada en este navegador.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: Coordinates = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setGpsAccuracy(pos.coords.accuracy);
        setIsGpsActive(true);
        setGpsError(null);
        setCurrentPosition(coords);
        if (isHandlingPositionChangeRef.current) return;
        isHandlingPositionChangeRef.current = true;
        try {
          onPositionChangeRef.current(coords, true);
        } finally {
          isHandlingPositionChangeRef.current = false;
        }
      },
      (err) => {
        console.warn('Error GPS:', err.message);
        setGpsError(err.message);
        setIsGpsActive(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [mode, isAlive]);

  // ==========================================
  // MODO MANUAL: TAP-TO-MOVE (Interpolación lineal según velocidad de sala)
  // ==========================================
  const setManualDestination = useCallback(
    (target: Coordinates) => {
      if (mode !== 'manual' || !isAlive || isMovingBlocked) return;
      targetPositionRef.current = target;
      setTargetPosition(target);
    },
    [mode, isAlive, isMovingBlocked]
  );

  useEffect(() => {
    if (mode !== 'manual' || !targetPosition || !isAlive || isMovingBlocked) return;

    let animFrame: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!currentPosRef.current || isMovingBlocked) return;

      const deltaMs = Math.min(time - lastTime, 100);
      lastTime = time;

      // Calcular velocidad efectiva dinámicamente en cada frame para reflejar cambios autoritativos inmediatos
      const activeBase = (baseSpeedMpsRef.current && baseSpeedMpsRef.current > 0 ? baseSpeedMpsRef.current : 1.4);
      const effectiveBaseSpeed = activeBase * (speedMultiplier || 1);
      const currentSpeedMps = isSlowed ? effectiveBaseSpeed * 0.5 : effectiveBaseSpeed;

      const { position, arrived } = stepTowards(
        currentPosRef.current,
        targetPosition,
        currentSpeedMps,
        deltaMs
      );

      setCurrentPosition(position);
      if (!isHandlingPositionChangeRef.current) {
        isHandlingPositionChangeRef.current = true;
        try {
          onPositionChangeRef.current(position, arrived);
        } finally {
          isHandlingPositionChangeRef.current = false;
        }
      }

      if (!arrived && !isMovingBlocked) {
        animFrame = requestAnimationFrame(loop);
      } else {
        targetPositionRef.current = null;
        setTargetPosition(null);
      }
    };

    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [mode, targetPosition, isAlive, isSlowed, baseSpeedMps, speedMultiplier, isMovingBlocked]);

  return {
    currentPosition,
    targetPosition,
    setManualDestination,
    resetPosition,
    cancelMovement,
    gpsAccuracy,
    isGpsActive,
    gpsError,
  };
}
