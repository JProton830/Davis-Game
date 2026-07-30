import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, initEngine, updateGame, updateCamera, render, getHexFromPixel, handleHexClick, getTotalArmor } from './engine';
import { Position, PlayerStats } from './types';
import { MiniMap } from './MiniMap';

const ITEM_META: Record<string, { name: string; icon: string }> = {
    Sword: { name: 'Sword', icon: '🗡️' },
    Axe: { name: 'Axe', icon: '🪓' },
    Pickaxe: { name: 'Pickaxe', icon: '⛏️' },
    Club: { name: 'Club', icon: '🏏' },
    Bow: { name: 'Bow', icon: '🏹' },
    meat: { name: 'Meat', icon: '🥩' },
    whale_meat: { name: 'Whale Meat', icon: '🐋' },
    dragon_meat: { name: 'Dragon Meat', icon: '🐉' },
    berries: { name: 'Berries', icon: '🫐' },
    grand_flower: { name: 'Flower', icon: '🌸' },
    boat: { name: 'Boat', icon: '🛶' },
    saddle: { name: 'Saddle', icon: '💺' },
    chitin: { name: 'Chitin', icon: '🦂' },
    metal_ingot: { name: 'Metal Ingot', icon: '🪙' },
    narcotics: { name: 'Narcotics', icon: '🧪' },
    tranq_arrows: { name: 'Tranq Arrows', icon: '🎯' },
    cooked_prime_meat: { name: 'Cooked Prime Meat', icon: '🥩' },
    cloth_cap: { name: 'Cloth Cap', icon: '🧢' },
    cloth_shirt: { name: 'Cloth Shirt', icon: '👕' },
    cloth_pants: { name: 'Cloth Pants', icon: '👖' },
    cloth_boots: { name: 'Cloth Boots', icon: '🥾' },
    leather_cap: { name: 'Leather Cap', icon: '🪖' },
    leather_chest: { name: 'Leather Chest', icon: '🦺' },
    leather_leggings: { name: 'Leather Leggings', icon: '👖' },
    leather_boots: { name: 'Leather Boots', icon: '👢' },
    chitin_helmet: { name: 'Chitin Helmet', icon: '🪖' },
    chitin_chest: { name: 'Chitin Chest', icon: '🛡️' },
    chitin_leggings: { name: 'Chitin Leggings', icon: '🦵' },
    chitin_boots: { name: 'Chitin Boots', icon: '🥾' },
    iron_helmet: { name: 'Iron Helmet', icon: '🪖' },
    iron_armor: { name: 'Iron Armor', icon: '🛡️' },
    iron_leggings: { name: 'Iron Leggings', icon: '🦵' },
    iron_boots: { name: 'Iron Boots', icon: '🥾' },
    Wall: { name: 'Wall', icon: '🧱' },
    Campfire: { name: 'Campfire', icon: '🔥' },
    CraftingTable: { name: 'Craft Table', icon: '🛠️' },
    Bed: { name: 'Bed', icon: '🛏️' },
    'Buy Iron Armor': { name: 'Iron Armor', icon: '🛡️' },
    'Buy Iron Sword': { name: 'Iron Sword', icon: '⚔️' },
    'Buy Eagle': { name: 'Eagle Pet', icon: '🦅' },
    'Buy Boat': { name: 'Buy Boat', icon: '🛶' },
    'Buy Saddle': { name: 'Buy Saddle', icon: '💺' },
    'Buy Wood': { name: 'Buy Wood', icon: '🪵' }
};

interface CostReq {
    label: string;
    icon: string;
    owned: number;
    needed: number;
}

interface CraftableCardProps {
    name: string;
    icon: string;
    costs: CostReq[];
    onClick: () => void;
    onAssign?: () => void;
    disabled?: boolean;
}

const CraftableCard = ({ name, icon, costs, onClick, onAssign, disabled }: CraftableCardProps) => {
    const canAfford = costs.every(c => c.owned >= c.needed);
    return (
        <div className={`flex flex-col bg-stone-900 border ${canAfford ? 'border-amber-600/60' : 'border-stone-800'} rounded p-2 text-xs relative group transition hover:border-amber-400`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xl">{icon}</span>
                <span className="font-bold text-stone-200 text-[11px] truncate">{name}</span>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] my-1">
                {costs.map((c, idx) => (
                    <span key={idx} className={c.owned >= c.needed ? 'text-emerald-400 font-semibold' : 'text-red-400'}>
                        {c.icon} {c.owned}/{c.needed}
                    </span>
                ))}
            </div>
            <div className="flex gap-1 mt-auto pt-1">
                <button
                    disabled={disabled || !canAfford}
                    onClick={onClick}
                    className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition ${
                        canAfford ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer' : 'bg-stone-800 text-stone-500 cursor-not-allowed'
                    }`}
                >
                    Craft
                </button>
                {onAssign && (
                    <button
                        onClick={onAssign}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-400 border border-stone-700 rounded text-[10px] font-bold cursor-pointer"
                        title="Assign to Hotbar"
                    >
                        +Bar
                    </button>
                )}
            </div>
        </div>
    );
};

export default function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<GameEngine | null>(null);
    const hoverHexRef = useRef<Position | null>(null);
    
    const [triggerRender, setTriggerRender] = useState(0); 
    const [activeItem, setActiveItem] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState<'inventory' | 'crafting' | 'map' | 'wiki' | 'character' | 'tutorial' | null>('tutorial');
    const [wikiTab, setWikiTab] = useState<'tools' | 'crafting' | 'animals' | 'taming' | 'armor' | 'raiders'>('tools');
    const [tutorialStep, setTutorialStep] = useState<number>(1);
    const [assigningItem, setAssigningItem] = useState<string | null>(null);
    
    useEffect(() => {
        engineRef.current = initEngine();
        
        let lastTime = performance.now();
        let frameId = 0;
        
        const loop = (time: number) => {
            const dt = time - lastTime;
            lastTime = time;
            
            if (engineRef.current) {
                updateGame(engineRef.current, dt, Date.now());
                updateCamera(engineRef.current, dt);
                
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                        const { width, height } = canvasRef.current.getBoundingClientRect();
                        canvasRef.current.width = width;
                        canvasRef.current.height = height;
                        render(ctx, engineRef.current, width, height, hoverHexRef.current);
                    }
                }
            }
            
            if (time % 100 < 20) {
                setTriggerRender(t => t + 1);
            }
            
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        
        return () => cancelAnimationFrame(frameId);
    }, []);

    // Keyboard Hotbar Shortcuts (1-9, 0)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!engineRef.current) return;
            const key = e.key;
            let slotIdx = -1;
            if (key >= '1' && key <= '9') slotIdx = parseInt(key) - 1;
            if (key === '0') slotIdx = 9;

            if (slotIdx >= 0 && slotIdx < 10) {
                const item = engineRef.current.stats.hotbar[slotIdx];
                if (item) {
                    if (item === activeItem) {
                        if (['meat', 'berries', 'grand_flower', 'whale_meat', 'dragon_meat'].includes(item)) {
                            handleConsume(item as any);
                        } else {
                            setActiveItem(null);
                        }
                    } else {
                        setActiveItem(item);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeItem]);
    
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!engineRef.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const hex = getHexFromPixel(engineRef.current, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        hoverHexRef.current = hex;
    };
    
    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!engineRef.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const hex = getHexFromPixel(engineRef.current, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        handleHexClick(engineRef.current, hex, activeItem);
        setTriggerRender(t => t + 1); 
    };

    const handleConsume = (type: 'meat' | 'berries' | 'grand_flower' | 'whale_meat' | 'dragon_meat' | 'cooked_prime_meat') => {
        if (!engineRef.current) return;
        let stats = engineRef.current.stats;
        if (stats.inventory[type] > 0) {
            stats.inventory[type]--;
            if (type === 'meat') {
                stats.hp = Math.min(stats.maxHp, stats.hp + 20);
                engineRef.current.log("Ate meat. Restored 20 HP.");
            } else if (type === 'berries') {
                stats.stamina = Math.min(stats.maxStamina, stats.stamina + 20);
                engineRef.current.log("Ate berries. Restored 20 Stamina.");
            } else if (type === 'grand_flower') {
                stats.stamina = Math.min(stats.maxStamina, stats.stamina + 50);
                engineRef.current.log("Ate flower. Restored 50 Stamina.");
            } else if (type === 'whale_meat') {
                stats.hp = Math.min(stats.maxHp, stats.hp + 50);
                stats.stamina = Math.min(stats.maxStamina, stats.stamina + 50);
                engineRef.current.log("Ate rich whale meat! Restored 50 HP & 50 Stamina.");
            } else if (type === 'dragon_meat') {
                stats.hp = Math.min(stats.maxHp, stats.hp + 75);
                stats.stamina = Math.min(stats.maxStamina, stats.stamina + 75);
                engineRef.current.log("Ate legendary dragon meat! Restored 75 HP & 75 Stamina.");
            } else if (type === 'cooked_prime_meat') {
                stats.hp = Math.min(stats.maxHp, stats.hp + 80);
                stats.stamina = Math.min(stats.maxStamina, stats.stamina + 80);
                engineRef.current.log("🦖 Ate Cooked Prime Meat! Restored 80 HP & 80 Stamina.");
            }
            setTriggerRender(t => t + 1);
        }
    };

    const handleDismount = () => {
        if (!engineRef.current) return;
        let stats = engineRef.current.stats;
        if (stats.riding) {
            stats.riding.pos = { ...engineRef.current.player.pos };
            engineRef.current.entities.push(stats.riding);
            stats.riding = null;
            engineRef.current.log("Dismounted.");
        }
        if (stats.inBoat) {
            stats.inBoat = false;
            engineRef.current.log("Left the boat.");
        }
        setTriggerRender(t => t + 1);
    };
    
    const dropItem = (key: keyof PlayerStats['inventory']) => {
        if (engineRef.current && engineRef.current.stats.inventory[key] > 0) {
            engineRef.current.stats.inventory[key]--;
            engineRef.current.log(`Dropped 1 ${String(key).replace('_', ' ')}.`);
            setTriggerRender(t => t + 1);
        }
    };

    const assignToHotbarSlot = (slotIdx: number) => {
        if (engineRef.current && assigningItem) {
            engineRef.current.stats.hotbar[slotIdx] = assigningItem;
            engineRef.current.log(`Assigned ${assigningItem} to Hotbar [${slotIdx + 1 === 10 ? 0 : slotIdx + 1}].`);
            setAssigningItem(null);
            setTriggerRender(t => t + 1);
        }
    };

    const clearHotbarSlot = (slotIdx: number) => {
        if (engineRef.current) {
            engineRef.current.stats.hotbar[slotIdx] = null;
            setTriggerRender(t => t + 1);
        }
    };
    
    const equipArmor = (slot: 'head' | 'chest' | 'legs' | 'feet', armorName: string) => {
        const eng = engineRef.current;
        if (!eng) return;
        const eq = eng.stats.equipment;
        const inv = eng.stats.inventory;

        let keyMap: Record<string, keyof PlayerStats['inventory']> = {
            'Cloth Cap': 'cloth_cap',
            'Leather Cap': 'leather_cap',
            'Chitin Helmet': 'chitin_helmet',
            'Iron Helmet': 'iron_helmet',
            'Cloth Shirt': 'cloth_shirt',
            'Leather Chest': 'leather_chest',
            'Chitin Chest': 'chitin_chest',
            'Iron Armor': 'iron_armor',
            'Cloth Pants': 'cloth_pants',
            'Leather Leggings': 'leather_leggings',
            'Chitin Leggings': 'chitin_leggings',
            'Iron Leggings': 'iron_leggings',
            'Cloth Boots': 'cloth_boots',
            'Leather Boots': 'leather_boots',
            'Chitin Boots': 'chitin_boots',
            'Iron Boots': 'iron_boots'
        };

        let key = keyMap[armorName];
        if (key && inv[key] > 0) {
            let currentEquipped = eq[slot];
            if (currentEquipped !== 'None') {
                let currentKey = keyMap[currentEquipped];
                if (currentKey) inv[currentKey]++;
            }

            inv[key]--;
            eq[slot] = armorName as any;
            eng.log(`🛡️ Equipped ${armorName}!`);
            setTriggerRender(t => t + 1);
        }
    };

    const unequipArmor = (slot: 'head' | 'chest' | 'legs' | 'feet') => {
        const eng = engineRef.current;
        if (!eng) return;
        const eq = eng.stats.equipment;
        const inv = eng.stats.inventory;

        let current = eq[slot];
        if (current !== 'None') {
            let keyMap: Record<string, keyof PlayerStats['inventory']> = {
                'Cloth Cap': 'cloth_cap',
                'Leather Cap': 'leather_cap',
                'Chitin Helmet': 'chitin_helmet',
                'Iron Helmet': 'iron_helmet',
                'Cloth Shirt': 'cloth_shirt',
                'Leather Chest': 'leather_chest',
                'Chitin Chest': 'chitin_chest',
                'Iron Armor': 'iron_armor',
                'Cloth Pants': 'cloth_pants',
                'Leather Leggings': 'leather_leggings',
                'Chitin Leggings': 'chitin_leggings',
                'Iron Leggings': 'iron_leggings',
                'Cloth Boots': 'cloth_boots',
                'Leather Boots': 'leather_boots',
                'Chitin Boots': 'chitin_boots',
                'Iron Boots': 'iron_boots'
            };

            let key = keyMap[current];
            if (key) inv[key]++;
            eq[slot] = 'None';
            eng.log(`Unequipped ${current}.`);
            setTriggerRender(t => t + 1);
        }
    };

    const craft = (item: string) => {
        const eng = engineRef.current;
        if (!eng) return;
        
        let nearTable = false;
        let pos = eng.player.pos;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (pos.r + dr >= 0 && pos.r + dr < eng.map.length && pos.c + dc >= 0 && pos.c + dc < eng.map[0].length) {
                    let tile = eng.map[pos.r + dr][pos.c + dc];
                    if (tile === 'CraftingTable') nearTable = true;
                }
            }
        }
        
        const needsTable = item.includes('Stone') || item.includes('Gold') || item.includes('Iron') || item.includes('Chitin') || item.includes('Metal') || item === 'Bow' || item === 'Boat' || item === 'Saddle';
        if (needsTable && !nearTable) {
            eng.log(`You need to be near a Crafting Table to craft ${item}.`);
            return;
        }

        let success = false;
        let i = eng.stats.inventory;
        let eq = eng.stats.equipment;
        
        if (item === 'Wood Axe' && i.wood >= 5 && eq.axeLevel < 1) {
            i.wood -= 5; eq.axeLevel = 1; success = true;
        } else if (item === 'Stone Axe' && i.wood >= 5 && i.stone >= 5 && eq.axeLevel < 2) {
            i.wood -= 5; i.stone -= 5; eq.axeLevel = 2; success = true;
        } else if (item === 'Gold Axe' && i.wood >= 5 && i.gold >= 5 && eq.axeLevel < 3) {
            i.wood -= 5; i.gold -= 5; eq.axeLevel = 3; success = true;
        } else if (item === 'Wood Pickaxe' && i.wood >= 5 && eq.pickaxeLevel < 1) {
            i.wood -= 5; eq.pickaxeLevel = 1; success = true;
        } else if (item === 'Stone Pickaxe' && i.wood >= 5 && i.stone >= 10 && eq.pickaxeLevel < 2) {
            i.wood -= 5; i.stone -= 10; eq.pickaxeLevel = 2; success = true;
        } else if (item === 'Gold Pickaxe' && i.wood >= 5 && i.gold >= 10 && eq.pickaxeLevel < 3) {
            i.wood -= 5; i.gold -= 10; eq.pickaxeLevel = 3; success = true;
        } else if (item === 'Wood Sword' && i.wood >= 5 && eq.swordLevel < 1) {
            i.wood -= 5; eq.swordLevel = 1; success = true;
        } else if (item === 'Stone Sword' && i.wood >= 5 && i.stone >= 5 && eq.swordLevel < 2) {
            i.wood -= 5; i.stone -= 5; eq.swordLevel = 2; success = true;
        } else if (item === 'Gold Sword' && i.wood >= 5 && i.gold >= 5 && eq.swordLevel < 3) {
            i.wood -= 5; i.gold -= 5; eq.swordLevel = 3; success = true;
        } else if (item === 'Wood Club' && i.wood >= 8 && eq.clubLevel < 1) {
            i.wood -= 8; eq.clubLevel = 1; success = true;
        } else if (item === 'Stone Club' && i.wood >= 5 && i.stone >= 8 && eq.clubLevel < 2) {
            i.wood -= 5; i.stone -= 8; eq.clubLevel = 2; success = true;
        } else if (item === 'Gold Club' && i.wood >= 5 && i.gold >= 8 && eq.clubLevel < 3) {
            i.wood -= 5; i.gold -= 8; eq.clubLevel = 3; success = true;
        } else if (item === 'Bow' && i.wood >= 10 && i.gold >= 2 && !eq.bow) {
            i.wood -= 10; i.gold -= 2; eq.bow = true; success = true;
        } else if (item === 'Arrows' && i.wood >= 5 && i.stone >= 1) {
            i.wood -= 5; i.stone -= 1; i.arrows += 5; success = true;
        } else if (item === 'Boat' && i.wood >= 20) {
            i.wood -= 20; i.boat++; success = true;
        } else if (item === 'Saddle' && i.leather >= 5) {
            i.leather -= 5; i.saddle++; success = true;
        } else if (item === 'Narcotics' && i.berries >= 3 && i.meat >= 1) {
            i.berries -= 3; i.meat -= 1; i.narcotics++; success = true;
        } else if (item === 'Tranq Arrows' && i.arrows >= 1 && i.narcotics >= 1) {
            i.arrows -= 1; i.narcotics -= 1; i.tranq_arrows++; success = true;
        } else if (item === 'Metal Ingot' && i.iron >= 3) {
            i.iron -= 3; i.metal_ingot++; success = true;
        } else if (item === 'Metal Sword' && i.metal_ingot >= 4 && i.chitin >= 2 && eq.swordLevel < 4) {
            i.metal_ingot -= 4; i.chitin -= 2; eq.swordLevel = 4; success = true;
        } else if (item === 'Cloth Cap' && i.berries >= 2 && i.wood >= 2) {
            i.berries -= 2; i.wood -= 2;
            if (eq.head === 'None') eq.head = 'Cloth Cap'; else i.cloth_cap++;
            success = true;
        } else if (item === 'Leather Cap' && i.leather >= 3) {
            i.leather -= 3;
            if (eq.head === 'None') eq.head = 'Leather Cap'; else i.leather_cap++;
            success = true;
        } else if (item === 'Chitin Helmet' && i.chitin >= 4 && i.leather >= 2) {
            i.chitin -= 4; i.leather -= 2;
            if (eq.head === 'None') eq.head = 'Chitin Helmet'; else i.chitin_helmet++;
            success = true;
        } else if (item === 'Iron Helmet' && i.metal_ingot >= 4 && i.leather >= 2) {
            i.metal_ingot -= 4; i.leather -= 2;
            if (eq.head === 'None') eq.head = 'Iron Helmet'; else i.iron_helmet++;
            success = true;
        } else if (item === 'Cloth Shirt' && i.berries >= 4 && i.wood >= 4) {
            i.berries -= 4; i.wood -= 4;
            if (eq.chest === 'None') eq.chest = 'Cloth Shirt'; else i.cloth_shirt++;
            success = true;
        } else if (item === 'Leather Chest' && i.leather >= 6 && i.wood >= 2) {
            i.leather -= 6; i.wood -= 2;
            if (eq.chest === 'None') eq.chest = 'Leather Chest'; else i.leather_chest++;
            success = true;
        } else if (item === 'Chitin Chest' && i.chitin >= 8 && i.leather >= 4) {
            i.chitin -= 8; i.leather -= 4;
            if (eq.chest === 'None') eq.chest = 'Chitin Chest'; else i.chitin_chest++;
            success = true;
        } else if (item === 'Iron Armor' && i.metal_ingot >= 8 && i.leather >= 4) {
            i.metal_ingot -= 8; i.leather -= 4;
            if (eq.chest === 'None') eq.chest = 'Iron Armor'; else i.iron_armor++;
            success = true;
        } else if (item === 'Cloth Pants' && i.berries >= 3 && i.wood >= 3) {
            i.berries -= 3; i.wood -= 3;
            if (eq.legs === 'None') eq.legs = 'Cloth Pants'; else i.cloth_pants++;
            success = true;
        } else if (item === 'Leather Leggings' && i.leather >= 5) {
            i.leather -= 5;
            if (eq.legs === 'None') eq.legs = 'Leather Leggings'; else i.leather_leggings++;
            success = true;
        } else if (item === 'Chitin Leggings' && i.chitin >= 6 && i.leather >= 3) {
            i.chitin -= 6; i.leather -= 3;
            if (eq.legs === 'None') eq.legs = 'Chitin Leggings'; else i.chitin_leggings++;
            success = true;
        } else if (item === 'Iron Leggings' && i.metal_ingot >= 6 && i.leather >= 3) {
            i.metal_ingot -= 6; i.leather -= 3;
            if (eq.legs === 'None') eq.legs = 'Iron Leggings'; else i.iron_leggings++;
            success = true;
        } else if (item === 'Cloth Boots' && i.berries >= 2 && i.wood >= 2) {
            i.berries -= 2; i.wood -= 2;
            if (eq.feet === 'None') eq.feet = 'Cloth Boots'; else i.cloth_boots++;
            success = true;
        } else if (item === 'Leather Boots' && i.leather >= 3) {
            i.leather -= 3;
            if (eq.feet === 'None') eq.feet = 'Leather Boots'; else i.leather_boots++;
            success = true;
        } else if (item === 'Chitin Boots' && i.chitin >= 4 && i.leather >= 2) {
            i.chitin -= 4; i.leather -= 2;
            if (eq.feet === 'None') eq.feet = 'Chitin Boots'; else i.chitin_boots++;
            success = true;
        } else if (item === 'Iron Boots' && i.metal_ingot >= 4 && i.leather >= 2) {
            i.metal_ingot -= 4; i.leather -= 2;
            if (eq.feet === 'None') eq.feet = 'Iron Boots'; else i.iron_boots++;
            success = true;
        }
        
        if (success) {
            eng.log(`Crafted ${item}!`);
            setTriggerRender(t => t + 1);
        } else {
            eng.log(`Cannot craft ${item}. Check requirements!`);
        }
    };
    
    const engine = engineRef.current;
    
    return (
        <div className="flex flex-col h-screen bg-stone-950 text-stone-200 overflow-hidden font-sans select-none">
            {engine && (
                <header className="p-3 md:p-4 bg-stone-900/90 border-b border-stone-800 flex justify-between items-center z-10 shadow-lg shrink-0 backdrop-blur">
                    <div className="flex gap-4 md:gap-6 items-center">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Health</span>
                            <div className="flex items-center gap-2 w-28 md:w-36">
                                <div className="h-3.5 w-full bg-stone-800 rounded overflow-hidden border border-stone-700">
                                    <div className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300" style={{width: `${Math.max(0, engine.stats.hp/engine.stats.maxHp*100)}%`}}></div>
                                </div>
                                <span className="text-xs font-black text-red-400">{Math.floor(engine.stats.hp)}</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Stamina</span>
                            <div className="flex items-center gap-2 w-24 md:w-32">
                                <div className="h-3.5 w-full bg-stone-800 rounded overflow-hidden border border-stone-700">
                                    <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300" style={{width: `${Math.max(0, engine.stats.stamina/engine.stats.maxStamina*100)}%`}}></div>
                                </div>
                                <span className="text-xs font-black text-emerald-400">{Math.floor(engine.stats.stamina)}</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Time & Status</span>
                            <div className="flex items-center gap-2 text-xs font-black">
                                <span className={engine.timeOfDay < 120 ? 'text-amber-400' : 'text-purple-400'}>
                                    {engine.timeOfDay < 120 ? '☀️ Day' : '🌙 Night'} {engine.dayCount}
                                </span>
                                {engine.isKing && (
                                    <span className="px-2 py-0.5 bg-amber-500 text-stone-950 rounded text-[10px] font-black uppercase tracking-wider animate-pulse">
                                        👑 KING
                                    </span>
                                )}
                            </div>
                        </div>
                        {(() => {
                            let raidRemainingSec = Math.max(0, Math.ceil((300000 - (Date.now() - engine.lastRaidTime)) / 1000));
                            let raidMin = Math.floor(raidRemainingSec / 60);
                            let raidSec = raidRemainingSec % 60;
                            let raidTimerStr = `${raidMin}:${raidSec < 10 ? '0' : ''}${raidSec}`;
                            return (
                                <div className="flex flex-col border-l border-stone-800 pl-3 md:pl-4">
                                    <span className="text-[10px] text-red-400 uppercase tracking-widest font-bold flex items-center gap-1">
                                        ⚔️ Next Raid
                                    </span>
                                    <span className={`text-xs font-black font-mono ${raidRemainingSec <= 30 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
                                        {raidTimerStr}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                    
                    <div className="flex gap-2 md:gap-3 items-center">
                        {(engine.stats.riding || engine.stats.inBoat) && (
                            <button
                                onClick={handleDismount}
                                className="px-3 py-1.5 border rounded text-xs font-black uppercase tracking-wider transition bg-red-900/80 border-red-500 text-red-200 hover:bg-red-800 cursor-pointer shadow"
                            >
                                🛑 Dismount
                            </button>
                        )}
                        <button 
                            onClick={() => setShowMenu(showMenu === 'tutorial' ? null : 'tutorial')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'tutorial' ? 'bg-amber-500 border-amber-300 text-stone-950 font-black shadow-lg animate-pulse' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            🎓 Tutorial
                        </button>
                        <button 
                            onClick={() => setShowMenu(showMenu === 'character' ? null : 'character')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'character' ? 'bg-cyan-600 border-cyan-400 text-stone-950 font-black shadow-lg' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            👤 Survivor
                        </button>
                        <button 
                            onClick={() => setShowMenu(showMenu === 'inventory' ? null : 'inventory')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'inventory' ? 'bg-amber-600 border-amber-400 text-stone-950 font-black shadow-lg' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            🎒 Survival Inv
                        </button>
                        <button 
                            onClick={() => setShowMenu(showMenu === 'crafting' ? null : 'crafting')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'crafting' ? 'bg-blue-600 border-blue-400 text-stone-950 font-black shadow-lg' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            ⚒️ Engrams
                        </button>
                        <button 
                            onClick={() => setShowMenu(showMenu === 'map' ? null : 'map')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'map' ? 'bg-emerald-600 border-emerald-400 text-stone-950 font-black shadow-lg' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            🗺️ Map
                        </button>
                        <button 
                            onClick={() => setShowMenu(showMenu === 'wiki' ? null : 'wiki')}
                            className={`px-3 py-1.5 border rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition ${showMenu === 'wiki' ? 'bg-purple-600 border-purple-400 text-stone-950 font-black shadow-lg' : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'}`}
                        >
                            📖 Wiki
                        </button>
                    </div>
                </header>
            )}
            
            <div className="flex-1 relative">
                <canvas 
                    ref={canvasRef}
                    onMouseMove={handleMouseMove}
                    onClick={handleClick}
                    className={`absolute inset-0 w-full h-full ${activeItem ? 'cursor-crosshair' : 'cursor-pointer'}`}
                />
                
                {/* ARK SURVIVAL INVENTORY & ENGRAM OVERLAY */}
                {showMenu === 'inventory' && engine && (
                    <div className="absolute inset-4 md:inset-8 bg-stone-950/95 border border-amber-600/60 rounded-lg p-5 shadow-2xl backdrop-blur-md flex flex-col gap-4 z-30 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-amber-600/40 pb-3">
                            <h2 className="text-amber-500 uppercase tracking-widest text-sm font-black flex items-center gap-2">
                                <span>🎒</span> ARK SURVIVAL INVENTORY & HOTBAR MANAGEMENT
                            </h2>
                            <button onClick={() => setShowMenu(null)} className="text-stone-400 hover:text-white font-bold text-lg px-2 cursor-pointer">✕</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-y-auto pr-1">
                            {/* LEFT: RESOURCES & CONSUMABLES */}
                            <div className="flex flex-col gap-3 bg-stone-900/60 p-4 border border-stone-800 rounded">
                                <h3 className="text-stone-300 uppercase tracking-wider text-xs font-bold border-b border-stone-800 pb-2">
                                    Resources & Items
                                </h3>
                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    {Object.entries(engine.stats.inventory).map(([k, v]) => {
                                        const itemKey = k as keyof PlayerStats['inventory'];
                                        const meta = ITEM_META[k] || { name: k.replace('_', ' '), icon: '📦' };
                                        const isEdible = ['meat', 'berries', 'grand_flower', 'whale_meat', 'dragon_meat', 'cooked_prime_meat'].includes(k);
                                        return (
                                            <div key={k} className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{meta.icon}</span>
                                                    <span className="font-bold capitalize text-stone-200">{meta.name}:</span>
                                                    <span className="font-black text-amber-400">{v as number}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {isEdible && (v as number) > 0 && (
                                                        <button
                                                            onClick={() => handleConsume(k as any)}
                                                            className="px-2 py-1 bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-600 text-emerald-200 text-[10px] font-bold rounded cursor-pointer"
                                                        >
                                                            Eat
                                                        </button>
                                                    )}
                                                    {(v as number) > 0 && (
                                                        <button
                                                            onClick={() => setAssigningItem(k)}
                                                            className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer"
                                                        >
                                                            +Bar
                                                        </button>
                                                    )}
                                                    {(v as number) > 0 && (
                                                        <button
                                                            onClick={() => dropItem(itemKey)}
                                                            className="px-2 py-1 bg-stone-700 hover:bg-red-900 text-stone-300 hover:text-red-200 text-[10px] font-bold rounded cursor-pointer"
                                                            title="Drop 1"
                                                        >
                                                            ✖
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* MIDDLE: WEAPONS & EQUIPMENT */}
                            <div className="flex flex-col gap-3 bg-stone-900/60 p-4 border border-stone-800 rounded">
                                <h3 className="text-stone-300 uppercase tracking-wider text-xs font-bold border-b border-stone-800 pb-2">
                                    Weapons & Tools
                                </h3>
                                <div className="flex flex-col gap-2 text-xs">
                                    {engine.stats.equipment.swordLevel > 0 && (
                                        <div className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-stone-200">🗡️ Sword (Lvl {engine.stats.equipment.swordLevel})</span>
                                            <button onClick={() => setAssigningItem('Sword')} className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer">+Bar</button>
                                        </div>
                                    )}
                                    {engine.stats.equipment.axeLevel > 0 && (
                                        <div className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-stone-200">🪓 Axe (Lvl {engine.stats.equipment.axeLevel})</span>
                                            <button onClick={() => setAssigningItem('Axe')} className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer">+Bar</button>
                                        </div>
                                    )}
                                    {engine.stats.equipment.pickaxeLevel > 0 && (
                                        <div className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-stone-200">⛏️ Pickaxe (Lvl {engine.stats.equipment.pickaxeLevel})</span>
                                            <button onClick={() => setAssigningItem('Pickaxe')} className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer">+Bar</button>
                                        </div>
                                    )}
                                    {engine.stats.equipment.clubLevel > 0 && (
                                        <div className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-stone-200">🏏 Club (Lvl {engine.stats.equipment.clubLevel})</span>
                                            <button onClick={() => setAssigningItem('Club')} className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer">+Bar</button>
                                        </div>
                                    )}
                                    {engine.stats.equipment.bow && (
                                        <div className="flex items-center justify-between bg-stone-800/80 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-stone-200">🏹 Bow</span>
                                            <button onClick={() => setAssigningItem('Bow')} className="px-2 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-600 text-amber-200 text-[10px] font-bold rounded cursor-pointer">+Bar</button>
                                        </div>
                                    )}
                                </div>

                                <h3 className="text-stone-300 uppercase tracking-wider text-xs font-bold border-b border-stone-800 pb-2 mt-4">
                                    Tamed Pets
                                </h3>
                                <div className="flex flex-col gap-2 text-xs">
                                    {engine.stats.pets.length === 0 && <div className="text-stone-500 italic">No pets tamed yet.</div>}
                                    {engine.stats.pets.map((p, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-stone-800 p-2 rounded">
                                            <span>{p.type === 'deer' ? '🦌' : p.type === 'bear' ? '🐻' : '🐺'} {p.type} (HP: {Math.floor(p.hp)})</span>
                                            <button 
                                                onClick={() => { setActiveItem(`drop_pet_${idx}`); setShowMenu(null); }}
                                                className="bg-stone-700 hover:bg-stone-600 px-2 py-1 rounded cursor-pointer text-[10px] font-bold"
                                            >Place</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* RIGHT: BUILDABLES WITH REALTIME COSTS & OWNED COUNTS */}
                            <div className="flex flex-col gap-3 bg-stone-900/60 p-4 border border-stone-800 rounded">
                                <h3 className="text-stone-300 uppercase tracking-wider text-xs font-bold border-b border-stone-800 pb-2">
                                    Buildables & Structures
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    <CraftableCard
                                        name="Wall"
                                        icon="🧱"
                                        costs={[
                                            { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 2 },
                                            { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 2 }
                                        ]}
                                        onClick={() => { setActiveItem('Wall'); setShowMenu(null); }}
                                        onAssign={() => setAssigningItem('Wall')}
                                    />
                                    <CraftableCard
                                        name="Campfire"
                                        icon="🔥"
                                        costs={[
                                            { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 },
                                            { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 5 }
                                        ]}
                                        onClick={() => { setActiveItem('Campfire'); setShowMenu(null); }}
                                        onAssign={() => setAssigningItem('Campfire')}
                                    />
                                    <CraftableCard
                                        name="Crafting Table"
                                        icon="🛠️"
                                        costs={[
                                            { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 10 },
                                            { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 5 }
                                        ]}
                                        onClick={() => { setActiveItem('CraftingTable'); setShowMenu(null); }}
                                        onAssign={() => setAssigningItem('CraftingTable')}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* ENGRAMS / CRAFTING MENU OVERLAY */}
                {showMenu === 'crafting' && engine && (
                    <div className="absolute inset-4 md:inset-8 bg-stone-950/95 border border-blue-600/60 rounded-lg p-5 shadow-2xl backdrop-blur-md flex flex-col gap-4 z-30 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-blue-600/40 pb-3">
                            <h2 className="text-blue-400 uppercase tracking-widest text-sm font-black flex items-center gap-2">
                                <span>⚒️</span> ENGRAM CRAFTING BENCH
                            </h2>
                            <button onClick={() => setShowMenu(null)} className="text-stone-400 hover:text-white font-bold text-lg px-2 cursor-pointer">✕</button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 flex-1 overflow-y-auto pr-1">
                            {/* AXES */}
                            {engine.stats.equipment.axeLevel < 1 && (
                                <CraftableCard name="Wood Axe" icon="🪓" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }]} onClick={() => craft('Wood Axe')} />
                            )}
                            {engine.stats.equipment.axeLevel === 1 && (
                                <CraftableCard name="Stone Axe" icon="🪓" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 5 }]} onClick={() => craft('Stone Axe')} />
                            )}
                            {engine.stats.equipment.axeLevel === 2 && (
                                <CraftableCard name="Gold Axe" icon="🪓" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Gold', icon: '✨', owned: engine.stats.inventory.gold, needed: 5 }]} onClick={() => craft('Gold Axe')} />
                            )}

                            {/* PICKS */}
                            {engine.stats.equipment.pickaxeLevel < 1 && (
                                <CraftableCard name="Wood Pick" icon="⛏️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }]} onClick={() => craft('Wood Pickaxe')} />
                            )}
                            {engine.stats.equipment.pickaxeLevel === 1 && (
                                <CraftableCard name="Stone Pick" icon="⛏️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 10 }]} onClick={() => craft('Stone Pickaxe')} />
                            )}
                            {engine.stats.equipment.pickaxeLevel === 2 && (
                                <CraftableCard name="Gold Pick" icon="⛏️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Gold', icon: '✨', owned: engine.stats.inventory.gold, needed: 10 }]} onClick={() => craft('Gold Pickaxe')} />
                            )}

                            {/* SWORDS */}
                            {engine.stats.equipment.swordLevel < 1 && (
                                <CraftableCard name="Wood Sword" icon="🗡️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }]} onClick={() => craft('Wood Sword')} />
                            )}
                            {engine.stats.equipment.swordLevel === 1 && (
                                <CraftableCard name="Stone Sword" icon="🗡️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 5 }]} onClick={() => craft('Stone Sword')} />
                            )}
                            {engine.stats.equipment.swordLevel === 2 && (
                                <CraftableCard name="Gold Sword" icon="🗡️" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Gold', icon: '✨', owned: engine.stats.inventory.gold, needed: 5 }]} onClick={() => craft('Gold Sword')} />
                            )}

                            {/* CLUBS */}
                            {engine.stats.equipment.clubLevel < 1 && (
                                <CraftableCard name="Wood Club" icon="🏏" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 8 }]} onClick={() => craft('Wood Club')} />
                            )}
                            {engine.stats.equipment.clubLevel === 1 && (
                                <CraftableCard name="Stone Club" icon="🏏" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 8 }]} onClick={() => craft('Stone Club')} />
                            )}
                            {engine.stats.equipment.clubLevel === 2 && (
                                <CraftableCard name="Gold Club" icon="🏏" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Gold', icon: '✨', owned: engine.stats.inventory.gold, needed: 8 }]} onClick={() => craft('Gold Club')} />
                            )}

                            {/* BOW & ARROWS */}
                            {!engine.stats.equipment.bow && (
                                <CraftableCard name="Bow" icon="🏹" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 10 }, { label: 'Gold', icon: '✨', owned: engine.stats.inventory.gold, needed: 2 }]} onClick={() => craft('Bow')} />
                            )}
                            <CraftableCard name="Arrows (x5)" icon="🏹" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 5 }, { label: 'Stone', icon: '🪨', owned: engine.stats.inventory.stone, needed: 1 }]} onClick={() => craft('Arrows')} />

                            {/* BOATS & SADDLE */}
                            <CraftableCard name="Boat" icon="🛶" costs={[{ label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 20 }]} onClick={() => craft('Boat')} onAssign={() => setAssigningItem('boat')} />
                            <CraftableCard name="Saddle" icon="💺" costs={[{ label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 5 }]} onClick={() => craft('Saddle')} onAssign={() => setAssigningItem('saddle')} />

                            {/* ARK SURVIVAL TECH */}
                            <CraftableCard name="Narcotics" icon="🧪" costs={[{ label: 'Berries', icon: '🫐', owned: engine.stats.inventory.berries, needed: 3 }, { label: 'Meat', icon: '🥩', owned: engine.stats.inventory.meat, needed: 1 }]} onClick={() => craft('Narcotics')} />
                            <CraftableCard name="Tranq Arrows" icon="🎯" costs={[{ label: 'Arrows', icon: '🏹', owned: engine.stats.inventory.arrows, needed: 1 }, { label: 'Narcotics', icon: '🧪', owned: engine.stats.inventory.narcotics, needed: 1 }]} onClick={() => craft('Tranq Arrows')} onAssign={() => setAssigningItem('tranq_arrows')} />
                            <CraftableCard name="Metal Ingot" icon="🪙" costs={[{ label: 'Iron', icon: '⛓️', owned: engine.stats.inventory.iron, needed: 3 }]} onClick={() => craft('Metal Ingot')} />
                            {engine.stats.equipment.swordLevel < 4 && (
                                <CraftableCard name="Metal Sword" icon="⚔️" costs={[{ label: 'Metal Ingot', icon: '🪙', owned: engine.stats.inventory.metal_ingot, needed: 4 }, { label: 'Chitin', icon: '🦂', owned: engine.stats.inventory.chitin, needed: 2 }]} onClick={() => craft('Metal Sword')} />
                            )}

                            {/* CLOTH ARMOR */}
                            <CraftableCard name="Cloth Cap" icon="🧢" costs={[{ label: 'Berries', icon: '🫐', owned: engine.stats.inventory.berries, needed: 2 }, { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 2 }]} onClick={() => craft('Cloth Cap')} />
                            <CraftableCard name="Cloth Shirt" icon="👕" costs={[{ label: 'Berries', icon: '🫐', owned: engine.stats.inventory.berries, needed: 4 }, { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 4 }]} onClick={() => craft('Cloth Shirt')} />
                            <CraftableCard name="Cloth Pants" icon="👖" costs={[{ label: 'Berries', icon: '🫐', owned: engine.stats.inventory.berries, needed: 3 }, { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 3 }]} onClick={() => craft('Cloth Pants')} />
                            <CraftableCard name="Cloth Boots" icon="🥾" costs={[{ label: 'Berries', icon: '🫐', owned: engine.stats.inventory.berries, needed: 2 }, { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 2 }]} onClick={() => craft('Cloth Boots')} />

                            {/* LEATHER ARMOR */}
                            <CraftableCard name="Leather Cap" icon="🪖" costs={[{ label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 3 }]} onClick={() => craft('Leather Cap')} />
                            <CraftableCard name="Leather Chest" icon="🦺" costs={[{ label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 6 }, { label: 'Wood', icon: '🪵', owned: engine.stats.inventory.wood, needed: 2 }]} onClick={() => craft('Leather Chest')} />
                            <CraftableCard name="Leather Leggings" icon="👖" costs={[{ label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 5 }]} onClick={() => craft('Leather Leggings')} />
                            <CraftableCard name="Leather Boots" icon="👢" costs={[{ label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 3 }]} onClick={() => craft('Leather Boots')} />

                            {/* CHITIN ARMOR */}
                            <CraftableCard name="Chitin Helmet" icon="🪖" costs={[{ label: 'Chitin', icon: '🦂', owned: engine.stats.inventory.chitin, needed: 4 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 2 }]} onClick={() => craft('Chitin Helmet')} />
                            <CraftableCard name="Chitin Chest" icon="🛡️" costs={[{ label: 'Chitin', icon: '🦂', owned: engine.stats.inventory.chitin, needed: 8 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 4 }]} onClick={() => craft('Chitin Chest')} />
                            <CraftableCard name="Chitin Leggings" icon="🦵" costs={[{ label: 'Chitin', icon: '🦂', owned: engine.stats.inventory.chitin, needed: 6 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 3 }]} onClick={() => craft('Chitin Leggings')} />
                            <CraftableCard name="Chitin Boots" icon="🥾" costs={[{ label: 'Chitin', icon: '🦂', owned: engine.stats.inventory.chitin, needed: 4 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 2 }]} onClick={() => craft('Chitin Boots')} />

                            {/* IRON ARMOR */}
                            <CraftableCard name="Iron Helmet" icon="🪖" costs={[{ label: 'Metal Ingot', icon: '🪙', owned: engine.stats.inventory.metal_ingot, needed: 4 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 2 }]} onClick={() => craft('Iron Helmet')} />
                            <CraftableCard name="Iron Armor" icon="🛡️" costs={[{ label: 'Metal Ingot', icon: '🪙', owned: engine.stats.inventory.metal_ingot, needed: 8 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 4 }]} onClick={() => craft('Iron Armor')} />
                            <CraftableCard name="Iron Leggings" icon="🦵" costs={[{ label: 'Metal Ingot', icon: '🪙', owned: engine.stats.inventory.metal_ingot, needed: 6 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 3 }]} onClick={() => craft('Iron Leggings')} />
                            <CraftableCard name="Iron Boots" icon="🥾" costs={[{ label: 'Metal Ingot', icon: '🪙', owned: engine.stats.inventory.metal_ingot, needed: 4 }, { label: 'Leather', icon: '🥩', owned: engine.stats.inventory.leather, needed: 2 }]} onClick={() => craft('Iron Boots')} />
                        </div>
                    </div>
                )}

                {/* SURVIVOR CHARACTER & EQUIPMENT MODAL */}
                {showMenu === 'character' && engine && (
                    <div className="absolute inset-4 md:inset-8 bg-stone-950/95 border border-cyan-600/60 rounded-lg p-5 shadow-2xl backdrop-blur-md flex flex-col gap-4 z-30 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-cyan-600/40 pb-3">
                            <h2 className="text-cyan-400 uppercase tracking-widest text-sm font-black flex items-center gap-2">
                                <span>👤</span> SURVIVAL CHARACTER & EQUIPMENT PAPERDOLL
                            </h2>
                            <button onClick={() => setShowMenu(null)} className="text-stone-400 hover:text-white font-bold text-lg px-2 cursor-pointer">✕</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-y-auto pr-1 text-xs">
                            {/* COLUMN 1: SURVIVAL ATTRIBUTES */}
                            <div className="flex flex-col gap-3 bg-stone-900/80 p-4 border border-stone-800 rounded">
                                <h3 className="text-cyan-300 uppercase tracking-wider font-bold border-b border-stone-800 pb-2">
                                    Survivor Attributes
                                </h3>
                                
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                                            <span className="text-red-400">Health</span>
                                            <span className="text-stone-300">{Math.floor(engine.stats.hp)} / {engine.stats.maxHp}</span>
                                        </div>
                                        <div className="w-full h-2.5 bg-stone-800 rounded overflow-hidden border border-stone-700">
                                            <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300" style={{ width: `${(engine.stats.hp / engine.stats.maxHp) * 100}%` }}></div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[11px] mb-1 font-bold">
                                            <span className="text-amber-400">Stamina</span>
                                            <span className="text-stone-300">{Math.floor(engine.stats.stamina)} / {engine.stats.maxStamina}</span>
                                        </div>
                                        <div className="w-full h-2.5 bg-stone-800 rounded overflow-hidden border border-stone-700">
                                            <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300" style={{ width: `${(engine.stats.stamina / engine.stats.maxStamina) * 100}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="bg-stone-950 p-3 rounded border border-cyan-600/40 flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-cyan-300">Total Armor Defense</span>
                                            <span className="text-lg font-black text-emerald-400">+{getTotalArmor(engine.stats)}</span>
                                        </div>
                                        <span className="text-[10px] text-stone-400">Reduces all incoming combat, predator & fire damage!</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="bg-stone-800/80 p-2 rounded border border-stone-700">
                                            <span className="text-stone-400 block text-[10px]">Title</span>
                                            <span className="font-bold text-amber-300">{engine.isKing ? '👑 Island Sovereign' : '🏕️ Lone Survivor'}</span>
                                        </div>
                                        <div className="bg-stone-800/80 p-2 rounded border border-stone-700">
                                            <span className="text-stone-400 block text-[10px]">Days Survived</span>
                                            <span className="font-bold text-emerald-300">Day {engine.dayCount}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* COLUMN 2: CHARACTER PAPERDOLL & EQUIPPED SLOTS */}
                            <div className="flex flex-col items-center justify-between bg-stone-900/80 p-4 border border-stone-800 rounded">
                                <h3 className="text-cyan-300 uppercase tracking-wider font-bold border-b border-stone-800 pb-2 w-full text-center">
                                    Equipped Gear
                                </h3>

                                <div className="flex flex-col items-center my-auto relative w-full py-2">
                                    {/* HEAD SLOT */}
                                    <div className="w-full max-w-[220px] bg-stone-800 border border-cyan-500/50 rounded p-2 flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">🧢</span>
                                            <div>
                                                <span className="text-[10px] text-stone-400 block uppercase font-bold">Head</span>
                                                <span className="font-bold text-stone-200">{engine.stats.equipment.head}</span>
                                            </div>
                                        </div>
                                        {engine.stats.equipment.head !== 'None' && (
                                            <button onClick={() => unequipArmor('head')} className="px-2 py-0.5 bg-red-900/80 hover:bg-red-800 text-red-200 text-[10px] rounded cursor-pointer font-bold">Unequip</button>
                                        )}
                                    </div>

                                    {/* CHEST SLOT */}
                                    <div className="w-full max-w-[220px] bg-stone-800 border border-cyan-500/50 rounded p-2 flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">👕</span>
                                            <div>
                                                <span className="text-[10px] text-stone-400 block uppercase font-bold">Chest</span>
                                                <span className="font-bold text-stone-200">{engine.stats.equipment.chest}</span>
                                            </div>
                                        </div>
                                        {engine.stats.equipment.chest !== 'None' && (
                                            <button onClick={() => unequipArmor('chest')} className="px-2 py-0.5 bg-red-900/80 hover:bg-red-800 text-red-200 text-[10px] rounded cursor-pointer font-bold">Unequip</button>
                                        )}
                                    </div>

                                    {/* LEGS SLOT */}
                                    <div className="w-full max-w-[220px] bg-stone-800 border border-cyan-500/50 rounded p-2 flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">👖</span>
                                            <div>
                                                <span className="text-[10px] text-stone-400 block uppercase font-bold">Legs</span>
                                                <span className="font-bold text-stone-200">{engine.stats.equipment.legs}</span>
                                            </div>
                                        </div>
                                        {engine.stats.equipment.legs !== 'None' && (
                                            <button onClick={() => unequipArmor('legs')} className="px-2 py-0.5 bg-red-900/80 hover:bg-red-800 text-red-200 text-[10px] rounded cursor-pointer font-bold">Unequip</button>
                                        )}
                                    </div>

                                    {/* FEET SLOT */}
                                    <div className="w-full max-w-[220px] bg-stone-800 border border-cyan-500/50 rounded p-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">🥾</span>
                                            <div>
                                                <span className="text-[10px] text-stone-400 block uppercase font-bold">Feet</span>
                                                <span className="font-bold text-stone-200">{engine.stats.equipment.feet}</span>
                                            </div>
                                        </div>
                                        {engine.stats.equipment.feet !== 'None' && (
                                            <button onClick={() => unequipArmor('feet')} className="px-2 py-0.5 bg-red-900/80 hover:bg-red-800 text-red-200 text-[10px] rounded cursor-pointer font-bold">Unequip</button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* COLUMN 3: INVENTORY ARMOR PIECES & QUICK EQUIP */}
                            <div className="flex flex-col gap-3 bg-stone-900/80 p-4 border border-stone-800 rounded">
                                <h3 className="text-cyan-300 uppercase tracking-wider font-bold border-b border-stone-800 pb-2">
                                    Available Armor Pieces
                                </h3>

                                <div className="space-y-2 overflow-y-auto max-h-[350px] pr-1">
                                    {[
                                        { name: 'Cloth Cap', slot: 'head' as const, key: 'cloth_cap' as const },
                                        { name: 'Leather Cap', slot: 'head' as const, key: 'leather_cap' as const },
                                        { name: 'Chitin Helmet', slot: 'head' as const, key: 'chitin_helmet' as const },
                                        { name: 'Iron Helmet', slot: 'head' as const, key: 'iron_helmet' as const },
                                        { name: 'Cloth Shirt', slot: 'chest' as const, key: 'cloth_shirt' as const },
                                        { name: 'Leather Chest', slot: 'chest' as const, key: 'leather_chest' as const },
                                        { name: 'Chitin Chest', slot: 'chest' as const, key: 'chitin_chest' as const },
                                        { name: 'Iron Armor', slot: 'chest' as const, key: 'iron_armor' as const },
                                        { name: 'Cloth Pants', slot: 'legs' as const, key: 'cloth_pants' as const },
                                        { name: 'Leather Leggings', slot: 'legs' as const, key: 'leather_leggings' as const },
                                        { name: 'Chitin Leggings', slot: 'legs' as const, key: 'chitin_leggings' as const },
                                        { name: 'Iron Leggings', slot: 'legs' as const, key: 'iron_leggings' as const },
                                        { name: 'Cloth Boots', slot: 'feet' as const, key: 'cloth_boots' as const },
                                        { name: 'Leather Boots', slot: 'feet' as const, key: 'leather_boots' as const },
                                        { name: 'Chitin Boots', slot: 'feet' as const, key: 'chitin_boots' as const },
                                        { name: 'Iron Boots', slot: 'feet' as const, key: 'iron_boots' as const },
                                    ].map((item) => {
                                        const count = engine.stats.inventory[item.key];
                                        if (count <= 0) return null;
                                        const meta = ITEM_META[item.key] || { icon: '🛡️' };
                                        return (
                                            <div key={item.key} className="flex justify-between items-center bg-stone-800 p-2 rounded border border-stone-700">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">{meta.icon}</span>
                                                    <div>
                                                        <span className="font-bold text-stone-200 block">{item.name}</span>
                                                        <span className="text-[10px] text-amber-400">Owned: x{count}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => equipArmor(item.slot, item.name)}
                                                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-stone-950 font-black rounded text-[10px] uppercase cursor-pointer"
                                                >
                                                    Equip
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TUTORIAL MODAL OVERLAY */}
                {showMenu === 'tutorial' && (
                    <div className="absolute inset-4 md:inset-8 bg-stone-950/95 border border-amber-500/60 rounded-lg p-5 shadow-2xl backdrop-blur-md flex flex-col gap-4 z-30 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-amber-500/40 pb-3">
                            <h2 className="text-amber-400 uppercase tracking-widest text-sm font-black flex items-center gap-2">
                                <span>🎓</span> ARK SURVIVAL ISLE - SURVIVOR TUTORIAL & GUIDE
                            </h2>
                            <button onClick={() => setShowMenu(null)} className="text-stone-400 hover:text-white font-bold text-lg px-2 cursor-pointer">✕</button>
                        </div>

                        {/* STEP TABS */}
                        <div className="flex flex-wrap gap-2 border-b border-stone-800 pb-2">
                            {[
                                { id: 1, label: '1. Basics & Harvesting', icon: '🌲' },
                                { id: 2, label: '2. Taming & Mounting', icon: '🦖' },
                                { id: 3, label: '3. Survivor Armor', icon: '🛡️' },
                                { id: 4, label: '4. Night Cycle & Raiders', icon: '⚔️' },
                                { id: 5, label: '5. Base Building & Palace', icon: '🏰' },
                            ].map(step => (
                                <button
                                    key={step.id}
                                    onClick={() => setTutorialStep(step.id)}
                                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${
                                        tutorialStep === step.id ? 'bg-amber-500 text-stone-950 font-black shadow-lg' : 'bg-stone-800 text-stone-400 hover:text-white'
                                    }`}
                                >
                                    {step.icon} {step.label}
                                </button>
                            ))}
                        </div>

                        {/* TUTORIAL CONTENT */}
                        <div className="flex-1 overflow-y-auto pr-2 text-stone-300 text-xs leading-relaxed space-y-4">
                            {tutorialStep === 1 && (
                                <div className="space-y-3 bg-stone-900/60 p-4 rounded border border-stone-800">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase">🌲 Step 1: Island Gathering & Survival Basics</h3>
                                    <p>Welcome survivor! You have washed ashore on a dangerous primeval island filled with prehistoric predators, wild game, and ancient secrets.</p>
                                    <ul className="list-disc list-inside space-y-1 text-stone-300">
                                        <li><span className="font-bold text-amber-300">Movement & Interaction:</span> Click any adjacent hex or use standard WASD / Arrow keys to step onto adjacent tiles. Click adjacent trees or stone deposits to harvest resources.</li>
                                        <li><span className="font-bold text-amber-300">Wood & Stone Tools:</span> Craft Axes and Pickaxes at your <span className="text-blue-400 font-semibold">Engram Bench [⚒️ Engrams]</span> to speed up gathering and mine gold veins.</li>
                                        <li><span className="font-bold text-amber-300">Health & Stamina:</span> Harvesting and running consume Stamina. Eat Berries, Raw Meat, or Cooked Prime Meat from your Hotbar to regenerate Health and Stamina!</li>
                                    </ul>
                                </div>
                            )}

                            {tutorialStep === 2 && (
                                <div className="space-y-3 bg-stone-900/60 p-4 rounded border border-stone-800">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase">🦖 Step 2: Knockout Taming & Riding Beasts</h3>
                                    <p>Wild beasts can be tamed to become faithful companions or powerful mountable rides!</p>
                                    <ol className="list-decimal list-inside space-y-2 text-stone-300">
                                        <li><span className="font-bold text-amber-300">Knockout Phase:</span> Craft a <span className="text-white font-semibold">Club</span> or <span className="text-white font-semibold">Tranq Arrows</span>. Attack a beast until it collapses unconscious! <span className="text-red-400 font-semibold">(Dragons strictly require a Gold Club to knock out)</span>.</li>
                                        <li><span className="font-bold text-amber-300">Feeding Phase:</span> Select required food (Berries, Meat, Grand Flowers, or Dragon Meat) on your Hotbar and click the unconscious beast to raise its Taming Progress to 100%!</li>
                                        <li><span className="font-bold text-amber-300">Riding Phase:</span> Craft a <span className="text-white font-semibold">Saddle</span> (5 Leather), select it on your hotbar, and click your tamed Deer, Bear, Eagle, or Dragon to mount! Flying mounts (Eagles & Dragons) soar over mountains, water, and lava!</li>
                                    </ol>
                                </div>
                            )}

                            {tutorialStep === 3 && (
                                <div className="space-y-3 bg-stone-900/60 p-4 rounded border border-stone-800">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase">🛡️ Step 3: Survivor Equipment & Armor Tiers</h3>
                                    <p>Protecting yourself from apex predators like T-Rexes and Volcanic Dragons requires upgrading your armor!</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                        <div className="bg-stone-800 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-amber-300 block">🧢 Cloth Armor (Tier 1)</span>
                                            <span className="text-stone-400">Crafted from Fiber & Wood. Provides basic protection (+4 Total Defense).</span>
                                        </div>
                                        <div className="bg-stone-800 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-amber-300 block">🪖 Leather Armor (Tier 2)</span>
                                            <span className="text-stone-400">Harvested from wild animals (+8 Total Defense). Great for early wilderness exploration.</span>
                                        </div>
                                        <div className="bg-stone-800 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-amber-300 block">🦂 Chitin Armor (Tier 3)</span>
                                            <span className="text-stone-400">Harvested from Scorpions in the Desert (+14 Total Defense). Highly durable.</span>
                                        </div>
                                        <div className="bg-stone-800 p-2.5 rounded border border-stone-700">
                                            <span className="font-bold text-amber-300 block">🛡️ Iron Armor (Tier 4)</span>
                                            <span className="text-stone-400">Forged from Metal Ingots & Leather (+22 Total Defense). Mitigates massive predator damage!</span>
                                        </div>
                                    </div>
                                    <p className="text-cyan-400 font-bold mt-2">Open the [👤 Survivor] menu anytime to equip Head, Chest, Legs, and Feet armor!</p>
                                </div>
                            )}

                            {tutorialStep === 4 && (
                                <div className="space-y-3 bg-stone-900/60 p-4 rounded border border-stone-800">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase">⚔️ Step 4: Day/Night Cycle & Dawn Raider Ambushes</h3>
                                    <p>Night falls every 2 minutes. Darkness narrows your sight radial, and predators become much more aggressive.</p>
                                    <ul className="list-disc list-inside space-y-1 text-stone-300">
                                        <li><span className="font-bold text-amber-300">Sleeping in Beds:</span> Build a Bed or Campfire and click it at night to sleep safely until morning.</li>
                                        <li><span className="font-bold text-amber-300">Dawn Raider Raids:</span> If you stay awake through the <span className="text-red-400 font-semibold">ENTIRE night</span>, a heavy squad of hostile Raiders will launch a raid at dawn!</li>
                                        <li><span className="font-bold text-amber-300">Daybreak Retreat:</span> Raiders slowly retreat and despawn as daylight reaches full strength during the afternoon.</li>
                                    </ul>
                                </div>
                            )}

                            {tutorialStep === 5 && (
                                <div className="space-y-3 bg-stone-900/60 p-4 rounded border border-stone-800">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase">🏰 Step 5: Base Fortification & Becoming King</h3>
                                    <p>Build bases with Wooden Walls, Campfires, and Crafting Benches.</p>
                                    <ul className="list-disc list-inside space-y-1 text-stone-300">
                                        <li><span className="font-bold text-amber-300">Pink Repair Tiles:</span> Raiders smash city walls into pink <span className="text-pink-400 font-semibold">Broken Wall</span> tiles. Village Guards automatically rebuild missing walls directly on these pink tiles!</li>
                                        <li><span className="font-bold text-amber-300">Royal Throne & Palace:</span> Slay Raiders, explore the Royal Palace in the main city, and claim the throne to become King!</li>
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center border-t border-stone-800 pt-3">
                            <div className="flex gap-2">
                                {tutorialStep > 1 && (
                                    <button onClick={() => setTutorialStep(s => s - 1)} className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded font-bold uppercase text-xs cursor-pointer">
                                        ← Back
                                    </button>
                                )}
                                {tutorialStep < 5 && (
                                    <button onClick={() => setTutorialStep(s => s + 1)} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black rounded uppercase text-xs cursor-pointer">
                                        Next Step →
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setShowMenu(null)} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-black rounded uppercase text-xs tracking-wider cursor-pointer shadow-lg">
                                🚀 Start Playing!
                            </button>
                        </div>
                    </div>
                )}

                {/* MINIMAP MODAL */}
                {showMenu === 'map' && engine && (
                    <MiniMap engine={engine} />
                )}

                {/* WIKI SURVIVAL GUIDE MODAL */}
                {showMenu === 'wiki' && (
                    <div className="absolute inset-4 md:inset-8 bg-stone-950/95 border border-purple-600/60 rounded-lg p-5 shadow-2xl backdrop-blur-md flex flex-col gap-4 z-30 overflow-hidden">
                        <div className="flex justify-between items-center border-b border-purple-600/40 pb-3">
                            <h2 className="text-purple-400 uppercase tracking-widest text-sm font-black flex items-center gap-2">
                                <span>📖</span> SURVIVAL GUIDE & FIELD WIKI
                            </h2>
                            <button onClick={() => setShowMenu(null)} className="text-stone-400 hover:text-white font-bold text-lg px-2 cursor-pointer">✕</button>
                        </div>

                        {/* WIKI NAVIGATION TABS */}
                        <div className="flex flex-wrap gap-2 border-b border-stone-800 pb-2">
                            <button
                                onClick={() => setWikiTab('tools')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'tools' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                🛠️ Tools & Weapons
                            </button>
                            <button
                                onClick={() => setWikiTab('crafting')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'crafting' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                🛠️ Crafting Benches
                            </button>
                            <button
                                onClick={() => setWikiTab('armor')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'armor' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                🛡️ Armor Tiers
                            </button>
                            <button
                                onClick={() => setWikiTab('raiders')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'raiders' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                ⚔️ Dawn Raiders & Guards
                            </button>
                            <button
                                onClick={() => setWikiTab('animals')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'animals' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                🐉 Animals & Biomes
                            </button>
                            <button
                                onClick={() => setWikiTab('taming')}
                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition cursor-pointer ${wikiTab === 'taming' ? 'bg-purple-600 text-white shadow' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                            >
                                💺 Taming & Mounting
                            </button>
                        </div>

                        {/* WIKI TAB CONTENT */}
                        <div className="flex-1 overflow-y-auto pr-2 text-stone-300 text-xs leading-relaxed space-y-4">
                            {wikiTab === 'armor' && (
                                <div className="space-y-4">
                                    <h3 className="text-cyan-400 font-bold text-sm uppercase tracking-wider">Survivor Armor Tiers & Mitigations</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-cyan-300 text-xs mb-1">🧢 Cloth Armor Set (+4 Total Armor)</div>
                                            <p className="text-stone-400 text-[11px]">Crafted from Berries/Fiber & Wood. Head (+1), Chest (+1), Legs (+1), Boots (+1). Essential entry protection against wild wolves.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-cyan-300 text-xs mb-1">🪖 Leather Armor Set (+8 Total Armor)</div>
                                            <p className="text-stone-400 text-[11px]">Harvested from animals. Head (+2), Chest (+2), Legs (+2), Boots (+2). Absorbs moderate hits from Bears and Scorpions.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-cyan-300 text-xs mb-1">🦂 Chitin Armor Set (+14 Total Armor)</div>
                                            <p className="text-stone-400 text-[11px]">Crafted from Desert Scorpion Chitin & Leather. Head (+3), Chest (+4), Legs (+4), Boots (+3). Heavy damage reduction against T-Rexes!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-cyan-300 text-xs mb-1">🛡️ Iron Armor Set (+22 Total Armor)</div>
                                            <p className="text-stone-400 text-[11px]">Forged from Metal Ingots at the Engram Bench. Head (+5), Chest (+7), Legs (+6), Boots (+4). Top-tier armor that absorbs massive Dragon fire breath and Raider strikes!</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wikiTab === 'raiders' && (
                                <div className="space-y-4">
                                    <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider">Dawn Raider Attacks & Village Defense</h3>
                                    <div className="space-y-3">
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-red-300 text-xs mb-1">⚔️ Heavy Raider Squads</div>
                                            <p className="text-stone-400 text-[11px]">Raiders form coordinated squads (up to 4 raiders). They possess high hit points (50 HP) and deal heavy melee damage. <span className="text-amber-400 font-semibold">They smash through city walls and player structures upon contact!</span></p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-red-300 text-xs mb-1">🌸 Pink Broken Wall Repair Tiles</div>
                                            <p className="text-stone-400 text-[11px]">When Raiders bust through city walls, they turn the tiles into bright pink <span className="text-pink-400 font-bold">Broken Wall</span> markers. Village Guards ONLY construct replacement walls on these specific pink spots!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-red-300 text-xs mb-1">🌙 Dawn Spawn Condition & Afternoon Retreat</div>
                                            <p className="text-stone-400 text-[11px]">Raiders ONLY launch an ambush at Dawn if you stay awake through the <span className="text-amber-300 font-bold">ENTIRE night</span>! Sleeping safely in a bed prevents dawn raids. During the day, surviving Raiders gradually retreat and despawn.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {wikiTab === 'tools' && (
                                <div className="space-y-4">
                                    <h3 className="text-amber-400 font-bold text-sm uppercase tracking-wider">Gathering Tools & Combat Weaponry</h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">🪓 Wood, Stone & Gold Axes</div>
                                            <p className="text-stone-400 text-[11px]">Used to chop Forest trees for Wood and rare Grand Flowers. Higher tiers significantly reduce stamina cost per swing (Wood: 15, Stone: 10, Gold: 5 stamina).</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">⛏️ Wood, Stone & Gold Pickaxes</div>
                                            <p className="text-stone-400 text-[11px]">Used to mine Stone from Mountains and Gold from Gold Veins. Gold Pickaxe allows breaking through solid Cave Walls inside underground caverns!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">🗡️ Swords & Iron Upgrades</div>
                                            <p className="text-stone-400 text-[11px]">Main offensive melee weapon (Wood: 10 dmg, Stone: 20 dmg, Gold: 35 dmg). Iron Swords can be purchased from Villager Traders for high-tier combat.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">🏏 Knockout Clubs</div>
                                            <p className="text-stone-400 text-[11px]">Essential for Taming. Deals minimal lethal damage but has a high chance to knock wild animals unconscious (Wood: 15%, Stone: 30%, Gold: 45%). <span className="text-red-400 font-semibold">Note: Dragons strictly require a Gold Club to knock out!</span></p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">🏹 Bow & Arrows</div>
                                            <p className="text-stone-400 text-[11px]">Ranged weapon dealing 25 damage per hit. Crucial for hunting airborne Eagles or slaying Dragons from a safe distance before they incinerate you!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-amber-300 text-xs mb-1">🛡️ Iron Armor</div>
                                            <p className="text-stone-400 text-[11px]">Purchased from Villager Traders in exchange for Gold. Mitigates incoming physical and fire damage from predators.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wikiTab === 'crafting' && (
                                <div className="space-y-4">
                                    <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider">Crafting Bench & Base Building</h3>
                                    
                                    <div className="space-y-3">
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-blue-300 text-xs mb-1">🛠️ Crafting Bench (Engram Station)</div>
                                            <p className="text-stone-400 text-[11px]">Requires <span className="text-amber-400 font-semibold">10 Wood</span> & <span className="text-amber-400 font-semibold">5 Stone</span>. Must be built and placed on the ground. Advanced crafting recipes (Stone/Gold Tools, Bows, Boats, Saddles) require standing adjacent to a placed Crafting Bench.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-blue-300 text-xs mb-1">🛶 Wooden Boat</div>
                                            <p className="text-stone-400 text-[11px]">Crafted with <span className="text-amber-400 font-semibold">20 Wood</span> at a Crafting Bench. Place onto water to embark and sail across ocean waters without consuming stamina or taking drowning damage!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-blue-300 text-xs mb-1">🧱 Defensive Walls & Campfires</div>
                                            <p className="text-stone-400 text-[11px]">Walls (2 Wood, 2 Stone) block wild animal movement to fortify your perimeter. Campfires (5 Wood, 5 Stone) light up surrounding areas and provide warmth.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wikiTab === 'animals' && (
                                <div className="space-y-4">
                                    <h3 className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Fauna, Biomes & Danger Levels</h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🐉 Volcanic Dragon (Boss Predator)</div>
                                            <p className="text-stone-400 text-[11px]">Inhabits Volcanic Lava Wastes. Flies across all terrain. <span className="text-red-400 font-bold">Breathes scorching fire up to 3 hexes away for 35-50 damage!</span> Drops 2 Dragon Meat. Tamed with Dragon Meat.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🦅 Mountain Eagle (Airborne Hunter)</div>
                                            <p className="text-stone-400 text-[11px]">Inhabits mountain peaks. Swoops down dealing 15 damage. Flies over land and ocean. Tamed with Grand Flowers to become a flying mount!</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🐋 Ocean Whale (Leviathan)</div>
                                            <p className="text-stone-400 text-[11px]">Glides in deep blue ocean waters. Thrashes its tail for 30 damage if provoked or bumped. Drops rare Whale Meat.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🦈 Shark (Apex Sea Hunter)</div>
                                            <p className="text-stone-400 text-[11px]">Senses movement in water from 7 hexes away. Bites swimming players or boats for 18 damage.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🐻 Mountain Bear & 🐺 Wolf</div>
                                            <p className="text-stone-400 text-[11px]">Bears (Highlands, 12 dmg) and Wolves (Forests, 8 dmg) aggressively chase targets. Drops Meat and Leather.</p>
                                        </div>
                                        <div className="bg-stone-900 border border-stone-800 p-3 rounded">
                                            <div className="font-bold text-emerald-300 text-xs mb-1">🧙‍♂️ Villagers, Guards & Chests</div>
                                            <p className="text-stone-400 text-[11px]">Tap adjacent Villagers directly to trade. Opening village chests yields varied resources (Gold, Iron, Wood, Stone, Arrows, Saddles). <span className="text-red-400 font-semibold">Stealing from chests or attacking villagers makes Village Guards (🛡️) hostile for 30 seconds!</span> Villagers only take damage without fighting, but Village Guards will chase and attack you.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wikiTab === 'taming' && (
                                <div className="space-y-4">
                                    <h3 className="text-purple-400 font-bold text-sm uppercase tracking-wider">Complete Taming & Mount Mechanics</h3>
                                    
                                    <div className="bg-stone-900 border border-stone-800 p-4 rounded space-y-3">
                                        <div>
                                            <div className="font-bold text-amber-300 text-xs">Step 1: Knocking Out the Animal</div>
                                            <p className="text-stone-400 text-[11px]">Equip a <span className="text-white font-semibold">Club</span> (Wood, Stone, or Gold). Strike the wild animal until they collapse into an unconscious state. <span className="text-red-400 font-semibold">Dragons strictly require a Gold Club to knock out!</span></p>
                                        </div>

                                        <div className="border-t border-stone-800 pt-2">
                                            <div className="font-bold text-amber-300 text-xs">Step 2: Feeding Preferred Foods</div>
                                            <p className="text-stone-400 text-[11px]">Equip the required food item on your Hotbar and click the unconscious animal:</p>
                                            <ul className="list-disc list-inside text-stone-300 text-[11px] mt-1 space-y-0.5">
                                                <li>🥩 <span className="font-bold">Meat</span>: Wolves, Bears, Foxes</li>
                                                <li>🫐 <span className="font-bold">Berries</span>: Rabbits, Boars</li>
                                                <li>🌸 <span className="font-bold">Grand Flower</span>: Deer, Eagles</li>
                                                <li>🐉 <span className="font-bold">Dragon Meat</span>: Volcanic Dragon</li>
                                            </ul>
                                        </div>

                                        <div className="border-t border-stone-800 pt-2">
                                            <div className="font-bold text-amber-300 text-xs">Step 3: Mounting & Riding</div>
                                            <p className="text-stone-400 text-[11px]">Craft a <span className="text-white font-semibold">Saddle</span> (5 Leather) or buy one from a Villager Trader. Equip the Saddle on your Hotbar and click your tamed pet to mount!</p>
                                            <p className="text-emerald-400 font-semibold text-[11px] mt-1">✨ Mountable Pets: Deer, Bear, Eagle, and Dragon. Mounted Eagles and Dragons allow you to fly freely over mountains, rivers, and lava without taking environmental damage!</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* DEATH OVERLAY */}
                {engine && engine.stats.hp <= 0 && (
                    <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
                        <h1 className="text-5xl md:text-7xl font-black text-red-500 mb-6 tracking-widest uppercase drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]">You Perished</h1>
                        <button className="px-8 py-4 bg-red-800 hover:bg-red-700 rounded text-white font-black uppercase tracking-widest transition hover:scale-105 shadow-xl cursor-pointer" onClick={() => window.location.reload()}>Reincarnate</button>
                    </div>
                )}
                
                {/* ASSIGN TO HOTBAR MODAL OVERLAY */}
                {assigningItem && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-40 backdrop-blur-sm p-4">
                        <div className="bg-stone-900 border border-amber-500/60 p-6 rounded-lg shadow-2xl flex flex-col items-center max-w-md w-full">
                            <h3 className="text-amber-400 font-black uppercase tracking-wider text-sm mb-2">
                                Assign <span className="text-white">[{assigningItem}]</span> to Hotbar Slot:
                            </h3>
                            <div className="grid grid-cols-5 gap-2 my-4 w-full">
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((slotIdx) => (
                                    <button
                                        key={slotIdx}
                                        onClick={() => assignToHotbarSlot(slotIdx)}
                                        className="bg-stone-800 hover:bg-amber-600 border border-stone-700 rounded p-3 text-center cursor-pointer font-black text-amber-300 hover:text-stone-950 transition flex flex-col items-center justify-center"
                                    >
                                        <span className="text-xs text-stone-500">[{slotIdx + 1 === 10 ? 0 : slotIdx + 1}]</span>
                                        <span className="text-lg mt-1">{ITEM_META[engine?.stats.hotbar[slotIdx] || '']?.icon || '⚪'}</span>
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setAssigningItem(null)} className="mt-2 text-xs font-bold text-stone-400 hover:text-white uppercase tracking-widest cursor-pointer">Cancel</button>
                        </div>
                    </div>
                )}

                {/* ARK SURVIVAL STYLE BOTTOM HOTBAR */}
                {engine && (
                    <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex items-center justify-center gap-1.5 bg-stone-950/90 border border-amber-600/50 p-2 rounded-lg shadow-2xl backdrop-blur-md z-20 max-w-full overflow-x-auto">
                        {engine.stats.hotbar.map((item, idx) => {
                            const isSelected = activeItem === item && item !== null;
                            const slotKeyStr = idx + 1 === 10 ? '0' : String(idx + 1);
                            const meta = item ? ITEM_META[item] || { name: item, icon: '📦' } : null;
                            
                            // Determine quantity or status
                            let qtyStr = '';
                            if (item && item in engine.stats.inventory) {
                                qtyStr = `x${engine.stats.inventory[item as keyof PlayerStats['inventory']]}`;
                            } else if (item === 'Sword') {
                                qtyStr = `Lvl ${engine.stats.equipment.swordLevel}`;
                            } else if (item === 'Axe') {
                                qtyStr = `Lvl ${engine.stats.equipment.axeLevel}`;
                            } else if (item === 'Pickaxe') {
                                qtyStr = `Lvl ${engine.stats.equipment.pickaxeLevel}`;
                            } else if (item === 'Club') {
                                qtyStr = `Lvl ${engine.stats.equipment.clubLevel}`;
                            } else if (item === 'Bow') {
                                qtyStr = `x${engine.stats.inventory.arrows}`;
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        if (item) {
                                            if (item === activeItem) {
                                                if (['meat', 'berries', 'grand_flower', 'whale_meat', 'dragon_meat'].includes(item)) {
                                                    handleConsume(item as any);
                                                } else {
                                                    setActiveItem(null);
                                                }
                                            } else {
                                                setActiveItem(item);
                                            }
                                        } else {
                                            // Click empty slot to open inventory for assigning
                                            setShowMenu('inventory');
                                        }
                                    }}
                                    className={`relative w-12 h-14 md:w-14 md:h-16 flex flex-col items-center justify-center border rounded transition-all cursor-pointer ${
                                        isSelected 
                                            ? 'bg-amber-600/30 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)] scale-105' 
                                            : item 
                                                ? 'bg-stone-900 border-stone-700 hover:border-amber-500/60' 
                                                : 'bg-stone-900/40 border-stone-800 hover:border-stone-600'
                                    }`}
                                >
                                    <span className="absolute top-0.5 left-1 text-[9px] font-black text-amber-400 drop-shadow">
                                        [{slotKeyStr}]
                                    </span>
                                    {meta ? (
                                        <>
                                            <span className="text-xl md:text-2xl my-auto">{meta.icon}</span>
                                            <span className="text-[9px] font-bold text-stone-300 truncate w-full text-center px-0.5 pb-0.5">
                                                {qtyStr || meta.name}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-stone-700 text-xs mt-3">+</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
                
                <div className="absolute top-4 left-4 pointer-events-none hidden md:flex flex-col gap-1 z-10">
                    <div className="bg-stone-900/80 px-3 py-1 rounded text-xs text-stone-300 backdrop-blur border border-stone-700">Click adjacent tiles to Move or Interact. Use Keys [1-0] for Hotbar.</div>
                    <div className="bg-stone-900/80 px-3 py-1 rounded text-xs text-stone-400 backdrop-blur border border-stone-800">Biomes: Ocean (🐋), Highlands (🦅,🐻), Desert (🦂,🐇), Lava (🐉).</div>
                </div>
            </div>
        </div>
    );
}
