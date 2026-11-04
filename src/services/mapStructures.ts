import type { Coordinates, MapStructure } from '../types/game';
import { getDestinationPoint } from './geoUtils';

/**
 * Coordenadas maestras fijas para las estructuras permanentes de Las Meriendas.
 * (1 Hospital de Campaña y 4 Casas / Refugios Tácticos).
 * Totalmente inmutables durante toda la partida y a través de transiciones de fase.
 */
export const MASTER_LAS_MERIENDAS_STRUCTURES: MapStructure[] = [
  {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital de Campaña',
    lat: 37.401,
    lng: -2.1558,
    radius: 18, // Radio de interacción en metros
  },
  {
    id: 'shelter-1',
    type: 'shelter',
    name: 'Refugio Alfa',
    lat: 37.4024,
    lng: -2.1552,
    radius: 14,
  },
  {
    id: 'shelter-2',
    type: 'shelter',
    name: 'Refugio Bravo',
    lat: 37.4012,
    lng: -2.1548,
    radius: 14,
  },
  {
    id: 'shelter-3',
    type: 'shelter',
    name: 'Refugio Charlie',
    lat: 37.4011,
    lng: -2.1578,
    radius: 14,
  },
  {
    id: 'shelter-4',
    type: 'shelter',
    name: 'Refugio Delta',
    lat: 37.4026,
    lng: -2.1574,
    radius: 14,
  },
];

/**
 * Genera de forma determinista e inmutable las estructuras tácticas en el mapa
 * (1 Hospital de Campaña y 4 Casas / Refugios).
 * Desacopladas por completo de la ubicación del cofre del tesoro para evitar
 * teletransportes o desanclajes al avanzar de fase.
 */
export function generateMapStructures(
  center: Coordinates,
  playAreaRadius: number,
  _optionalAnchor?: Coordinates
): MapStructure[] {
  // Si las coordenadas corresponden al sector operativo de Las Meriendas,
  // usar las estructuras maestras fijas en edificaciones reales del terreno.
  const isLasMeriendas =
    Math.abs(center.lat - 37.4018) < 0.05 && Math.abs(center.lng - (-2.1565)) < 0.05;

  if (isLasMeriendas) {
    return MASTER_LAS_MERIENDAS_STRUCTURES.map((s) => ({ ...s }));
  }

  // Para centro personalizado fuera de Las Meriendas:
  // Ubicar de forma determinista las estructuras con ángulos cardinales fijos respecto al centro.
  const hospitalBearing = 145; // Sur-Sureste
  const hospitalDistance = Math.max(30, Math.min(playAreaRadius * 0.55, playAreaRadius - 20));
  const hospitalPos = getDestinationPoint(center, hospitalDistance, hospitalBearing);

  const hospital: MapStructure = {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital de Campaña',
    lat: hospitalPos.lat,
    lng: hospitalPos.lng,
    radius: 18,
  };

  const shelterOffsets = [
    { name: 'Refugio Alfa', bearing: 45, distRatio: 0.45, radius: 14 },
    { name: 'Refugio Bravo', bearing: 115, distRatio: 0.65, radius: 14 },
    { name: 'Refugio Charlie', bearing: 225, distRatio: 0.50, radius: 14 },
    { name: 'Refugio Delta', bearing: 305, distRatio: 0.60, radius: 14 },
  ];

  const shelters: MapStructure[] = shelterOffsets.map((s, index) => {
    const distance = Math.max(25, Math.min(playAreaRadius * s.distRatio, playAreaRadius - 15));
    const pos = getDestinationPoint(center, distance, s.bearing);
    return {
      id: `shelter-${index + 1}`,
      type: 'shelter',
      name: s.name,
      lat: pos.lat,
      lng: pos.lng,
      radius: s.radius,
    };
  });

  return [hospital, ...shelters];
}
