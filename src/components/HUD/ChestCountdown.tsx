import React from 'react';

export interface ChestCountdownProps {
  currentPhase?: number;
  currentStep?: number;
  currentChestIndex?: number;
  totalChests?: number;
  isInChestZone?: boolean;
  isMonsterInChestZone?: boolean;
  isMonsterDefending?: boolean;
  isMonsterAlive?: boolean;
  isChestInteracted?: boolean;
  onOpenChestModal?: () => void;
  secondsRemaining?: number;
  holdersCount?: number;
  requiredHolders?: number;
}

// Widget del cofre y botón "DESENCRIPTAR" eliminados por completo del HUD exterior del mapa:
// La desencriptación se activa de forma automática e inmediata al situarse a <= 15m del cofre.
export const ChestCountdown: React.FC<ChestCountdownProps> = () => null;
