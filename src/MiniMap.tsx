import React, { useEffect, useRef } from 'react';
import { GameEngine, MAP_COLS, MAP_ROWS } from './engine';
import { TileType } from './types';

interface MiniMapProps {
    engine: GameEngine;
}

const TILE_COLORS: Record<TileType, string> = {
    Plains: '#3f7032',         // Rich meadow green
    Forest: '#1e3d1f',         // Dark coniferous forest
    ForestGround: '#284d28',   // Forest understory ground
    Mountain: '#4d555e',       // Rugged slate mountain
    MountainGround: '#6b737d', // Rocky scree ground
    Water: '#1d5a8a',          // Ocean blue
    WaterShallow: '#3490b8',   // Crystal reef cyan
    WaterMedium: '#185580',    // Medium coastal blue
    WaterDeep: '#0c2e48',      // Abyssal trench navy
    CaveEntrance: '#16191f',   // Dark cave maw
    CaveFloor: '#2a303a',      // Cavernous floor stone
    CaveWall: '#15181e',       // Dark rock wall
    GoldVein: '#9e7018',       // Golden ore deposit
    Wall: '#524e4a',           // Fortified stone wall
    BrokenWall: '#9e3b56',     // Ruined wall rubble
    Campfire: '#8c2318',       // Burning ash stone
    Sand: '#cfa253',           // Warm golden desert sand
    BerryBush: '#335227',      // Lush berry thicket
    Snow: '#dbe5ed',           // Arctic snow cap
    Lava: '#d1381b',           // Molten magma glow
    LavaGround: '#1e1a19',     // Volcanic basalt stone
    House: '#8c501e',          // Timber house roof
    HouseFloor: '#b87328',     // Polished wood plank
    HouseDoor: '#5e320f',      // Heavy oak door
    CraftingTable: '#663914',  // Timber bench
    Palace: '#6b2113',         // Royal palace stone
    PalaceDoor: '#852b12',     // Golden palace archway
    PalaceFloor: '#d9822b',    // Regal gold floor
    Bed: '#7b2cbf'             // Velvet purple bed
};

export function MiniMap({ engine }: MiniMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const map = engine.map;
        const pixelSize = 1.5;
        canvas.width = MAP_COLS * pixelSize;
        canvas.height = MAP_ROWS * pixelSize;

        // Draw Map
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                ctx.fillStyle = TILE_COLORS[map[r][c]] || '#000';
                ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
            }
        }

        let playerPos = engine.player.pos;
        if ((engine.inCave || engine.inHouse) && engine.overworldPos) {
            playerPos = engine.overworldPos;
        }

        // Draw Player
        ctx.fillStyle = '#ef4444'; // red
        ctx.beginPath();
        ctx.arc(playerPos.c * pixelSize + pixelSize/2, playerPos.r * pixelSize + pixelSize/2, pixelSize * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw Village (Houses)
        ctx.fillStyle = '#f59e0b'; // amber
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (map[r][c] === 'House') {
                    ctx.fillRect(c * pixelSize - 1, r * pixelSize - 1, pixelSize + 2, pixelSize + 2);
                }
            }
        }
    }, [engine, engine.player.pos.c, engine.player.pos.r]);

    return (
        <div className="absolute top-4 right-4 bg-stone-900/95 border border-stone-700 p-4 rounded shadow-xl backdrop-blur flex flex-col items-center z-20">
            <h3 className="text-stone-400 uppercase tracking-widest text-xs font-bold border-b border-stone-700 pb-2 w-full text-left mb-3">
                World Map
            </h3>
            <canvas ref={canvasRef} className="border border-stone-600 rounded bg-black" />
            <div className="flex gap-4 mt-3 text-[10px] uppercase text-stone-400 font-bold w-full justify-center">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 block"></span> Player</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 block"></span> Village</div>
            </div>
        </div>
    );
}
