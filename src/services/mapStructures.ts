import type { Coordinates, MapStructure } from '../types/game';
import { getBearing, getDestinationPoint } from './geoUtils';

/**
 * Radio de acción, protección y curación táctica del Hospital de Campaña en metros (40m).
 * Asegura la entrada y recuperación automática incluso al interactuar con niveles reducidos de zoom.
 */
export const HOSPITAL_RADIUS_METERS = 40;

/**
 * Coordenadas maestras fijas e inmutables de estructuras en el sector operativo Las Meriendas.
 * Red distribuida de 5 Hospitales de Campaña plenamente operativos con radio de 40m
 * anclados a edificios físicos reales del terreno para garantizar la recuperación en cualquiera de ellos.
 */
export const MASTER_LAS_MERIENDAS_STRUCTURES: MapStructure[] = [
  {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital Central',
    lat: 37.401,
    lng: -2.1558,
    radius: HOSPITAL_RADIUS_METERS, // 40m
  },
  {
    id: 'hospital-alfa',
    type: 'hospital',
    name: 'Hospital Alfa',
    lat: 37.4028,
    lng: -2.1548,
    radius: HOSPITAL_RADIUS_METERS, // 40m
  },
  {
    id: 'hospital-bravo',
    type: 'hospital',
    name: 'Hospital Bravo',
    lat: 37.4005,
    lng: -2.1542,
    radius: HOSPITAL_RADIUS_METERS, // 40m
  },
  {
    id: 'hospital-charlie',
    type: 'hospital',
    name: 'Hospital Charlie',
    lat: 37.4008,
    lng: -2.1582,
    radius: HOSPITAL_RADIUS_METERS, // 40m
  },
  {
    id: 'hospital-delta',
    type: 'hospital',
    name: 'Hospital Delta',
    lat: 37.4032,
    lng: -2.1578,
    radius: HOSPITAL_RADIUS_METERS, // 40m
  },
];

/**
 * Genera de forma determinista la red de Hospitales de Campaña en el mapa (5 instalaciones médicas plenamente operativas).
 * Garantiza inmutabilidad geográfica absoluta:
 * 1. Para Las Meriendas (centro ~37.4018, -2.1565), retorna siempre las estructuras maestras fijas.
 * 2. Para otros sectores operativos, calcula posiciones estables fijadas al centro de la sala
 *    sin depender de las coordenadas móviles de los cofres de fase subsecuentes.
 */
export function generateMapStructures(
  center: Coordinates,
  playAreaRadius: number,
  initialAnchor?: Coordinates
): MapStructure[] {
  // 1. Sector Operativo Las Meriendas: Coordenadas maestras fijas
  if (Math.abs(center.lat - 37.4018) < 0.05 && Math.abs(center.lng - -2.1565) < 0.05) {
    return MASTER_LAS_MERIENDAS_STRUCTURES.map((s) => ({ ...s }));
  }

  // 2. Otros sectores operativos: Generación determinista anclada al centro de sala
  const baseBearing = initialAnchor && (initialAnchor.lat !== center.lat || initialAnchor.lng !== center.lng)
    ? getBearing(center, initialAnchor)
    : 0;

  // Hospital Central (opuesto al ancla base, a ~60% del radio)
  const hospitalBearing = (baseBearing + 180) % 360;
  const hospitalDistance = Math.max(30, Math.min(playAreaRadius * 0.6, playAreaRadius - 20));
  const hospitalPos = getDestinationPoint(center, hospitalDistance, hospitalBearing);

  const hospital: MapStructure = {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital Central',
    lat: hospitalPos.lat,
    lng: hospitalPos.lng,
    radius: HOSPITAL_RADIUS_METERS,
  };

  // Hospitales de campaña distribuidos radialmente
  const hospitalOffsets = [
    { name: 'Hospital Alfa', angleOffset: 65, distRatio: 0.45, radius: HOSPITAL_RADIUS_METERS },
    { name: 'Hospital Bravo', angleOffset: 125, distRatio: 0.70, radius: HOSPITAL_RADIUS_METERS },
    { name: 'Hospital Charlie', angleOffset: 235, distRatio: 0.50, radius: HOSPITAL_RADIUS_METERS },
    { name: 'Hospital Delta', angleOffset: 295, distRatio: 0.65, radius: HOSPITAL_RADIUS_METERS },
  ];

  const subHospitals: MapStructure[] = hospitalOffsets.map((s, index) => {
    const bearing = (baseBearing + s.angleOffset) % 360;
    const distance = Math.max(25, Math.min(playAreaRadius * s.distRatio, playAreaRadius - 15));
    const pos = getDestinationPoint(center, distance, bearing);
    return {
      id: `hospital-${index + 1}`,
      type: 'hospital',
      name: s.name,
      lat: pos.lat,
      lng: pos.lng,
      radius: s.radius,
    };
  });

  return [hospital, ...subHospitals];
}
