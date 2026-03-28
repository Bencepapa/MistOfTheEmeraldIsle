import { DiceFace, EventType, EventCard, Trait } from "./types";

export const MAX_CORRUPTION = 10;
export const MAX_AURAS = 5;
export const EVENTS_PER_RUN = 6;

export const BUFFS = [
  "Lucky Charm (+1 Gold from all sources)",
  "Strong Stomach (-1 Corruption from Clover dice)",
  "Aura Master (+1 Aura slot - Placeholder)",
  "Quick Feet (Skip one Curse event - Placeholder)",
];

export const DEBUFFS = [
  "Clumsy Hands (+1 Corruption from Risk events)",
  "Greedy Heart (+1 Corruption when gaining Gold)",
  "Fading Luck (Auras last shorter - Placeholder)",
  "Heavy Feet (Cannot skip events)",
];

export const TRAITS: Trait[] = [
  {
    id: "gold_plus",
    name: "Golden Touch",
    description: "+1 Gold from all sources",
    effect: (s) => ({}), // Handled in logic
  },
  {
    id: "clover_plus",
    name: "Four-Leaf Finder",
    description: "-1 Corruption from Clover dice",
    effect: (s) => ({}), // Handled in logic
  },
  {
    id: "aura_plus",
    name: "Aura Expansion",
    description: "+1 Aura slot (Max 6)",
    effect: (s) => ({}), // Handled in logic
  },
];

export const ALL_EVENTS: EventCard[] = [
  {
    id: "gold_pot",
    title: "Glimmer in the Mist",
    description: "A faint golden glow pierces through the thick fog. You find a forgotten stash!",
    type: EventType.GOLD,
    requiresDice: false,
    baseEffect: (s) => ({ runGold: s.runGold + 20, message: "You recovered 20 gold from the mist!" }),
  },
  {
    id: "leprechaun_deal",
    title: "Shadowy Figure",
    description: "A figure emerges from the mist, offering a shortcut for a price. Do you trust them?",
    type: EventType.SOCIAL,
    requiresDice: false,
    choices: [
      {
        label: "Accept: Gain 30 Gold, but +2 Corruption",
        effect: (s) => ({ runGold: s.runGold + 30, corruption: s.corruption + 2, message: "The mist feels heavier, but your pockets are full." }),
      },
      {
        label: "Decline: Gain nothing, stay safe.",
        effect: (s) => ({ message: "You retreat back into the safety of the known path." }),
      },
    ],
  },
  {
    id: "misty_bog",
    title: "The Choking Fog",
    description: "The mist here is thick and suffocating. Can you find your way through?",
    type: EventType.RISK,
    requiresDice: true,
    baseEffect: (s) => ({ message: "Roll the dice to navigate the choking fog!" }),
  },
  {
    id: "cursed_clover",
    title: "Withered Clover",
    description: "You find a patch of clovers, but they have been corrupted by the mist.",
    type: EventType.CURSE,
    requiresDice: false,
    baseEffect: (s) => ({ corruption: s.corruption + 3, message: "The corruption spreads. +3 Corruption." }),
  },
  {
    id: "pub_brawl",
    title: "The Silent Tavern",
    description: "You find a tavern, but the patrons are possessed by the mist's influence!",
    type: EventType.SOCIAL,
    requiresDice: false,
    choices: [
      {
        label: "Fight back: +10 Gold, +1 Corruption",
        effect: (s) => ({ runGold: s.runGold + 10, corruption: s.corruption + 1, message: "You fought off the shadows and found some coins." }),
      },
      {
        label: "Sneak past: -5 Gold, -1 Corruption",
        effect: (s) => ({ runGold: Math.max(0, s.runGold - 5), corruption: Math.max(0, s.corruption - 1), message: "You escaped, but lost some supplies in the dark." }),
      },
    ],
  },
  {
    id: "rainbow_bridge",
    title: "Fading Rainbow",
    description: "A bridge of light struggles to exist in the mist. It may collapse at any moment.",
    type: EventType.RISK,
    requiresDice: true,
    baseEffect: (s) => ({ message: "Roll to cross the fading bridge!" }),
  },
  {
    id: "boss_battle",
    title: "The Mist Weaver",
    description: "The source of the corruption reveals itself! Defeat the Mist Weaver to save the Isle.",
    type: EventType.ARCANE,
    requiresDice: true,
    baseEffect: (s) => ({ message: "The final battle begins!" }),
  },
];
