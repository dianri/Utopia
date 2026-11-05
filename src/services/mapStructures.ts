import type { Coordinates, MapStructure } from '../types/game';
import { getBearing, getDestinationPoint } from './geoUtils';

/**
 * Radio de acción, protección y curación táctica del Hospital de Campaña en metros (20m).
 * Equilibra la frontera de recuperación ciñéndola fielmente a la edificación física.
 */
export const HOSPITAL_RADIUS_METERS = 20;

/**
 * Coordenadas maestras fijas e inmutables de estructuras en el sector operativo Las Meriendas.
 * 1 Hospital de Campaña central (radio 20m) y 4 Refugios Tácticos de guarecimiento y cobertura.
 */
export const MASTER_LAS_MERIENDAS_STRUCTURES: MapStructure[] = [
  {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital de Campaña',
    lat: 37.401,
    lng: -2.1558,
    radius: HOSPITAL_RADIUS_METERS, // 20m
  },
  {
    id: 'shelter-1',
    type: 'shelter',
    name: 'Refugio Alfa',
    lat: 37.4028,
    lng: -2.1548,
    radius: 14,
  },
  {
    id: 'shelter-2',
    type: 'shelter',
    name: 'Refugio Bravo',
    lat: 37.4005,
    lng: -2.1542,
    radius: 14,
  },
  {
    id: 'shelter-3',
    type: 'shelter',
    name: 'Refugio Charlie',
    lat: 37.4008,
    lng: -2.1582,
    radius: 14,
  },
  {
    id: 'shelter-4',
    type: 'shelter',
    name: 'Refugio Delta',
    lat: 37.4032,
    lng: -2.1578,
    radius: 14,
  },
];

/**
 * Genera de forma determinista las estructuras tácticas en el mapa (1 Hospital de Campaña y 4 Refugios Tácticos).
 * Garantiza inmutabilidad geográfica absoluta:
 * 1. Para Las Meriendas (centro ~37.4018, -2.1565), retorna siempre las estructuras maestras fijas.
 * 2. Para otros sectores operativos o radios compactos, calcula posiciones estables fijadas al centro de la sala
 *    sin depender de las coordenadas móviles de los cofres de fase subsecuentes.
 */
export function generateMapStructures(
  center: Coordinates,
  playAreaRadius: number,
  initialAnchor?: Coordinates
): MapStructure[] {
  // 1. Sector Operativo Las Meriendas: Coordenadas maestras fijas (solo si el radio es >= 250m)
  if (
    playAreaRadius >= 250 &&
    Math.abs(center.lat - 37.4018) < 0.05 &&
    Math.abs(center.lng - -2.1565) < 0.05
  ) {
    return MASTER_LAS_MERIENDAS_STRUCTURES.map((s) => ({ ...s }));
  }

  // 2. Otros sectores operativos o radios compactos (< 250m): Generación determinista proporcional
  const baseBearing = initialAnchor && (initialAnchor.lat !== center.lat || initialAnchor.lng !== center.lng)
    ? getBearing(center, initialAnchor)
    : 0;

  // Radio de interacción adaptativo para hospital en zonas compactas (20m estándar)
  const effectiveHospitalRadius = Math.min(
    HOSPITAL_RADIUS_METERS,
    Math.max(12, Math.round(playAreaRadius * 0.15))
  );

  // Radio de refugio adaptativo para zonas compactas
  const effectiveShelterRadius = Math.min(14, Math.max(10, Math.round(playAreaRadius * 0.1)));

  // Hospital de Campaña único (opuesto al ancla base, a ~55% del radio)
  const hospitalBearing = (baseBearing + 180) % 360;
  const hospitalDistance = Math.max(15, Math.min(playAreaRadius * 0.55, playAreaRadius - 15));
  const hospitalPos = getDestinationPoint(center, hospitalDistance, hospitalBearing);

  const hospital: MapStructure = {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital de Campaña',
    lat: hospitalPos.lat,
    lng: hospitalPos.lng,
    radius: effectiveHospitalRadius,
  };

  // Refugios tácticos distribuidos radialmente
  const shelterOffsets = [
    { name: 'Refugio Alfa', angleOffset: 65, distRatio: 0.45 },
    { name: 'Refugio Bravo', angleOffset: 125, distRatio: 0.70 },
    { name: 'Refugio Charlie', angleOffset: 235, distRatio: 0.50 },
    { name: 'Refugio Delta', angleOffset: 295, distRatio: 0.65 },
  ];

  const shelters: MapStructure[] = shelterOffsets.map((s, index) => {
    const bearing = (baseBearing + s.angleOffset) % 360;
    const distance = Math.max(15, Math.min(playAreaRadius * s.distRatio, playAreaRadius - 15));
    const pos = getDestinationPoint(center, distance, bearing);
    return {
      id: `shelter-${index + 1}`,
      type: 'shelter',
      name: s.name,
      lat: pos.lat,
      lng: pos.lng,
      radius: effectiveShelterRadius,
    };
  });

  return [hospital, ...shelters];
}
