import type { Monster, Coordinates, Player } from '../types/game';
import { getDistanceMeters, getDestinationPoint, stepTowards, getBearing } from './geoUtils';
import { soundEffects } from './soundEffects';

export interface MonsterAIUpdateResult {
  updatedMonster: Monster;
  attackedPlayerId: string | null;
  attackDamage: number;
  slowedPlayerIds: string[];
  justEnraged: boolean;
  justDied: boolean;
  justRespawned: boolean;
}

export class MonsterAIController {
  private treasureLocation: Coordinates;
  private patrolRadiusMeters: number = 55;
  private lastAttackTimestamp: number = 0;
  private hadEnraged: boolean = false;
  private forcedTargetPlayerId: string | null = null;

  constructor(treasureLocation: Coordinates) {
    this.treasureLocation = treasureLocation;
  }

  public setTreasureLocation(coord: Coordinates) {
    this.treasureLocation = coord;
  }

  public setAggroTarget(playerId: string) {
    this.forcedTargetPlayerId = playerId;
  }

  /**
   * Ejecuta un tick de la IA del Monstruo (cada 1000ms en el Host)
   */
  public update(
    monster: Monster,
    players: Player[],
    isChestUnderContest: boolean = false
  ): MonsterAIUpdateResult {
    const result: MonsterAIUpdateResult = {
      updatedMonster: { ...monster },
      attackedPlayerId: null,
      attackDamage: 0,
      slowedPlayerIds: [],
      justEnraged: false,
      justDied: false,
      justRespawned: false,
    };

    const now = Date.now();

    // 1. GESTIÓN DE MUERTE TEMPORAL Y REAPARICIÓN (60 SEGUNDOS)
    if (monster.hp <= 0 || monster.state === 'dead') {
      const remaining = (monster.respawnTimeRemaining ?? 60) - 1;
      if (remaining <= 0) {
        // Reaparición completa en el cofre
        result.justRespawned = true;
        this.hadEnraged = false;
        result.updatedMonster = {
          ...monster,
          lat: this.treasureLocation.lat,
          lng: this.treasureLocation.lng,
          hp: monster.maxHp,
          state: 'patrol',
          targetPlayerId: null,
          speedMps: 1.1,
          respawnTimeRemaining: undefined,
          isEnraged: false,
          isRespawning: false,
        };
        soundEffects.playMonsterRoar();
      } else {
        result.updatedMonster = {
          ...monster,
          state: 'dead',
          hp: 0,
          respawnTimeRemaining: remaining,
          isRespawning: true,
        };
      }
      return result;
    }

    // 2. DETECCIÓN DE FASE 2: ENFURECIMIENTO (HP <= 30%)
    const hpRatio = monster.hp / monster.maxHp;
    let isEnraged = monster.isEnraged;
    let speedMps = 3.2;

    if (hpRatio <= 0.3 && !this.hadEnraged) {
      this.hadEnraged = true;
      isEnraged = true;
      result.justEnraged = true;
      soundEffects.playMonsterRoar();

      // Ralentizar jugadores a menos de 30m durante 5s (solo si están al aire libre y activos)
      players.forEach((p) => {
        if (p.isAlive && p.lat && p.lng && !p.insideBuildingId && !p.isCriticallyWounded && p.status !== 'critically_wounded') {
          const dist = getDistanceMeters(monster, { lat: p.lat, lng: p.lng });
          if (dist <= 35) {
            result.slowedPlayerIds.push(p.id);
          }
        }
      });
    }

    if (isEnraged) {
      speedMps = Math.round(3.2 * 1.4 * 10) / 10; // +40% de velocidad (~4.5 m/s)
    }

    // 3. SELECCIÓN DE OBJETIVO (PRIORIZANDO TANQUE O JUGADOR MÁS CERCANO)
    // Los jugadores dentro de refugios/hospital o heridos de muerte son ignorados por el monstruo
    const livingPlayers = players.filter(
      (p) =>
        p.isAlive &&
        p.lat != null &&
        p.lng != null &&
        !p.insideBuildingId &&
        !p.isCriticallyWounded &&
        p.status !== 'critically_wounded'
    );
    let targetPlayer: Player | null = null;

    const aggroRadius = isEnraged ? 120 : 85;

    // A. Si el cofre está siendo pirateado o manipulado, el monstruo entra en SPRINT DE FURIA DEFENSIVA
    if (isChestUnderContest) {
      const defendSpeed = isEnraged ? 4.2 : 3.8; // Sprint drástico de furia defensiva (3.5 - 4.0 m/s)
      const distToChest = getDistanceMeters(monster, this.treasureLocation);

      // Priorizar a jugadores dentro del radio del tesoro (20-30m)
      const defenders = livingPlayers.filter((p) => {
        return getDistanceMeters(this.treasureLocation, { lat: p.lat!, lng: p.lng! }) <= 25;
      });

      if (defenders.length > 0 && distToChest <= 30) {
        // Al llegar al cofre, atacar inmediatamente a los defensores
        const tankDefender = defenders.find((p) => p.role === 'tank');
        targetPlayer = tankDefender || defenders[0];
      } else {
        // Moverse directo a máxima velocidad hacia el cofre del tesoro
        const { position } = stepTowards(monster, this.treasureLocation, defendSpeed, 1000);
        result.updatedMonster = {
          ...monster,
          lat: position.lat,
          lng: position.lng,
          state: 'defend_chest',
          speedMps: defendSpeed,
          isEnraged,
          targetPlayerId: null,
        };
        return result;
      }
    }

    // B. Si un jugador atacó recientemente al monstruo, perseguirlo con máxima prioridad
    if (!targetPlayer && this.forcedTargetPlayerId) {
      const attacker = livingPlayers.find((p) => p.id === this.forcedTargetPlayerId);
      if (attacker && attacker.lat != null && attacker.lng != null) {
        const dist = getDistanceMeters(monster, { lat: attacker.lat, lng: attacker.lng });
        if (dist <= aggroRadius * 1.5) {
          targetPlayer = attacker;
        } else {
          // Se alejó demasiado, olvidar objetivo forzado
          this.forcedTargetPlayerId = null;
        }
      } else {
        this.forcedTargetPlayerId = null;
      }
    }

    // C. Buscar objetivo vivo en rango de agresión (prioridad: Tanque > más cercano)
    if (!targetPlayer) {
      let nearestTank: { player: Player; dist: number } | null = null;
      let nearestOther: { player: Player; dist: number } | null = null;

      livingPlayers.forEach((p) => {
        const dist = getDistanceMeters(monster, { lat: p.lat!, lng: p.lng! });
        if (dist <= aggroRadius) {
          if (p.role === 'tank') {
            if (!nearestTank || dist < nearestTank.dist) {
              nearestTank = { player: p, dist };
            }
          } else {
            if (!nearestOther || dist < nearestOther.dist) {
              nearestOther = { player: p, dist };
            }
          }
        }
      });

      // El tanque atrae la atención si está en rango de agresión
      if (nearestTank) {
        targetPlayer = (nearestTank as { player: Player; dist: number }).player;
      } else if (nearestOther) {
        targetPlayer = (nearestOther as { player: Player; dist: number }).player;
      }
    }

    // 4. EJECUCIÓN DEL MOVIMIENTO
    if (targetPlayer && targetPlayer.lat != null && targetPlayer.lng != null) {
      // ESTADO: PERSECUCIÓN
      const targetCoord: Coordinates = { lat: targetPlayer.lat, lng: targetPlayer.lng };
      const distToTarget = getDistanceMeters(monster, targetCoord);

      // Si está a distancia de ataque (< 15 metros)
      if (distToTarget <= 15) {
        if (now - this.lastAttackTimestamp >= 1200) {
          this.lastAttackTimestamp = now;
          result.attackedPlayerId = targetPlayer.id;
          result.attackDamage = isEnraged ? 35 : 24;
          soundEffects.playAlarm();
        }
      }

      // Avanzar hacia el objetivo
      const { position } = stepTowards(monster, targetCoord, speedMps, 1000);
      result.updatedMonster = {
        ...monster,
        lat: position.lat,
        lng: position.lng,
        state: isEnraged ? 'enraged' : 'chase',
        speedMps,
        targetPlayerId: targetPlayer.id,
        isEnraged,
      };
    } else {
      // ESTADO: PATRULLA CIRCULAR LENTA ALREDEDOR DEL COFRE (PASEO: 1.1 M/S)
      const anchorPoint: Coordinates =
        this.treasureLocation && this.treasureLocation.lat && this.treasureLocation.lng
          ? this.treasureLocation
          : { lat: monster.lat, lng: monster.lng };

      // Calculamos el rumbo actual del monstruo respecto al cofre
      const currentBearing = getBearing(anchorPoint, monster);
      // Avanzamos suavemente en la circunferencia (+2 grados por tick de 1s para un paseo continuo a ~1.1 m/s)
      const nextAngle = (currentBearing + 2) % 360;
      const patrolTarget = getDestinationPoint(
        anchorPoint,
        this.patrolRadiusMeters,
        nextAngle
      );

      const patrolSpeed = 1.1; // Paseo lento de patrulla: los jugadores (1.4 m/s) son notablemente más rápidos
      const { position } = stepTowards(monster, patrolTarget, patrolSpeed, 1000);
      result.updatedMonster = {
        ...monster,
        lat: position.lat,
        lng: position.lng,
        state: 'patrol',
        speedMps: patrolSpeed,
        targetPlayerId: null,
        isEnraged,
      };
    }

    return result;
  }
}

