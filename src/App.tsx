/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coins, 
  ShieldAlert, 
  Dice5, 
  Sparkles, 
  Skull, 
  Trophy, 
  ChevronRight,
  RefreshCw,
  Info
} from 'lucide-react';

import { 
  DiceFace, 
  GameState, 
  EventCard, 
  GamePhase,
  DICE_DESCRIPTIONS
} from './types';
import { 
  MAX_CORRUPTION, 
  MAX_AURAS, 
  EVENTS_PER_RUN, 
  TRAITS,
  ALL_EVENTS
} from './constants';
import { 
  getInitialState, 
  createNewCreature, 
  getSelectableEvents, 
  rollDice, 
  applyDiceEffect, 
  applyAuraEffects,
  generateGameMap
} from './gameLogic';
import { MapNode } from './types';

export default function App() {
  const [state, setState] = useState<GameState>(() => getInitialState());
  const [activeTooltip, setActiveTooltip] = useState<{ id: string, title: string, description: string } | null>(null);
  const [showCharacterPage, setShowCharacterPage] = useState(false);
  const [goldAnimations, setGoldAnimations] = useState<{ id: number, amount: number }[]>([]);
  const lastGoldRef = useRef(state.runGold);

  useEffect(() => {
    if (state.runGold > lastGoldRef.current) {
      const diff = state.runGold - lastGoldRef.current;
      const id = Date.now();
      setGoldAnimations(prev => [...prev, { id, amount: diff }]);
      setTimeout(() => {
        setGoldAnimations(prev => prev.filter(a => a.id !== id));
      }, 1000);
    }
    lastGoldRef.current = state.runGold;
  }, [state.runGold]);

  // Global Game Over Check - Safety net for corruption softlocks
  useEffect(() => {
    if (state.corruption >= MAX_CORRUPTION && state.phase !== "RUN_END") {
      setState(prev => ({
        ...prev,
        phase: "RUN_END",
        totalGold: prev.totalGold + prev.runGold,
        message: "The mist has consumed your spirit. St. Patrick's Day remains lost.",
      }));
    }
  }, [state.corruption, state.phase]);

  // Helper to check for game over and update state
  const withGameOverCheck = (updates: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => {
    setState(prev => {
      const next = typeof updates === 'function' ? updates(prev) : updates;
      const merged = { ...prev, ...next };
      
      if (merged.corruption >= MAX_CORRUPTION && merged.phase !== "RUN_END") {
        return {
          ...merged,
          phase: "RUN_END",
          totalGold: merged.totalGold + merged.runGold,
          message: "The mist has consumed your spirit. St. Patrick's Day remains lost.",
        };
      }
      return merged;
    });
  };

  // Start a new run
  const startRun = () => {
    const newState = getInitialState(state.totalGold);
    const gameMap = generateGameMap();
    newState.creature = createNewCreature();
    newState.gameMap = gameMap;
    newState.phase = "SELECT_EVENT";
    newState.selectableEvents = gameMap.layers[0].map(node => node.event);
    newState.message = "Choose your first path.";
    setState(newState);
    setActiveTooltip(null);
  };

  // Select an event
  const selectEvent = (node: MapNode) => {
    const event = node.event;
    // Apply Aura effects before every event
    const auraUpdates = applyAuraEffects(state);
    
    // Corruption scaling for base effects
    const multiplier = node.isHighCorruption ? 1.5 : 1.0; // Extra boost for high corruption nodes
    
    const nextState = {
      ...state,
      ...auraUpdates,
      currentEvent: event,
      currentMapNodeId: node.id,
      selectableEvents: [],
      phase: event.requiresDice ? "ROLL_DICE" : "RESOLVE_EVENT" as GamePhase,
      message: event.description,
    };

    if (!event.requiresDice && event.baseEffect) {
      const effectUpdates = event.baseEffect(nextState);
      // Scale gold and corruption in effect updates if it's a high corruption node
      if (node.isHighCorruption) {
        if (effectUpdates.runGold) effectUpdates.runGold = Math.round(effectUpdates.runGold * 1.5);
        if (effectUpdates.corruption) effectUpdates.corruption = Math.round(effectUpdates.corruption * 1.5);
      }
      withGameOverCheck({ ...nextState, ...effectUpdates });
    } else {
      withGameOverCheck(nextState);
    }
  };

  const advanceToNextNodes = (currentState: GameState): Partial<GameState> => {
    const nextProgress = currentState.runProgress + 1;
    
    if (nextProgress >= EVENTS_PER_RUN) {
      const bossEvent = currentState.gameMap?.layers[nextProgress]?.[0]?.event || ALL_EVENTS.find(e => e.id === "boss_battle");
      return {
        runProgress: nextProgress,
        phase: "BOSS_ENCOUNTER",
        selectableEvents: [],
        currentEvent: bossEvent,
        message: bossEvent?.description || "The Final Showdown",
      };
    }
    
    const currentNode = currentState.gameMap?.layers.flat().find(n => n.id === currentState.currentMapNodeId);
    const nextNodeIds = currentNode?.nextNodes || [];
    
    // Dynamic High Corruption: if corruption >= 7, mark next layer's nodes as high corruption
    let updatedMap = currentState.gameMap;
    if (currentState.corruption >= 7 && updatedMap) {
      const newLayers = [...updatedMap.layers];
      const nextLayer = [...newLayers[nextProgress]];
      let changed = false;
      const updatedNextLayer = nextLayer.map(node => {
        if (nextNodeIds.includes(node.id) && !node.isHighCorruption) {
          changed = true;
          return { ...node, isHighCorruption: true };
        }
        return node;
      });
      if (changed) {
        newLayers[nextProgress] = updatedNextLayer;
        updatedMap = { ...updatedMap, layers: newLayers };
      }
    }

    const nextNodes = updatedMap?.layers[nextProgress].filter(n => nextNodeIds.includes(n.id)) || [];
    
    return {
      runProgress: nextProgress,
      phase: "SELECT_EVENT",
      selectableEvents: nextNodes.map(n => n.event),
      gameMap: updatedMap,
    };
  };

  // Handle Social Choice
  const handleChoice = (choiceEffect: (s: GameState) => Partial<GameState>) => {
    const updates = choiceEffect(state);
    const nextState = { ...state, ...updates };
    const advancement = advanceToNextNodes(nextState);
    
    withGameOverCheck({
      ...updates,
      ...advancement,
    });
  };

  // Handle Simple Event Resolution (non-choice, non-dice)
  const resolveSimpleEvent = () => {
    const advancement = advanceToNextNodes(state);
    withGameOverCheck({
      ...advancement,
      currentEvent: null,
    });
  };

  // Roll Dice
  const handleRoll = () => {
    const results = rollDice();
    setState(prev => ({
      ...prev,
      rollResults: results,
      selectedDiceIndices: [],
      message: "Select exactly 2 dice for instant effects. The rest become Auras.",
    }));
  };

  // Select Dice
  const toggleDiceSelection = (index: number) => {
    setState(prev => {
      const selected = [...prev.selectedDiceIndices];
      const idx = selected.indexOf(index);
      if (idx > -1) {
        selected.splice(idx, 1);
      } else if (selected.length < 2) {
        selected.push(index);
      }
      return { ...prev, selectedDiceIndices: selected };
    });
  };

  // Resolve Dice
  const resolveDice = () => {
    if (state.selectedDiceIndices.length !== 2) return;

    let nextState = { ...state };
    const selectedFaces = state.selectedDiceIndices.map(i => state.rollResults[i]);
    const auraFaces = state.rollResults.filter((_, i) => !state.selectedDiceIndices.includes(i));

    // Apply selected dice
    selectedFaces.forEach(face => {
      const updates = applyDiceEffect(face, nextState);
      nextState = { ...nextState, ...updates };
    });

    // Update Auras (FIFO)
    let newAuras = [...state.auras, ...auraFaces];
    if (newAuras.length > MAX_AURAS) {
      newAuras = newAuras.slice(newAuras.length - MAX_AURAS);
    }

    const nextProgress = state.runProgress + 1;
    const isBoss = state.phase === "BOSS_ENCOUNTER";
    
    if (isBoss) {
      const nextRound = state.bossRounds + 1;
      if (nextRound >= 3) {
        // Boss Defeated
        withGameOverCheck({
          ...nextState,
          auras: newAuras,
          bossRounds: nextRound,
          phase: "TRAIT_SELECTION",
          message: "The Boss is defeated! Choose a new trait.",
          rollResults: [],
          selectedDiceIndices: [],
        });
      } else {
        // Next Boss Round
        withGameOverCheck({
          ...nextState,
          auras: newAuras,
          bossRounds: nextRound,
          corruption: nextState.corruption + 1, // Boss pressure
          message: `Boss Round ${nextRound + 1}. Roll again!`,
          rollResults: [],
          selectedDiceIndices: [],
        });
      }
    } else {
      const advancement = advanceToNextNodes(nextState);
      withGameOverCheck({
        ...nextState,
        ...advancement,
        auras: newAuras,
        currentEvent: null,
        rollResults: [],
        selectedDiceIndices: [],
      });
    }
  };

  // Handle Boss Encounter Start
  const startBoss = () => {
    setState(prev => ({
      ...prev,
      phase: "BOSS_ENCOUNTER",
      message: "The Great Leprechaun King challenges you! Survive 3 rounds of dice rolls.",
      bossRounds: 0,
    }));
  };

  // Select Trait
  const selectTrait = (trait: any) => {
    const gameMap = generateGameMap();
    setState(prev => ({
      ...prev,
      creature: prev.creature ? { ...prev.creature, traits: [...prev.creature.traits, trait] } : null,
      totalGold: prev.totalGold + prev.runGold,
      runGold: 0,
      runProgress: 0,
      corruption: 0,
      gameMap,
      currentMapNodeId: null,
      phase: "SELECT_EVENT",
      selectableEvents: gameMap.layers[0].map(node => node.event),
      message: "Trait acquired! Continue your journey or start fresh.",
    }));
  };

  // Check for Game Over (Safety fallback)
  useEffect(() => {
    if (state.corruption >= MAX_CORRUPTION && state.phase !== "RUN_END") {
      withGameOverCheck({});
    }
  }, [state.corruption, state.phase]);

  const diceIcon = (face: DiceFace) => {
    switch (face) {
      case DiceFace.GOLD: return <Coins className="text-yellow-500" />;
      case DiceFace.CLOVER: return <Sparkles className="text-green-500" />;
      case DiceFace.CORRUPTION: return <Skull className="text-purple-500" />;
      case DiceFace.WILD: return <RefreshCw className="text-blue-500" />;
    }
  };

  const getAuraSummary = () => {
    let gold = 0;
    let corruption = 0;
    const multiplier = state.corruption * 0.1 + 1;

    state.auras.forEach(aura => {
      switch (aura) {
        case DiceFace.GOLD: gold += 1 * multiplier; break;
        case DiceFace.CLOVER: corruption -= 1; break;
        case DiceFace.CORRUPTION: corruption += 1 * multiplier; break;
        case DiceFace.WILD: gold += 1 * multiplier; corruption -= 1; break;
      }
    });

    const parts = [];
    if (gold !== 0) parts.push(`Gold ${gold > 0 ? '+' : ''}${Math.round(gold)}`);
    if (corruption !== 0) parts.push(`Corruption ${corruption > 0 ? '+' : ''}${Math.round(corruption)}`);
    return parts.join(' | ') || "No active effects";
  };

  return (
    <div className="h-screen bg-stone-900 text-stone-100 font-sans selection:bg-green-500/30 flex flex-col overflow-hidden relative">
      {/* Character Page Overlay */}
      <AnimatePresence>
        {showCharacterPage && state.creature && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] bg-stone-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-stone-900 border border-stone-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-stone-800 flex justify-between items-center bg-stone-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-900/20">
                    <Trophy className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">{state.creature.name}</h2>
                    <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Character Profile</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCharacterPage(false)}
                  className="p-2 hover:bg-stone-800 rounded-full transition-colors"
                >
                  <RefreshCw className="w-5 h-5 text-stone-500 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Innate Traits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-stone-800/50 border border-stone-700 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-green-500 uppercase mb-1">Active Buff</p>
                    <h3 className="font-bold text-lg mb-1">{state.creature.buff.split(' (')[0]}</h3>
                    <p className="text-xs text-stone-400 leading-relaxed">{state.creature.buff.includes('(') ? state.creature.buff.split('(')[1].replace(')', '') : "No description available."}</p>
                  </div>
                  <div className="bg-stone-800/50 border border-stone-700 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Active Debuff</p>
                    <h3 className="font-bold text-lg mb-1">{state.creature.debuff.split(' (')[0]}</h3>
                    <p className="text-xs text-stone-400 leading-relaxed">{state.creature.debuff.includes('(') ? state.creature.debuff.split('(')[1].replace(')', '') : "No description available."}</p>
                  </div>
                </div>

                {/* Collected Traits */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> Collected Traits ({state.creature.traits.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {state.creature.traits.map((trait, i) => (
                      <div key={i} className="bg-stone-800/30 border border-stone-700/50 p-4 rounded-2xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
                          <Sparkles className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-100">{trait.name}</h4>
                          <p className="text-xs text-stone-500">{trait.description}</p>
                        </div>
                      </div>
                    ))}
                    {state.creature.traits.length === 0 && (
                      <div className="py-8 text-center border-2 border-dashed border-stone-800 rounded-2xl">
                        <p className="text-xs text-stone-600 uppercase font-bold tracking-widest">No traits collected yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-stone-900/80 border-t border-stone-800">
                <button 
                  onClick={() => setShowCharacterPage(false)}
                  className="w-full py-4 bg-stone-800 hover:bg-stone-700 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all"
                >
                  Back to Journey
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip Overlay */}
      <AnimatePresence>
        {activeTooltip && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveTooltip(null)}
            className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-stone-800 border border-stone-700 p-6 rounded-2xl shadow-2xl max-w-xs w-full text-center space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">{activeTooltip.title}</h3>
                <p className="text-lg font-black text-stone-100">{activeTooltip.id}</p>
              </div>
              <p className="text-sm text-stone-400 leading-relaxed">{activeTooltip.description}</p>
              <button 
                onClick={() => setActiveTooltip(null)}
                className="w-full py-3 bg-stone-700 hover:bg-stone-600 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / Top Bar */}
      <header className="shrink-0 border-b border-stone-800 bg-stone-900/80 backdrop-blur-md z-50">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-stone-800 p-1.5 rounded-lg border border-stone-700">
              <Sparkles className="text-green-500 w-4 h-4" />
            </div>
            <div>
              <h1 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 leading-none">Mist of the Emerald Isle</h1>
              <p className="text-[10px] font-bold text-green-500 uppercase tracking-tighter">Save St. Patrick's Day</p>
              <p className="text-[10px] font-mono text-stone-500">Total: {state.totalGold}</p>
            </div>
          </div>

          {state.creature && (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowCharacterPage(true)}
                className="flex flex-col items-center hover:opacity-80 transition-opacity"
              >
                <Trophy className="w-4 h-4 text-yellow-500" />
                <p className="text-[8px] font-bold text-stone-500 uppercase">Profile</p>
              </button>
              <button 
                onClick={() => setActiveTooltip({ id: state.creature!.buff, title: "Buff", description: "A positive trait granted at the start of the run." })}
                className="text-right hover:opacity-80 transition-opacity"
              >
                <p className="text-[9px] font-bold text-green-500 uppercase leading-none">Buff</p>
                <p className="text-[9px] text-stone-400 max-w-[80px] truncate">{state.creature.buff}</p>
              </button>
              <button 
                onClick={() => setActiveTooltip({ id: state.creature!.debuff, title: "Debuff", description: "A negative trait granted at the start of the run." })}
                className="text-right hover:opacity-80 transition-opacity"
              >
                <p className="text-[9px] font-bold text-red-500 uppercase leading-none">Debuff</p>
                <p className="text-[9px] text-stone-400 max-w-[80px] truncate">{state.creature.debuff}</p>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Status Bar / Desktop Sidebar */}
      <div className="shrink-0 bg-stone-900/50 border-b border-stone-800 md:hidden">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
          {/* Corruption Mini */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between mb-1">
              <span className="text-[9px] font-bold uppercase text-stone-500 flex items-center gap-1">
                <ShieldAlert className="w-2 h-2" /> {state.corruption}/10
              </span>
            </div>
            <div className="h-1.5 bg-stone-900 rounded-full overflow-hidden border border-stone-700">
              <motion.div 
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400"
                animate={{ width: `${(state.corruption / MAX_CORRUPTION) * 100}%` }}
              />
            </div>
          </div>

          {/* Auras Mini */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
              {Array.from({ length: MAX_AURAS }).map((_, i) => {
                const aura = state.auras[i];
                return (
                  <button 
                    key={i} 
                    onClick={() => aura ? setActiveTooltip({ id: aura, title: "Aura", description: DICE_DESCRIPTIONS[aura] }) : null}
                    className={`shrink-0 w-6 h-6 border rounded-md flex items-center justify-center scale-90 transition-colors ${aura ? 'bg-stone-800 border-stone-700 hover:border-stone-500' : 'bg-stone-900/30 border-stone-800/50'}`}
                  >
                    {aura ? React.cloneElement(diceIcon(aura) as React.ReactElement, { className: 'w-3 h-3' }) : <div className="w-1 h-1 bg-stone-800 rounded-full" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[7px] font-mono text-stone-500 uppercase text-center leading-none">{getAuraSummary()}</p>
          </div>

          {/* Run Gold Mini */}
          <div className="text-right shrink-0 relative">
            <p className="text-[9px] font-bold text-stone-500 uppercase leading-none">Run Gold</p>
            <div className="flex items-center justify-end gap-1">
              <p className="text-sm font-bold text-yellow-500 font-mono leading-none">{state.runGold}</p>
              <AnimatePresence>
                {goldAnimations.map(anim => (
                  <motion.span
                    key={anim.id}
                    initial={{ opacity: 0, y: 0, scale: 0.5 }}
                    animate={{ opacity: 1, y: -30, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    className="absolute right-0 text-xs font-black text-yellow-400 pointer-events-none drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                  >
                    +{anim.amount}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-4 py-4 md:py-8 grid grid-cols-1 md:grid-cols-4 gap-8 h-full">
          
          {/* Desktop Sidebar (Hidden on Mobile) */}
          <aside className="hidden md:block md:col-span-1 space-y-6">
            <section className="bg-stone-800/50 border border-stone-700 rounded-2xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-3 h-3" /> Corruption
              </h2>
              <div className="relative h-4 bg-stone-900 rounded-full overflow-hidden border border-stone-700">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-purple-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(state.corruption / MAX_CORRUPTION) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 font-mono text-[10px] text-stone-500">
                <span>0</span>
                <span className="text-stone-300">{state.corruption} / {MAX_CORRUPTION}</span>
                <span>10</span>
              </div>
            </section>

            <section className="bg-stone-800/50 border border-stone-700 rounded-2xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Auras ({state.auras.length}/{MAX_AURAS})
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: MAX_AURAS }).map((_, i) => {
                  const aura = state.auras[i];
                  return (
                    <motion.button 
                      key={i}
                      initial={false}
                      animate={{ scale: aura ? 1 : 0.95 }}
                      onClick={() => aura ? setActiveTooltip({ id: aura, title: "Aura", description: DICE_DESCRIPTIONS[aura] }) : null}
                      className={`aspect-square border rounded-xl flex items-center justify-center shadow-inner transition-all ${aura ? 'bg-stone-900 border-stone-700 hover:border-stone-500' : 'bg-stone-950/20 border-stone-800/30'}`}
                    >
                      {aura ? diceIcon(aura) : <div className="w-1.5 h-1.5 bg-stone-800 rounded-full" />}
                    </motion.button>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-stone-800">
                <p className="text-[9px] font-mono text-stone-400 uppercase tracking-tighter text-center">{getAuraSummary()}</p>
              </div>
            </section>

            <section className="bg-stone-800/50 border border-stone-700 rounded-2xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4 flex items-center gap-2">
                <Coins className="w-3 h-3" /> Run Gold
              </h2>
              <div className="flex items-center gap-3 relative">
                <p className="text-2xl font-bold text-yellow-500 font-mono">{state.runGold}</p>
                <AnimatePresence>
                  {goldAnimations.map(anim => (
                    <motion.span
                      key={anim.id}
                      initial={{ opacity: 0, x: 0, scale: 0.5 }}
                      animate={{ opacity: 1, x: 40, scale: 1.5 }}
                      exit={{ opacity: 0 }}
                      className="absolute left-12 text-xl font-black text-yellow-400 pointer-events-none drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]"
                    >
                      +{anim.amount}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          </aside>

          {/* Center: Game Area */}
          <div className="md:col-span-3 flex flex-col gap-4 md:gap-8 min-h-0">
            
            {/* Message Banner */}
            <div className="shrink-0 bg-stone-800 border-l-4 border-green-600 p-3 md:p-4 rounded-r-xl shadow-lg">
              <p className="text-xs md:text-sm italic text-stone-300">"{state.message}"</p>
            </div>

            <div className="flex-1 min-h-0 relative">
              <AnimatePresence mode="wait">
                {state.phase === "START" && (
                  <motion.div 
                    key="start"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center justify-center h-full space-y-6 md:space-y-8 py-10"
                  >
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 md:w-24 md:h-24 bg-green-600 rounded-full mx-auto flex items-center justify-center shadow-2xl shadow-green-900/20">
                        <Sparkles className="w-8 h-8 md:w-12 md:h-12 text-white" />
                      </div>
      <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">Mist of the Emerald Isle</h2>
      <p className="text-stone-500 text-xs md:text-sm max-w-xs mx-auto">The sacred day is fading into the mist. Travel through the unknown to restore the light of the Emerald Isle and save St. Patrick's Day.</p>
                    </div>
                    <button 
                      onClick={startRun}
                      className="px-8 md:px-12 py-3 md:py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-green-900/40 flex items-center gap-3 text-sm md:text-base"
                    >
                      START NEW RUN <ChevronRight className="w-4 h-4 md:w-5 h-5" />
                    </button>
                  </motion.div>
                )}

                {state.phase === "SELECT_EVENT" && state.gameMap && (
                  <motion.div 
                    key="select"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4 md:space-y-6 h-full flex flex-col"
                  >
                    <div className="flex items-center justify-between shrink-0">
                      <h2 className="text-lg md:text-xl font-bold">Choose your path</h2>
                      <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest">Node {state.runProgress + 1} / 6</span>
                    </div>

                    {/* Map Visualization */}
                    <div className="flex flex-col justify-start gap-8 md:gap-16 relative py-2 md:py-4">
                      {/* Current Layer Nodes */}
                      <div className="flex justify-around items-start gap-2 md:gap-4 relative z-10">
                        {(state.runProgress === 0 
                          ? state.gameMap.layers[0] 
                          : state.gameMap.layers[state.runProgress].filter(n => {
                              const prevNode = state.gameMap!.layers.flat().find(pn => pn.id === state.currentMapNodeId);
                              return prevNode?.nextNodes.includes(n.id);
                            })
                        ).map((node, idx, arr) => (
                          <motion.button
                            key={node.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => selectEvent(node)}
                            className={`flex-1 group relative bg-stone-800 border p-3 md:p-6 rounded-xl md:rounded-2xl text-left transition-all hover:border-green-500 hover:bg-stone-700 md:hover:-translate-y-1 shadow-lg ${node.isHighCorruption ? 'border-purple-500/50 shadow-purple-900/10' : 'border-stone-700'}`}
                          >
                            {node.isHighCorruption && (
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-purple-600 text-[6px] md:text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter whitespace-nowrap z-20 shadow-lg border border-purple-400">
                                High Corruption Card
                              </div>
                            )}
                            <div className="absolute top-2 right-2 md:top-4 md:right-4 opacity-20 group-hover:opacity-100 transition-opacity">
                              {node.event.requiresDice ? <Dice5 className="w-3 h-3 md:w-4 h-4 text-blue-400" /> : <Info className="w-3 h-3 md:w-4 h-4 text-stone-400" />}
                            </div>
                            <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">{node.event.type}</p>
                            <h3 className="font-bold text-xs md:text-lg mb-1 group-hover:text-green-400 transition-colors truncate md:whitespace-normal">{node.event.title}</h3>
                            <p className="hidden md:block text-[10px] md:text-xs text-stone-400 leading-relaxed line-clamp-2">{node.event.description}</p>
                          </motion.button>
                        ))}
                      </div>

                      {/* SVG Lines */}
                      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                        <svg className="w-full h-full" preserveAspectRatio="none">
                          {(() => {
                            const currentVisibleNodes = (state.runProgress === 0 
                              ? state.gameMap!.layers[0] 
                              : state.gameMap!.layers[state.runProgress].filter(n => {
                                  const prevNode = state.gameMap!.layers.flat().find(pn => pn.id === state.currentMapNodeId);
                                  return prevNode?.nextNodes.includes(n.id);
                                })
                            );
                            
                            const nextVisibleNodes = state.gameMap!.layers[state.runProgress + 1] ? state.gameMap!.layers[state.runProgress + 1]
                              .filter(node => currentVisibleNodes.some(cvn => cvn.nextNodes.includes(node.id))) : [];

                            return currentVisibleNodes.map((currentNode, curIdx) => {
                              const startX = `${((curIdx + 0.5) / currentVisibleNodes.length) * 100}%`;
                              const startY = "25%"; 
                              
                              return currentNode.nextNodes.map((nextNodeId) => {
                                const nextNodeIdx = nextVisibleNodes.findIndex(n => n.id === nextNodeId);
                                if (nextNodeIdx === -1) return null;
                                
                                const endX = `${((nextNodeIdx + 0.5) / nextVisibleNodes.length) * 100}%`;
                                const endY = "75%";
                                
                                return (
                                  <motion.line 
                                    key={`${currentNode.id}-${nextNodeId}`}
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    x1={startX} y1={startY}
                                    x2={endX} y2={endY}
                                    stroke="currentColor"
                                    className="text-green-500/40"
                                    strokeWidth="3"
                                    strokeDasharray="6 4"
                                  />
                                );
                              });
                            });
                          })()}
                        </svg>
                      </div>

                      {/* Next Layer Nodes (Preview) */}
                      <div className="flex justify-around items-start gap-2 md:gap-4 shrink-0 relative z-10">
                        {state.gameMap.layers[state.runProgress + 1] ? state.gameMap.layers[state.runProgress + 1]
                          .filter(node => {
                            const currentVisibleNodes = (state.runProgress === 0 
                              ? state.gameMap!.layers[0] 
                              : state.gameMap!.layers[state.runProgress].filter(n => {
                                  const prevNode = state.gameMap!.layers.flat().find(pn => pn.id === state.currentMapNodeId);
                                  return prevNode?.nextNodes.includes(n.id);
                                })
                            );
                            return currentVisibleNodes.some(cvn => cvn.nextNodes.includes(node.id));
                          })
                          .map((node) => (
                          <div
                            key={node.id}
                            className={`flex-1 bg-stone-800 border p-2.5 md:p-4 rounded-xl text-center shadow-lg backdrop-blur-sm opacity-60 relative ${node.isHighCorruption ? 'border-purple-500/30' : 'border-stone-700/50'}`}
                          >
                            {node.isHighCorruption && (
                              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-purple-900/80 text-[5px] md:text-[7px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter whitespace-nowrap border border-purple-500/30">
                                High Corruption
                              </div>
                            )}
                            <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">{node.event.type}</p>
                            <h4 className="text-[10px] md:text-sm font-bold text-stone-300 truncate">{node.event.title}</h4>
                          </div>
                        )) : (
                          <div className="w-full py-6 text-center">
                            <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">End of the path</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {state.phase === "RESOLVE_EVENT" && state.currentEvent && (
                  <motion.div 
                    key="resolve"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-stone-800 border border-stone-700 p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl max-w-lg mx-auto text-center space-y-4 md:space-y-6"
                  >
                    <div className="space-y-1 md:space-y-2">
                      <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-green-500">{state.currentEvent.type}</p>
                      <h2 className="text-2xl md:text-3xl font-black">{state.currentEvent.title}</h2>
                    </div>
                    
                    <p className="text-xs md:text-sm text-stone-400 leading-relaxed">{state.currentEvent.description}</p>

                    {state.currentEvent.choices ? (
                      <div className="grid grid-cols-1 gap-2 md:gap-3 pt-2 md:pt-4">
                        {state.currentEvent.choices.map((choice, i) => (
                          <button
                            key={i}
                            onClick={() => handleChoice(choice.effect)}
                            className="p-3 md:p-4 bg-stone-900 border border-stone-700 rounded-xl text-xs md:text-sm font-medium hover:border-green-500 hover:bg-stone-800 transition-all text-left"
                          >
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={resolveSimpleEvent}
                        className="w-full py-3 md:py-4 bg-stone-900 border border-stone-700 rounded-xl text-sm font-bold hover:border-green-500 transition-all"
                      >
                        CONTINUE
                      </button>
                    )}
                  </motion.div>
                )}

                {(state.phase === "ROLL_DICE" || state.phase === "BOSS_ENCOUNTER") && (
                  <motion.div 
                    key="dice"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4 md:space-y-8"
                  >
                    <div className="text-center space-y-1 md:space-y-2">
                      <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
                        {state.phase === "BOSS_ENCOUNTER" ? `BOSS ROUND ${state.bossRounds + 1}` : "DICE CHALLENGE"}
                      </h2>
                      <p className="text-stone-500 text-[10px] md:text-sm italic">{state.currentEvent?.title || "The Final Showdown"}</p>
                    </div>

                    <div className="flex flex-col items-center gap-4 md:gap-8">
                      {state.rollResults.length === 0 ? (
                        <button 
                          onClick={handleRoll}
                          className="group relative w-24 h-24 md:w-32 md:h-32 bg-stone-800 border-4 border-dashed border-stone-700 rounded-2xl md:rounded-3xl flex items-center justify-center hover:border-blue-500 transition-all"
                        >
                          <Dice5 className="w-8 h-8 md:w-12 md:h-12 text-stone-600 group-hover:text-blue-500 transition-colors" />
                          <span className="absolute -bottom-6 text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-stone-500">Roll Dice</span>
                        </button>
                      ) : (
                        <div className="space-y-4 md:space-y-8 w-full">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
                            {state.rollResults.map((face, i) => (
                              <div key={i} className="relative group/dice">
                                <button
                                  onClick={() => toggleDiceSelection(i)}
                                  className={`
                                    w-full h-20 md:h-24 rounded-xl md:rounded-2xl flex flex-col items-center justify-center gap-1 md:gap-2 transition-all border-2
                                    ${state.selectedDiceIndices.includes(i) 
                                      ? 'bg-blue-500/20 border-blue-500 scale-105 shadow-lg shadow-blue-500/20' 
                                      : 'bg-stone-800 border-stone-700 hover:border-stone-500'}
                                  `}
                                >
                                  {React.cloneElement(diceIcon(face) as React.ReactElement, { className: 'w-5 h-5 md:w-6 md:h-6' })}
                                  <span className="text-[8px] md:text-[10px] font-mono font-bold">{face}</span>
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTooltip({ id: face, title: "Dice Effect", description: DICE_DESCRIPTIONS[face] });
                                  }}
                                  className="absolute top-1 right-1 p-1 bg-stone-900/80 rounded-full opacity-0 group-hover/dice:opacity-100 transition-opacity"
                                >
                                  <Info className="w-3 h-3 text-stone-500" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center">
                            <button
                              disabled={state.selectedDiceIndices.length !== 2}
                              onClick={resolveDice}
                              className={`
                                px-8 md:px-12 py-3 md:py-4 rounded-full text-sm md:text-base font-bold transition-all
                                ${state.selectedDiceIndices.length === 2 
                                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-900/40' 
                                  : 'bg-stone-800 text-stone-600 cursor-not-allowed'}
                              `}
                            >
                              RESOLVE DICE ({state.selectedDiceIndices.length}/2)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {state.phase === "TRAIT_SELECTION" && (
                  <motion.div 
                    key="traits"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6 md:space-y-8 text-center"
                  >
                    <div className="space-y-1 md:space-y-2">
                      <h2 className="text-3xl md:text-4xl font-black text-yellow-500">VICTORY!</h2>
                      <p className="text-xs md:text-sm text-stone-400">You survived the run. Choose a permanent trait to grow stronger.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                      {TRAITS.map(trait => (
                        <button
                          key={trait.id}
                          onClick={() => selectTrait(trait)}
                          className="bg-stone-800 border border-stone-700 p-4 md:p-6 rounded-xl md:rounded-2xl hover:border-yellow-500 transition-all group"
                        >
                          <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 mx-auto mb-2 md:mb-4 group-hover:scale-110 transition-transform" />
                          <h3 className="text-sm md:text-base font-bold mb-1 md:mb-2">{trait.name}</h3>
                          <p className="text-[10px] md:text-xs text-stone-400">{trait.description}</p>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {state.phase === "RUN_END" && (
                  <motion.div 
                    key="end"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-stone-800 border border-red-900/50 p-8 md:p-12 rounded-2xl md:rounded-3xl text-center space-y-6 md:space-y-8 max-w-md mx-auto"
                  >
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-red-900/20 rounded-full mx-auto flex items-center justify-center">
                      <Skull className="w-8 h-8 md:w-10 md:h-10 text-red-500" />
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <h2 className="text-2xl md:text-3xl font-black">RUN OVER</h2>
                      <p className="text-xs md:text-sm text-stone-400 leading-relaxed">The corruption was too much. You collected <span className="text-yellow-500 font-bold">{state.runGold} gold</span> this run.</p>
                    </div>
                    <button 
                      onClick={startRun}
                      className="w-full py-3 md:py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-900/20 text-sm md:text-base"
                    >
                      TRY AGAIN
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Info (Hidden on small mobile heights) */}
      <footer className="shrink-0 max-w-4xl mx-auto px-4 py-4 border-t border-stone-800 hidden sm:block">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-stone-500 text-[10px] uppercase tracking-widest font-bold">
          <p>© 2026 Saint Patrick's Roguelite Prototype</p>
          <div className="flex gap-6">
            <span className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full"></div> Stable Build</span>
            <span className="flex items-center gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> v0.1.0-alpha</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
