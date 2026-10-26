import { useState, useEffect, useRef, useCallback } from 'react';
import type { Coordinates, MovementMode } from '../types/game';
import { stepTowards } from '../services/geoUtils';

interface UseGeolocationOptions {
  mode: MovementMode;
  initialCenter: Coordinates;
  onPositionChange: (pos: Coordinates) => void;
  isAlive: boolean;
  isSlowed?: boolean;
}

export function useGeolocation({
  mode,
  initialCenter,
  onPositionChange,
  isAlive,
  isSlowed = false,
}: UseGeolocationOptions) {
  const [currentPosition, setCurrentPosition] = useState<Coordinates>(initialCenter);
  const [targetPosition, setTargetPosition] = useState<Coordinates | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const currentPosRef = useRef(currentPosition);
  currentPosRef.current = currentPosition;

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
        onPositionChangeRef.current(coords);
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
  // MODO MANUAL: TAP-TO-MOVE (1.4 m/s)
  // ==========================================
  const setManualDestination = useCallback((target: Coordinates) => {
    if (mode !== 'manual' || !isAlive) return;
    setTargetPosition(target);
  }, [mode, isAlive]);

  useEffect(() => {
    if (mode !== 'manual' || !targetPosition || !isAlive) return;

    let animFrame: number;
    let lastTime = performance.now();

    const speedMps = isSlowed ? 0.7 : 1.4; // 1.4 m/s paso humano normal, 0.7 m/s si está ralentizado

    const loop = (time: number) => {
      const deltaMs = Math.min(time - lastTime, 100);
      lastTime = time;

      const { position, arrived } = stepTowards(
        currentPosRef.current,
        targetPosition,
        speedMps,
        deltaMs
      );

      setCurrentPosition(position);
      onPositionChangeRef.current(position);

      if (!arrived) {
        animFrame = requestAnimationFrame(loop);
      } else {
        setTargetPosition(null);
      }
    };

    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [mode, targetPosition, isAlive, isSlowed]);

  return {
    currentPosition,
    targetPosition,
    setManualDestination,
    gpsAccuracy,
    isGpsActive,
    gpsError,
  };
}
