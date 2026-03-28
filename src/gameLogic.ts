import { DiceFace, GameState, Creature, GameMap, MapNode } from "./types";
import { BUFFS, DEBUFFS, ALL_EVENTS, MAX_AURAS, EVENTS_PER_RUN } from "./constants";

export const getRandomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateGameMap = (): GameMap => {
  const layers: MapNode[][] = [];
  
  // Layer 0: 2 nodes
  const layer0: MapNode[] = [
    { id: "0-0", event: getRandomElement(ALL_EVENTS.filter(e => e.id !== "boss_battle")), nextNodes: [], position: 0.3, isHighCorruption: false },
    { id: "0-1", event: getRandomElement(ALL_EVENTS.filter(e => e.id !== "boss_battle")), nextNodes: [], position: 0.7, isHighCorruption: false },
  ];
  layers.push(layer0);

  // Layers 1 to 5 (Events)
  for (let i = 1; i < EVENTS_PER_RUN; i++) {
    const numNodes = Math.floor(Math.random() * 2) + 2; // 2 to 3 nodes for better spacing
    const currentLayer: MapNode[] = [];
    for (let j = 0; j < numNodes; j++) {
      currentLayer.push({
        id: `${i}-${j}`,
        event: getRandomElement(ALL_EVENTS.filter(e => e.id !== "boss_battle")),
        nextNodes: [],
        position: (j + 0.5) / numNodes,
        isHighCorruption: false, // Initialized to false, dynamic later
      });
    }
    
    const prevLayer = layers[i - 1];
    
    // Ensure every node in currentLayer has at least one incoming connection
    currentLayer.forEach(currNode => {
      const nearestPrev = prevLayer.reduce((prev, curr) => 
        Math.abs(curr.position - currNode.position) < Math.abs(prev.position - currNode.position) ? curr : prev
      );
      nearestPrev.nextNodes.push(currNode.id);
    });

    // Ensure every node in prevLayer has at least one outgoing connection (if not already connected)
    prevLayer.forEach(prevNode => {
      if (prevNode.nextNodes.length === 0) {
        const nearestCurr = currentLayer.reduce((prev, curr) => 
          Math.abs(curr.position - prevNode.position) < Math.abs(prev.position - prevNode.position) ? curr : prev
        );
        prevNode.nextNodes.push(nearestCurr.id);
      }
      
      // Add a random second connection occasionally for branching
      if (Math.random() > 0.6 && currentLayer.length > 1) {
        const otherNodes = currentLayer.filter(n => !prevNode.nextNodes.includes(n.id));
        if (otherNodes.length > 0) {
          prevNode.nextNodes.push(getRandomElement(otherNodes).id);
        }
      }
    });

    // Remove duplicates just in case
    prevLayer.forEach(node => {
      node.nextNodes = Array.from(new Set(node.nextNodes));
    });
    
    layers.push(currentLayer);
  }

  // Boss Layer (Layer 6)
  const bossNode: MapNode = {
    id: "boss",
    event: ALL_EVENTS.find(e => e.id === "boss_battle") || ALL_EVENTS[0],
    nextNodes: [],
    position: 0.5,
    isHighCorruption: false,
  };
  layers.push([bossNode]);
  
  // Connect last event layer to boss
  layers[layers.length - 2].forEach(node => {
    node.nextNodes.push("boss");
  });

  return { layers };
};

export const createNewCreature = (): Creature => {
  return {
    name: "Lucky Wanderer",
    buff: getRandomElement(BUFFS),
    debuff: getRandomElement(DEBUFFS),
    traits: [],
  };
};

export const getInitialState = (totalGold: number = 0): GameState => ({
  runProgress: 0,
  totalGold,
  runGold: 0,
  corruption: 0,
  creature: null,
  currentEvent: null,
  selectableEvents: [],
  gameMap: null,
  currentMapNodeId: null,
  auras: [],
  rollResults: [],
  selectedDiceIndices: [],
  phase: "START",
  message: "The mist surrounds you. Choose your first path to save St. Patrick's Day.",
  bossRounds: 0,
});

export const rollDice = (): DiceFace[] => {
  const faces = [DiceFace.GOLD, DiceFace.CLOVER, DiceFace.CORRUPTION, DiceFace.WILD];
  return Array.from({ length: 4 }, () => getRandomElement(faces));
};

export const getCorruptionMultiplier = (corruption: number): number => {
  // Each point of corruption increases risk and reward by 10%
  return 1 + (corruption * 0.1);
};

export const applyDiceEffect = (face: DiceFace, state: GameState): Partial<GameState> => {
  let goldGain = 0;
  let corruptionChange = 0;
  const multiplier = getCorruptionMultiplier(state.corruption);

  switch (face) {
    case DiceFace.GOLD:
      goldGain = 5 * multiplier;
      break;
    case DiceFace.CLOVER:
      corruptionChange = -1; // Clover is pure, maybe not scaled? User said "risk is bigger", so maybe corruption gain is scaled but not reduction.
      break;
    case DiceFace.CORRUPTION:
      corruptionChange = 2 * multiplier;
      break;
    case DiceFace.WILD:
      goldGain = 5 * multiplier;
      corruptionChange = -1;
      break;
  }

  // Apply traits/buffs (simplified)
  if (state.creature?.traits.some(t => t.id === "gold_plus")) goldGain += 1;
  if (state.creature?.buff.includes("Lucky Charm")) goldGain += 1;
  if (state.creature?.traits.some(t => t.id === "clover_plus") && face === DiceFace.CLOVER) corruptionChange -= 1;

  return {
    runGold: state.runGold + Math.round(goldGain),
    corruption: Math.max(0, state.corruption + Math.round(corruptionChange)),
  };
};

export const applyAuraEffects = (state: GameState): Partial<GameState> => {
  let goldGain = 0;
  let corruptionChange = 0;
  const multiplier = getCorruptionMultiplier(state.corruption);

  state.auras.forEach(aura => {
    switch (aura) {
      case DiceFace.GOLD:
        goldGain += 1 * multiplier;
        break;
      case DiceFace.CLOVER:
        corruptionChange -= 1;
        break;
      case DiceFace.CORRUPTION:
        corruptionChange += 1 * multiplier;
        break;
      case DiceFace.WILD:
        goldGain += 1 * multiplier;
        corruptionChange -= 1;
        break;
    }
  });

  return {
    runGold: state.runGold + Math.round(goldGain),
    corruption: Math.max(0, state.corruption + Math.round(corruptionChange)),
  };
};

export const getSelectableEvents = (): any[] => {
  const shuffled = [...ALL_EVENTS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
};
