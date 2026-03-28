export enum DiceFace {
  GOLD = "GOLD",
  CLOVER = "CLOVER",
  CORRUPTION = "CORRUPTION",
  WILD = "WILD",
}

export const DICE_DESCRIPTIONS: Record<DiceFace, string> = {
  [DiceFace.GOLD]: "+5 Gold instantly, or +1 Gold per event as an Aura.",
  [DiceFace.CLOVER]: "-1 Corruption instantly, or -1 Corruption per event as an Aura.",
  [DiceFace.CORRUPTION]: "+2 Corruption instantly, or +1 Corruption per event as an Aura.",
  [DiceFace.WILD]: "+5 Gold & -1 Corruption instantly, or both as an Aura.",
};

export enum EventType {
  GOLD = "GOLD",
  SOCIAL = "SOCIAL",
  CURSE = "CURSE",
  RISK = "RISK",
  ARCANE = "ARCANE",
}

export interface EventChoice {
  label: string;
  effect: (state: GameState) => Partial<GameState>;
}

export interface EventCard {
  id: string;
  title: string;
  description: string;
  type: EventType;
  requiresDice: boolean;
  choices?: EventChoice[];
  baseEffect?: (state: GameState) => Partial<GameState>;
}

export interface Trait {
  id: string;
  name: string;
  description: string;
  effect: (state: GameState) => Partial<GameState>; // Or passive logic
}

export interface Creature {
  name: string;
  buff: string;
  debuff: string;
  traits: Trait[];
}

export type GamePhase = 
  | "START"
  | "SELECT_EVENT"
  | "RESOLVE_EVENT"
  | "ROLL_DICE"
  | "BOSS_ENCOUNTER"
  | "TRAIT_SELECTION"
  | "RUN_END";

export interface MapNode {
  id: string;
  event: EventCard;
  nextNodes: string[]; // IDs of nodes in the next layer
  position: number; // 0 to 1 for layout (relative x position)
  isHighCorruption?: boolean;
}

export interface GameMap {
  layers: MapNode[][];
}

export interface GameState {
  runProgress: number; // 0 to 6 (events), 7 (boss)
  totalGold: number;
  runGold: number;
  corruption: number;
  creature: Creature | null;
  currentEvent: EventCard | null;
  selectableEvents: EventCard[]; // These will be the nodes in the current layer
  gameMap: GameMap | null;
  currentMapNodeId: string | null;
  auras: DiceFace[];
  rollResults: DiceFace[];
  selectedDiceIndices: number[];
  phase: GamePhase;
  message: string;
  bossRounds: number;
}
