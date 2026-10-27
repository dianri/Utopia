import type { Coordinates, MapStructure } from '../types/game';
import { getBearing, getDestinationPoint } from './geoUtils';

/**
 * Genera de forma determinista las estructuras tácticas en el mapa
 * (1 Hospital de Campaña y 4 Casas / Refugios) asegurando que queden dentro
 * del área operativa y a distancia segura del cofre del tesoro.
 */
export function generateMapStructures(
  center: Coordinates,
  playAreaRadius: number,
  treasureLocation: Coordinates
): MapStructure[] {
  const treasureBearing = getBearing(center, treasureLocation);

  // 1. HOSPITAL DE CAMPAÑA
  // Ubicado opuesto al tesoro (treasureBearing + 180°), a ~60% del radio operativo
  const hospitalBearing = (treasureBearing + 180) % 360;
  const hospitalDistance = Math.max(30, Math.min(playAreaRadius * 0.6, playAreaRadius - 20));
  const hospitalPos = getDestinationPoint(center, hospitalDistance, hospitalBearing);

  const hospital: MapStructure = {
    id: 'hospital-main',
    type: 'hospital',
    name: 'Hospital de Campaña',
    lat: hospitalPos.lat,
    lng: hospitalPos.lng,
    radius: 18, // Radio de interacción en metros
  };

  // 2. CASAS / REFUGIOS TÁCTICOS (4 estructuras distribuidas por el mapa)
  const shelterOffsets = [
    { name: 'Refugio Alfa', angleOffset: 65, distRatio: 0.45, radius: 14 },
    { name: 'Refugio Bravo', angleOffset: 125, distRatio: 0.70, radius: 14 },
    { name: 'Refugio Charlie', angleOffset: 235, distRatio: 0.50, radius: 14 },
    { name: 'Refugio Delta', angleOffset: 295, distRatio: 0.65, radius: 14 },
  ];

  const shelters: MapStructure[] = shelterOffsets.map((s, index) => {
    const bearing = (treasureBearing + s.angleOffset) % 360;
    const distance = Math.max(25, Math.min(playAreaRadius * s.distRatio, playAreaRadius - 15));
    const pos = getDestinationPoint(center, distance, bearing);
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
