import type { Feature, Polygon } from 'geojson';
import type { Coordinates } from '../types/game';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calcula la distancia en metros entre dos coordenadas geográficas mediante la fórmula de Haversine
 */
export function getDistanceMeters(coord1: Coordinates, coord2: Coordinates): number {
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Calcula el rumbo (bearing) en grados desde coord1 hasta coord2
 */
export function getBearing(coord1: Coordinates, coord2: Coordinates): number {
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;

  return (bearing + 360) % 360;
}

/**
 * Calcula un nuevo punto destino a partir de un punto inicial, una distancia en metros y un rumbo
 */
export function getDestinationPoint(
  start: Coordinates,
  distanceMeters: number,
  bearingDegrees: number
): Coordinates {
  const δ = distanceMeters / EARTH_RADIUS_METERS;
  const θ = (bearingDegrees * Math.PI) / 180;
  const φ1 = (start.lat * Math.PI) / 180;
  const λ1 = (start.lng * Math.PI) / 180;

  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    lat: (φ2 * 180) / Math.PI,
    lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * Genera un polígono GeoJSON circular alrededor de un centro con un radio en metros
 */
export function createGeoJsonCircle(
  center: Coordinates,
  radiusMeters: number,
  points: number = 64
): Feature<Polygon> {
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const point = getDestinationPoint(center, radiusMeters, angle);
    coordinates.push([point.lng, point.lat]);
  }

  return {
    type: 'Feature',
    properties: { radius: radiusMeters },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

/**
 * Genera un punto aleatorio dentro de un círculo con centro y radio dados
 */
export function getRandomPointInCircle(center: Coordinates, maxRadiusMeters: number): Coordinates {
  const randomDistance = Math.sqrt(Math.random()) * maxRadiusMeters;
  const randomAngle = Math.random() * 360;
  return getDestinationPoint(center, randomDistance, randomAngle);
}

/**
 * Genera una coordenada de spawn aleatoria y segura dentro del área de juego
 * (entre el 20% y el 70% del radio de juego respecto al centro)
 * para garantizar que los jugadores no aparezcan pegados al tesoro ni fuera del perímetro.
 */
export function getRandomSpawnPointInPlayArea(
  center: Coordinates,
  radiusMeters: number,
  minFraction: number = 0.2,
  maxFraction: number = 0.7
): Coordinates {
  const minR = radiusMeters * minFraction;
  const maxR = radiusMeters * maxFraction;
  // Muestreo uniforme en la corona circular [minR, maxR]
  const randomDistance = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + minR * minR);
  const randomAngle = Math.random() * 360;
  return getDestinationPoint(center, randomDistance, randomAngle);
}

/**
 * Interpola un desplazamiento en línea recta hacia el objetivo a una velocidad fija (m/s) durante un delta de tiempo (ms)
 */
export function stepTowards(
  current: Coordinates,
  target: Coordinates,
  speedMps: number,
  deltaTimeMs: number
): { position: Coordinates; arrived: boolean } {
  const dist = getDistanceMeters(current, target);
  const maxDistance = speedMps * (deltaTimeMs / 1000);

  if (dist <= maxDistance || dist < 0.5) {
    return { position: { ...target }, arrived: true };
  }

  const bearing = getBearing(current, target);
  const nextPos = getDestinationPoint(current, maxDistance, bearing);
  return { position: nextPos, arrived: false };
}
