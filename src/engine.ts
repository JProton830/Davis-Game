import { TileType, Position, Entity, PlayerStats } from './types';
import { playSound } from './sound';

export function hash2D(x: number, y: number): number {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return n - Math.floor(n);
}

export function smoothNoise(x: number, y: number): number {
    let i = Math.floor(x);
    let j = Math.floor(y);
    let fx = x - i;
    let fy = y - j;
    let sx = fx * fx * (3 - 2 * fx);
    let sy = fy * fy * (3 - 2 * fy);
    let n00 = hash2D(i, j);
    let n10 = hash2D(i + 1, j);
    let n01 = hash2D(i, j + 1);
    let n11 = hash2D(i + 1, j + 1);
    let nx0 = n00 + sx * (n10 - n00);
    let nx1 = n01 + sx * (n11 - n01);
    return nx0 + sy * (nx1 - nx0);
}

export function fbm(x: number, y: number, octaves = 4): number {
    let val = 0;
    let amp = 0.5;
    let freq = 1.0;
    let maxAmp = 0;
    for (let o = 0; o < octaves; o++) {
        val += smoothNoise(x * freq, y * freq) * amp;
        maxAmp += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return val / maxAmp;
}

export function adjustColor(hexColor: string, factor: number): string {
    let num = parseInt(hexColor.replace('#', ''), 16);
    let r = Math.min(255, Math.max(0, Math.floor(((num >> 16) & 0xFF) * factor)));
    let g = Math.min(255, Math.max(0, Math.floor(((num >> 8) & 0xFF) * factor)));
    let b = Math.min(255, Math.max(0, Math.floor((num & 0xFF) * factor)));
    return `rgb(${r}, ${g}, ${b})`;
}

export const Hex = {
    size: 34, 
    width() { return Math.sqrt(3) * this.size; }, 
    height() { return 2 * this.size; },
    getPixel(col: number, row: number) { 
        return { 
            x: this.width() * (col + 0.5 * (row & 1)), 
            y: (this.height() * 0.75) * row 
        }; 
    },
    getGrid(px: number, py: number) {
        let q = (Math.sqrt(3)/3 * px - 1/3 * py) / this.size, r = (2/3 * py) / this.size;
        let cx = q, cz = r, cy = -cx - cz; 
        let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
        let xDiff = Math.abs(rx - cx), yDiff = Math.abs(ry - cy), zDiff = Math.abs(rz - cz);
        if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz; 
        else if (yDiff > zDiff) ry = -rx - rz; 
        else rz = -rx - ry;
        return { col: rx + (rz - (rz & 1)) / 2, row: rz };
    },
    draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, fill: string|null, stroke: string|null, lw = 1) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { 
            let a = Math.PI/180 * (60*i - 30); 
            let x = cx + this.size*Math.cos(a); 
            let y = cy + this.size*Math.sin(a); 
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); 
        }
        ctx.closePath(); 
        if (fill) { ctx.fillStyle = fill; ctx.fill(); } 
        if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
    },
    dist(c1: number, r1: number, c2: number, r2: number) {
        let q1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -q1 - z1; 
        let q2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -q2 - z2;
        return Math.max(Math.abs(q1 - q2), Math.abs(y1 - y2), Math.abs(z1 - z2));
    }
};

export class GameEngine {
    map: TileType[][] = [];
    caveMaps: Record<string, TileType[][]> = {};
    caveEntitiesMap: Record<string, Entity[]> = {};
    houseMaps: Record<string, TileType[][]> = {};
    houseEntitiesMap: Record<string, Entity[]> = {};
    inCave: boolean = false;
    currentCaveId: string | null = null;
    inHouse: boolean = false;
    currentHouseId: string | null = null;
    overworldPos: Position | null = null;
    
    player: Entity = { id: 'player', type: 'player', pos: {c: 0, r: 0}, hp: 100, maxHp: 100, speedMs: 0, lastMove: 0 };
    stats: PlayerStats = { 
        hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, 
        hunger: 100, maxHunger: 100,
        thirst: 100, maxThirst: 100,
        weight: 0, maxWeight: 150,
        temperature: 37.0,
        inventory: { 
            wood: 0, stone: 0, gold: 0, iron: 0, meat: 0, arrows: 0, leather: 0, grand_flower: 0, boat: 0, saddle: 0, berries: 0, whale_meat: 0, dragon_meat: 0, chitin: 0, metal_ingot: 0, narcotics: 0, tranq_arrows: 0, cooked_prime_meat: 0,
            cloth_cap: 0, leather_cap: 0, chitin_helmet: 0, iron_helmet: 0,
            cloth_shirt: 0, leather_chest: 0, chitin_chest: 0, iron_armor: 0,
            cloth_pants: 0, leather_leggings: 0, chitin_leggings: 0, iron_leggings: 0,
            cloth_boots: 0, leather_boots: 0, chitin_boots: 0, iron_boots: 0
        },
        equipment: { 
            axeLevel: 0, pickaxeLevel: 0, swordLevel: 0, clubLevel: 0, armorLevel: 0, bow: false,
            head: 'None', chest: 'None', legs: 'None', feet: 'None'
        },
        pets: [], riding: null, inBoat: false,
        hotbar: ['Sword', 'Axe', 'Pickaxe', 'Bow', 'meat', 'berries', 'whale_meat', 'Wall', 'Campfire', 'CraftingTable']
    };
    
    entities: Entity[] = [];
    villageHostileUntil: number = 0;
    wasHostile: boolean = false;
    
    timeOfDay: number = 0; // 0..240 seconds: 0..120 Day, 120..240 Night
    dayCount: number = 1;
    nightSpawnedThisCycle: boolean = false;
    lastRaidTime: number = Date.now();
    lastRaiderDespawnTime: number = Date.now();
    isKing: boolean = false;
    kingDead: boolean = false;
    depletedTiles: { c: number, r: number, originalTile: TileType, harvestedAt: number }[] = [];
    lastCreatureRespawn: number = Date.now();

    weather: 'Clear' | 'Rain' | 'Snow' | 'Fog' = 'Clear';
    lastWeatherChange: number = Date.now();
    lastCampfireCook: number = Date.now();
    floatingTexts: { id: string; c: number; r: number; text: string; color: string; createdAt: number; durationMs: number }[] = [];
    
    camera = { x: 0, y: 0 };
    messages: {text: string, time: number}[] = [];
    
    wallHp: Record<string, number> = {};

    playerPath: Position[] = [];
    targetHex: Position | null = null;
    lastPlayerStepTime: number = 0;
    pendingActionItem: string | null = null;

    addFloatingText(c: number, r: number, text: string, color: string = '#ef4444') {
        this.floatingTexts.push({
            id: Math.random().toString(),
            c, r, text, color,
            createdAt: Date.now(),
            durationMs: 1400
        });
    }

    getWallHp(c: number, r: number): number {
        let key = `${c},${r}`;
        if (this.wallHp[key] === undefined) {
            this.wallHp[key] = 60;
        }
        return this.wallHp[key];
    }

    damageWall(c: number, r: number, amount: number, map: TileType[][]): boolean {
        let key = `${c},${r}`;
        let cur = this.getWallHp(c, r);
        let updated = cur - amount;
        this.wallHp[key] = updated;
        if (updated <= 0) {
            delete this.wallHp[key];
            map[r][c] = 'HouseFloor';
            this.log(`💥 Raiders smashed down a Wall at (${c}, ${r})!`);
            return true;
        }
        return false;
    }

    repairWall(c: number, r: number, amount: number, map: TileType[][]): void {
        let key = `${c},${r}`;
        if (map[r][c] === 'HouseFloor') {
            map[r][c] = 'Wall';
            this.wallHp[key] = 60;
            this.log(`🛡️ Guards rebuilt a destroyed Wall at (${c}, ${r})!`);
        } else if (map[r][c] === 'Wall') {
            let cur = this.getWallHp(c, r);
            this.wallHp[key] = Math.min(60, cur + amount);
            if (this.wallHp[key] === 60) {
                this.log(`🛡️ Wall at (${c}, ${r}) restored to full strength!`);
            }
        }
    }

    log(msg: string) {
        this.messages.unshift({text: msg, time: Date.now()});
        if (this.messages.length > 6) this.messages.pop();
    }
}

export const MAP_COLS = 200;
export const MAP_ROWS = 200;

export function calculateWeight(stats: PlayerStats): number {
    let inv = stats.inventory;
    let w = 0;
    w += (inv.wood || 0) * 0.5;
    w += (inv.stone || 0) * 1.0;
    w += (inv.iron || 0) * 2.0;
    w += (inv.gold || 0) * 1.5;
    w += (inv.metal_ingot || 0) * 2.5;
    w += (inv.chitin || 0) * 0.8;
    w += (inv.meat || 0) * 0.5;
    w += (inv.whale_meat || 0) * 1.5;
    w += (inv.dragon_meat || 0) * 1.5;
    w += (inv.cooked_prime_meat || 0) * 0.5;
    w += (inv.berries || 0) * 0.1;
    w += (inv.leather || 0) * 0.4;
    w += (inv.arrows || 0) * 0.1;
    w += (inv.tranq_arrows || 0) * 0.1;
    w += (inv.boat || 0) * 15.0;
    w += (inv.saddle || 0) * 5.0;
    return Math.round(w * 10) / 10;
}

export function applyKnockback(targetPos: Position, sourcePos: Position, map: TileType[][], entities: Entity[]): Position {
    let dc = Math.sign(targetPos.c - sourcePos.c);
    let dr = Math.sign(targetPos.r - sourcePos.r);
    if (dc === 0 && dr === 0) dc = 1;
    let nc = targetPos.c + dc;
    let nr = targetPos.r + dr;
    if (nr >= 0 && nr < map.length && nc >= 0 && nc < map[0].length) {
        let t = map[nr][nc];
        if (t !== 'Wall' && t !== 'CaveWall' && t !== 'Lava' && !entities.find(e => e.pos.c === nc && e.pos.r === nr)) {
            return { c: nc, r: nr };
        }
    }
    return targetPos;
}

export function isWater(tile: TileType): boolean {
    return tile === 'Water' || tile === 'WaterShallow' || tile === 'WaterMedium' || tile === 'WaterDeep';
}

export function isTileAllowedForEntity(ent: Entity, tile: TileType, targetPos: Position, map?: TileType[][]): boolean {
    if (ent.tamed) {
        if (ent.type === 'eagle' || ent.type === 'dragon') return tile !== 'CaveWall' && tile !== 'Wall';
        if (ent.type === 'boat') return isWater(tile);
        return !isWater(tile) && tile !== 'Lava' && tile !== 'CaveWall' && tile !== 'Wall';
    }

    if (ent.inBoat || ent.riding === 'boat') {
        return isWater(tile) || tile === 'Plains' || tile === 'Sand' || tile === 'HouseFloor';
    }

    if (ent.type === 'crocodile') {
        if (tile === 'Lava' || tile === 'CaveWall' || tile === 'Wall') return false;
        if (isWater(tile)) return true;
        // Ensure target is within 3 hexes of a water tile
        if (map) {
            for (let dr = -3; dr <= 3; dr++) {
                for (let dc = -3; dc <= 3; dc++) {
                    let nr = targetPos.r + dr, nc = targetPos.c + dc;
                    if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS) {
                        if (isWater(map[nr][nc]) && Hex.dist(targetPos.c, targetPos.r, nc, nr) <= 3) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }
        return true;
    }

    if (ent.type === 'villager' || ent.type === 'guard' || ent.type === 'king' || ent.type === 'raider') {
        if (isWater(tile) || tile === 'Lava' || tile === 'CaveWall' || tile === 'Wall') return false;
        if (ent.type === 'villager' && ent.homePos) {
            return Hex.dist(targetPos.c, targetPos.r, ent.homePos.c, ent.homePos.r) <= 10;
        }
        return true;
    }

    if (ent.type === 'eagle' || ent.type === 'dragon') {
        return tile !== 'CaveWall' && tile !== 'Wall';
    }

    if (ent.type === 'fish') {
        return tile === 'WaterShallow' || tile === 'WaterMedium';
    }
    if (ent.type === 'shark') {
        return tile === 'WaterMedium' || tile === 'WaterDeep';
    }
    if (ent.type === 'whale') {
        return tile === 'WaterDeep' || tile === 'WaterMedium';
    }

    if (isWater(tile) || tile === 'Lava' || tile === 'CaveWall' || tile === 'Wall') return false;

    if (ent.type === 'scorpion' || ent.type === 'rabbit') {
        return tile === 'Sand' || tile === 'Plains';
    }
    if (ent.type === 'bear') {
        return tile === 'Mountain' || tile === 'MountainGround' || tile === 'Snow' || tile === 'Plains';
    }

    return true;
}

function getNeighbors(col: number, row: number) {
    const isOdd = (row & 1) === 1;
    if (isOdd) {
        return [
            { c: col, r: row - 1 }, { c: col + 1, r: row - 1 },
            { c: col - 1, r: row }, { c: col + 1, r: row },
            { c: col, r: row + 1 }, { c: col + 1, r: row + 1 }
        ];
    } else {
        return [
            { c: col - 1, r: row - 1 }, { c: col, r: row - 1 },
            { c: col - 1, r: row },     { c: col + 1, r: row },
            { c: col - 1, r: row + 1 }, { c: col, r: row + 1 }
        ];
    }
}

function findTile(map: TileType[][], type: TileType): Position | null {
    for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[0].length; c++) {
            if (map[r][c] === type) return {c, r};
        }
    }
    return null;
}

export function isTilePassableForPlayer(engine: GameEngine, c: number, r: number): boolean {
    let map = getMap(engine);
    if (r < 0 || r >= map.length || c < 0 || c >= map[0].length) return false;
    let tile = map[r][c];

    let isEagle = engine.stats.riding && engine.stats.riding.type === 'eagle';
    let isDragon = engine.stats.riding && engine.stats.riding.type === 'dragon';
    let isFlying = isEagle || isDragon;

    if (isFlying) {
        return tile !== 'CaveWall' && tile !== 'Wall';
    }

    if (tile === 'CaveWall' || tile === 'Wall') return false;
    if (tile === 'Forest' || tile === 'Mountain' || tile === 'GoldVein') return false;
    if (tile === 'Lava') return false;

    return true;
}

export function getTileMovementCost(engine: GameEngine, c: number, r: number): number {
    let map = getMap(engine);
    if (r < 0 || r >= map.length || c < 0 || c >= map[0].length) return Infinity;
    let tile = map[r][c];

    let isEagle = engine.stats.riding && engine.stats.riding.type === 'eagle';
    let isDragon = engine.stats.riding && engine.stats.riding.type === 'dragon';
    let isFlying = isEagle || isDragon;

    if (isFlying) return 1.0;

    let inBoat = engine.stats.inBoat || (engine.stats.riding && engine.stats.riding.type === 'boat');
    let hasBoat = engine.stats.inventory.boat > 0;

    if (isWater(tile)) {
        if (inBoat || hasBoat) return 1.0;
        return 3.0; // Swimming cost higher so A* prefers land/bridges if available
    }

    if (tile === 'Snow') return 1.4;
    if (tile === 'Sand') return 1.1;
    if (tile === 'HouseFloor' || tile === 'PalaceFloor') return 0.8;

    return 1.0;
}

export function findPathAStar(engine: GameEngine, start: Position, goal: Position): Position[] | null {
    if (start.c === goal.c && start.r === goal.r) return [];

    let map = getMap(engine);
    if (goal.r < 0 || goal.r >= map.length || goal.c < 0 || goal.c >= map[0].length) return null;

    let effectiveGoal = goal;

    // If goal tile itself is impassable (e.g. tree, mountain, wall, entity, bed, house, campfire, lava),
    // find the closest passable neighbor to the goal!
    if (!isTilePassableForPlayer(engine, goal.c, goal.r)) {
        let goalNeighbors = getNeighbors(goal.c, goal.r).filter(n => isTilePassableForPlayer(engine, n.c, n.r));
        if (goalNeighbors.length === 0) return null;
        goalNeighbors.sort((a, b) => Hex.dist(a.c, a.r, start.c, start.r) - Hex.dist(b.c, b.r, start.c, start.r));
        effectiveGoal = goalNeighbors[0];
        if (start.c === effectiveGoal.c && start.r === effectiveGoal.r) return [];
    }

    let openSet = new Set<string>();
    let keyOf = (p: Position) => `${p.c},${p.r}`;
    let parseKey = (k: string): Position => {
        let [c, r] = k.split(',').map(Number);
        return { c, r };
    };

    let startKey = keyOf(start);
    let goalKey = keyOf(effectiveGoal);

    openSet.add(startKey);

    let cameFrom = new Map<string, string>();
    let gScore = new Map<string, number>();
    let fScore = new Map<string, number>();

    gScore.set(startKey, 0);
    fScore.set(startKey, Hex.dist(start.c, start.r, effectiveGoal.c, effectiveGoal.r));

    let openList: { key: string; f: number }[] = [{ key: startKey, f: fScore.get(startKey)! }];

    let maxSteps = 2500;
    let steps = 0;

    while (openList.length > 0 && steps < maxSteps) {
        steps++;
        openList.sort((a, b) => a.f - b.f);
        let currentItem = openList.shift()!;
        let currentKey = currentItem.key;
        openSet.delete(currentKey);

        if (currentKey === goalKey) {
            let path: Position[] = [];
            let curr: string | undefined = currentKey;
            while (curr && curr !== startKey) {
                path.push(parseKey(curr));
                curr = cameFrom.get(curr);
            }
            path.reverse();
            return path;
        }

        let currPos = parseKey(currentKey);
        let currG = gScore.get(currentKey) ?? Infinity;

        let neighbors = getNeighbors(currPos.c, currPos.r);
        for (let n of neighbors) {
            if (!isTilePassableForPlayer(engine, n.c, n.r) && keyOf(n) !== goalKey) {
                continue;
            }

            let stepCost = getTileMovementCost(engine, n.c, n.r);
            let tentativeG = currG + stepCost;
            let nKey = keyOf(n);

            if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                cameFrom.set(nKey, currentKey);
                gScore.set(nKey, tentativeG);
                let h = Hex.dist(n.c, n.r, effectiveGoal.c, effectiveGoal.r);
                let f = tentativeG + h;
                fScore.set(nKey, f);

                if (!openSet.has(nKey)) {
                    openSet.add(nKey);
                    openList.push({ key: nKey, f });
                }
            }
        }
    }

    return null;
}

export function executeSingleStep(engine: GameEngine, hex: Position) {
    let map = getMap(engine);
    let entities = getEntities(engine);

    if (hex.r < 0 || hex.r >= map.length || hex.c < 0 || hex.c >= map[0].length) return;

    let tile = map[hex.r][hex.c];

    let isEagle = engine.stats.riding && engine.stats.riding.type === 'eagle';
    let isDragon = engine.stats.riding && engine.stats.riding.type === 'dragon';
    let isFlying = isEagle || isDragon;

    if (isWater(tile)) {
        if (isFlying) {
            engine.player.pos = hex;
            if (isEagle && Math.random() < 0.20) {
                engine.log("Your eagle swooped down and caught a small fish! (+1 Meat)");
                engine.stats.inventory.meat++;
            }
        } else if (engine.stats.riding && engine.stats.riding.type === 'boat') {
            engine.player.pos = hex;
            if (Math.random() < 0.08) {
                engine.log("You found some whale meat in the ocean!");
                engine.stats.inventory.whale_meat++;
            }
        } else if (engine.stats.inventory.boat > 0 || engine.stats.inBoat) {
            engine.player.pos = hex;
            engine.stats.inBoat = true;
            if (engine.stats.riding) {
                engine.log(`You can't ride a ${engine.stats.riding.type} in the water! It waits at the shore.`);
                engine.stats.riding.pos = { ...engine.player.pos };
                entities.push(engine.stats.riding);
                engine.stats.riding = null;
            }
            if (Math.random() < 0.08) {
                engine.log("You found some whale meat in the ocean!");
                engine.stats.inventory.whale_meat++;
            }
        } else {
            if (engine.stats.stamina >= 10) {
                engine.stats.stamina -= 10;
                engine.player.pos = hex;
                engine.log("You swim into the water (-10 Stamina).");
            } else {
                engine.stats.stamina = 0;
                engine.stats.hp -= 10;
                engine.player.pos = hex;
                engine.log("Exhausted! Swimming without stamina causes drowning damage (-10 HP)!");
            }
        }
    } else if (tile === 'CaveWall' || tile === 'Wall' || tile === 'Forest' || tile === 'Mountain' || tile === 'GoldVein') {
        engine.log("Path blocked.");
        return;
    } else if (tile === 'Lava') {
        if (!isFlying) {
            let damage = 100;
            let armorRed = engine.stats.equipment.armorLevel * 5;
            if (damage > armorRed) damage -= armorRed;
            else damage = 0;
            engine.stats.hp -= damage;
            engine.log("Burned by lava!");
        }
        engine.player.pos = hex;
    } else if (tile === 'House') {
        if (!engine.inHouse) {
            engine.inHouse = true;
            engine.overworldPos = { ...engine.player.pos };
            let houseId = `${hex.c},${hex.r}`;
            engine.currentHouseId = houseId;

            if (!engine.houseMaps[houseId]) {
                engine.houseMaps[houseId] = generateHouseMap();
                engine.houseEntitiesMap[houseId] = generateHouseEntities(engine.houseMaps[houseId]);
            }

            let door = findTile(engine.houseMaps[houseId], 'HouseDoor');
            if (door) engine.player.pos = { c: door.c, r: door.r - 1 };
            engine.log("You entered a villager's house.");
            engine.playerPath = [];
            engine.targetHex = null;
        }
        return;
    } else if (tile === 'CaveEntrance') {
        if (engine.inCave) {
            engine.inCave = false;
            if (engine.overworldPos) engine.player.pos = engine.overworldPos;
            engine.currentCaveId = null;
            engine.log("Emerged from the cave.");
        } else {
            engine.inCave = true;
            engine.overworldPos = { ...engine.player.pos };
            let caveId = `${hex.c},${hex.r}`;
            engine.currentCaveId = caveId;

            if (!engine.caveMaps[caveId]) {
                engine.caveMaps[caveId] = generateCaveMap();
                engine.caveEntitiesMap[caveId] = generateCaveEntities(engine.caveMaps[caveId]);
            }

            let entrance = findTile(engine.caveMaps[caveId], 'CaveEntrance');
            if (entrance) engine.player.pos = entrance;
            engine.log("Entered a dark cave.");
        }
        engine.playerPath = [];
        engine.targetHex = null;
        return;
    } else if (tile === 'HouseDoor' && engine.inHouse) {
        engine.inHouse = false;
        if (engine.overworldPos) engine.player.pos = engine.overworldPos;
        engine.currentHouseId = null;
        engine.log("You stepped outside.");
        engine.playerPath = [];
        engine.targetHex = null;
        return;
    } else {
        engine.player.pos = hex;
        if (engine.stats.inBoat && !isFlying) {
            engine.stats.inBoat = false;
        }
    }

    if (!engine.stats.riding) {
        if (engine.stats.stamina >= 1) engine.stats.stamina -= 1;
    }
}

function generateTerrain(): TileType[][] {
    let map: TileType[][] = [];
    
    // 1. Generate Organic Continents, Oceans & Biomes using multi-octave Fractal Noise
    for (let r = 0; r < MAP_ROWS; r++) {
        let row: TileType[] = [];
        for (let c = 0; c < MAP_COLS; c++) {
            let elev = fbm(c / 28, r / 28, 4);
            let moisture = fbm(c / 22 + 50, r / 22 + 50, 3);
            let temp = fbm(c / 40 + 100, r / 40 + 100, 2) + (r / MAP_ROWS) * 0.35 - 0.15;
            
            // Macro Ocean Coastline on Western Edge (columns 0 to ~60 with organic coastal noise)
            let coastX = 55 + Math.sin(r / 10) * 12 + Math.cos(r / 20) * 8;
            if (c <= coastX - 12) {
                elev -= 0.35; // Deep abyssal ocean
            } else if (c <= coastX) {
                elev -= 0.18; // Shallow coastal ocean
            }

            // Determine Tile Type from Elevation, Moisture & Temperature
            if (elev < 0.20) {
                row.push('WaterDeep');
            } else if (elev < 0.27) {
                row.push('WaterMedium');
            } else if (elev < 0.33) {
                row.push('WaterShallow');
            } else if (elev < 0.37) {
                row.push('Sand'); // Shoreline beach
            } else if (elev >= 0.76) {
                if (elev >= 0.86 || temp < 0.25) {
                    row.push('Snow'); // Snow-capped high peaks
                } else if (moisture < 0.3 && temp > 0.65) {
                    row.push('LavaGround'); // Volcanic crag
                } else {
                    row.push(Math.random() < 0.7 ? 'Mountain' : 'MountainGround');
                }
            } else if (elev >= 0.64) {
                if (moisture > 0.48) {
                    row.push('Forest'); // Alpine pine forests
                } else {
                    row.push('MountainGround');
                }
            } else {
                // Lowlands & Plains (0.37 to 0.64 elev)
                if (temp > 0.62 && moisture < 0.35) {
                    // Desert Dunes
                    row.push('Sand');
                } else if (temp > 0.68 && moisture < 0.25 && c > 130 && r > 120) {
                    // Southern Volcanic Wastes
                    if (Math.random() < 0.15) row.push('Lava');
                    else row.push('LavaGround');
                } else if (moisture > 0.52) {
                    // Woodland / Forest
                    row.push(Math.random() < 0.75 ? 'Forest' : 'ForestGround');
                } else {
                    row.push('Plains');
                }
            }
        }
        map.push(row);
    }

    // 2. RIVERS, LAKES, AND WATERWAYS
    // Winding River 1: Flows from Northern Mountain down to Ocean
    let curC = 140, curR = 40;
    while (curC > 55 && curR < 180 && curC >= 0 && curR >= 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                let nr = curR + dr, nc = curC + dc;
                if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS) {
                    map[nr][nc] = 'WaterMedium';
                }
            }
        }
        curC -= Math.random() < 0.8 ? 1 : 0;
        curR += Math.random() < 0.6 ? 1 : (Math.random() < 0.5 ? 0 : -1);
    }

    // Winding River 2: Flows across Central Plains
    curC = 130; curR = 120;
    while (curC > 55 && curC >= 0 && curR < MAP_ROWS) {
        for (let dr = 0; dr <= 1; dr++) {
            for (let dc = -1; dc <= 0; dc++) {
                let nr = curR + dr, nc = curC + dc;
                if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS) {
                    map[nr][nc] = 'WaterShallow';
                }
            }
        }
        curC -= 1;
        curR += Math.sin(curC / 4) > 0 ? 1 : 0;
    }

    // Inland Lakes and Ponds
    let waterBodies = [
        { c: 130, r: 90, radius: 5, type: 'WaterMedium' as TileType },
        { c: 100, r: 20, radius: 3, type: 'WaterShallow' as TileType },
        { c: 120, r: 145, radius: 3, type: 'WaterShallow' as TileType },
        { c: 160, r: 130, radius: 4, type: 'WaterMedium' as TileType }
    ];

    for (let wb of waterBodies) {
        for (let r = Math.max(0, wb.r - wb.radius); r <= Math.min(MAP_ROWS - 1, wb.r + wb.radius); r++) {
            for (let c = Math.max(0, wb.c - wb.radius); c <= Math.min(MAP_COLS - 1, wb.c + wb.radius); c++) {
                if (Hex.dist(c, r, wb.c, wb.r) <= wb.radius) {
                    map[r][c] = wb.type;
                }
            }
        }
    }

    // 3. Royal Capital City (Massive Walled City) at center (c: 100, r: 100)
    let cityC = 100, cityR = 100;
    for (let r = cityR - 12; r <= cityR + 12; r++) {
        for (let c = cityC - 12; c <= cityC + 12; c++) {
            if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS && !isWater(map[r][c])) {
                map[r][c] = 'HouseFloor';
            }
        }
    }
    // Perimeter Walls with Gateways
    for (let r = cityR - 10; r <= cityR + 10; r++) {
        for (let c = cityC - 10; c <= cityC + 10; c++) {
            if (r === cityR - 10 || r === cityR + 10 || c === cityC - 10 || c === cityC + 10) {
                if ((r === cityR - 10 && (c === cityC || c === cityC + 1)) ||
                    (r === cityR + 10 && (c === cityC || c === cityC + 1)) ||
                    (c === cityC - 10 && (r === cityR || r === cityR + 1)) ||
                    (c === cityC + 10 && (r === cityR || r === cityR + 1))) {
                    map[r][c] = 'HouseFloor';
                } else {
                    map[r][c] = 'Wall';
                }
            }
        }
    }
    // Royal Palace in center of city
    for (let pr = cityR - 4; pr <= cityR + 4; pr++) {
        for (let pc = cityC - 4; pc <= cityC + 4; pc++) {
            if (pr === cityR - 4 || pr === cityR + 4 || pc === cityC - 4 || pc === cityC + 4) {
                if (pr === cityR + 4 && pc === cityC) {
                    map[pr][pc] = 'PalaceDoor';
                } else {
                    map[pr][pc] = 'Wall';
                }
            } else {
                map[pr][pc] = 'PalaceFloor';
            }
        }
    }
    map[cityR - 2][cityC] = 'Bed';
    map[cityR - 2][cityC - 2] = 'CraftingTable';
    map[cityR - 2][cityC + 2] = 'Campfire';
    map[cityR][cityC] = 'Palace';

    // Villages (3 big Villages in Grasslands/Plains)
    let villageLocs = [
        { c: 80, r: 110 },
        { c: 110, r: 80 },
        { c: 150, r: 110 }
    ];

    for (let v of villageLocs) {
        for (let dr = -3; dr <= 3; dr++) {
            for (let dc = -3; dc <= 3; dc++) {
                let nr = v.r + dr;
                let nc = v.c + dc;
                if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS) {
                    if (!isWater(map[nr][nc])) map[nr][nc] = 'Plains';
                }
            }
        }
        map[v.r][v.c] = 'House';
        map[v.r][v.c + 2] = 'House';
        if (v.r + 2 < MAP_ROWS) map[v.r + 2][v.c + 1] = 'House';
    }

    // Berry bushes scattered on Plains and Forest
    for (let i = 0; i < 200; i++) {
        let rc = Math.floor(Math.random() * MAP_COLS);
        let rr = Math.floor(Math.random() * MAP_ROWS);
        if (map[rr][rc] === 'Plains' || map[rr][rc] === 'ForestGround') map[rr][rc] = 'BerryBush';
    }

    // Out-of-biome sparse resource spawns
    for (let i = 0; i < 160; i++) {
        let rc = Math.floor(Math.random() * MAP_COLS);
        let rr = Math.floor(Math.random() * MAP_ROWS);
        if (map[rr][rc] === 'Plains' || map[rr][rc] === 'MountainGround' || map[rr][rc] === 'Sand') {
            map[rr][rc] = 'Forest';
        }
    }
    for (let i = 0; i < 120; i++) {
        let rc = Math.floor(Math.random() * MAP_COLS);
        let rr = Math.floor(Math.random() * MAP_ROWS);
        if (map[rr][rc] === 'Plains' || map[rr][rc] === 'ForestGround' || map[rr][rc] === 'Sand') {
            map[rr][rc] = 'Mountain';
        }
    }
    for (let i = 0; i < 100; i++) {
        let rc = Math.floor(Math.random() * MAP_COLS);
        let rr = Math.floor(Math.random() * MAP_ROWS);
        if (map[rr][rc] === 'Sand' || map[rr][rc] === 'MountainGround') {
            map[rr][rc] = 'BerryBush';
        }
    }
    for (let i = 0; i < 35; i++) {
        let rc = Math.floor(Math.random() * MAP_COLS);
        let rr = Math.floor(Math.random() * MAP_ROWS);
        if (map[rr][rc] === 'Mountain') {
            map[rr][rc] = 'GoldVein';
        }
    }
    
    // Caves in Mountains & LavaGround
    let caves = 0;
    while (caves < 18) {
        let c = Math.floor(Math.random() * MAP_COLS);
        let r = Math.floor(Math.random() * MAP_ROWS);
        if (map[r][c] === 'Mountain' || map[r][c] === 'MountainGround' || map[r][c] === 'LavaGround') {
            map[r][c] = 'CaveEntrance';
            caves++;
        }
    }

    return map;
}

function generateCaveMap(): TileType[][] {
    let map: TileType[][] = [];
    for (let r = 0; r < 20; r++) {
        let row: TileType[] = [];
        for (let c = 0; c < 20; c++) {
            if (r === 0 || r === 19 || c === 0 || c === 19) row.push('CaveWall');
            else row.push(Math.random() > 0.4 ? 'CaveFloor' : 'CaveWall');
        }
        map.push(row);
    }
    
    for (let i = 0; i < 4; i++) {
        let newMap = map.map(r => [...r]);
        for (let r = 1; r < 19; r++) {
            for (let c = 1; c < 19; c++) {
                let walls = getNeighbors(c, r).filter(n => 
                    n.r >= 0 && n.r < 20 && n.c >= 0 && n.c < 20 && map[n.r][n.c] === 'CaveWall'
                ).length;
                newMap[r][c] = walls >= 3 ? 'CaveWall' : 'CaveFloor';
            }
        }
        map = newMap;
    }
    
    for (let r = 1; r < 19; r++) {
        for (let c = 1; c < 19; c++) {
            if (map[r][c] === 'CaveFloor' && Math.random() < 0.08) map[r][c] = 'GoldVein';
        }
    }
    
    let exitPlaced = false;
    while(!exitPlaced) {
        let c = Math.floor(Math.random() * 20);
        let r = Math.floor(Math.random() * 20);
        if (map[r][c] === 'CaveFloor') {
            map[r][c] = 'CaveEntrance';
            exitPlaced = true;
        }
    }
    
    return map;
}

function generateCaveEntities(map: TileType[][]): Entity[] {
    let entities: Entity[] = [];
    for (let i = 0; i < 8; i++) {
        let r = Math.floor(Math.random() * map.length);
        let c = Math.floor(Math.random() * map[0].length);
        if (map[r][c] === 'CaveFloor') {
            entities.push({
                id: Math.random().toString(),
                type: 'wolf', // Act as cave enemies
                pos: {c, r},
                hp: 20, maxHp: 20,
                speedMs: 3000 + Math.random()*2000,
                lastMove: Date.now()
            });
        }
    }
    return entities;
}

function generateHouseMap(): TileType[][] {
    let map: TileType[][] = [];
    let size = 9;
    for (let r = 0; r < size; r++) {
        let row: TileType[] = [];
        for (let c = 0; c < size; c++) {
            if (r === 0 || r === size - 1 || c === 0 || c === size - 1) {
                if (r === size - 1 && c === Math.floor(size / 2)) {
                    row.push('HouseDoor');
                } else {
                    row.push('Wall');
                }
            } else {
                row.push('HouseFloor');
            }
        }
        map.push(row);
    }
    return map;
}

function generateHouseEntities(map: TileType[][]): Entity[] {
    let entities: Entity[] = [];
    for (let i = 0; i < 2; i++) {
        let r = Math.floor(Math.random() * map.length);
        let c = Math.floor(Math.random() * map[0].length);
        if (map[r][c] === 'HouseFloor') {
            entities.push({
                id: Math.random().toString(),
                type: 'chest',
                pos: {c, r},
                hp: 1, maxHp: 1,
                speedMs: 999999,
                lastMove: Date.now()
            });
        }
    }
    return entities;
}

export function getTotalArmor(stats: PlayerStats): number {
    let armor = stats.equipment.armorLevel || 0;
    
    // Head armor
    if (stats.equipment.head === 'Cloth Cap') armor += 1;
    if (stats.equipment.head === 'Leather Cap') armor += 2;
    if (stats.equipment.head === 'Chitin Helmet') armor += 3;
    if (stats.equipment.head === 'Iron Helmet') armor += 5;

    // Chest armor
    if (stats.equipment.chest === 'Cloth Shirt') armor += 1;
    if (stats.equipment.chest === 'Leather Chest') armor += 2;
    if (stats.equipment.chest === 'Chitin Chest') armor += 3;
    if (stats.equipment.chest === 'Iron Armor') armor += 5;

    // Leg armor
    if (stats.equipment.legs === 'Cloth Pants') armor += 1;
    if (stats.equipment.legs === 'Leather Leggings') armor += 2;
    if (stats.equipment.legs === 'Chitin Leggings') armor += 3;
    if (stats.equipment.legs === 'Iron Leggings') armor += 5;

    // Feet armor
    if (stats.equipment.feet === 'Cloth Boots') armor += 1;
    if (stats.equipment.feet === 'Leather Boots') armor += 2;
    if (stats.equipment.feet === 'Chitin Boots') armor += 3;
    if (stats.equipment.feet === 'Iron Boots') armor += 5;

    return armor;
}

export function initEngine(): GameEngine {
    let eng = new GameEngine();
    eng.map = generateTerrain();
    
    let ppos = findTile(eng.map, 'Plains');
    if (ppos) eng.player.pos = ppos;
    
    for (let i = 0; i < 300; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        let tile = eng.map[r][c];
        
        let type: string | null = null;
        let rnd = Math.random();
        
        if (tile === 'Plains') {
            type = rnd > 0.5 ? 'deer' : 'wolf';
        } else if (tile === 'Forest' || tile === 'ForestGround') {
            type = rnd > 0.5 ? 'wolf' : 'boar';
        } else if (tile === 'Sand') {
            type = rnd > 0.5 ? 'scorpion' : 'rabbit';
        } else if (tile === 'Snow') {
            type = rnd > 0.5 ? 'wolf' : 'bear';
        } else if (tile === 'Mountain' || tile === 'MountainGround') {
            type = rnd > 0.6 ? 'eagle' : 'bear';
        } else if (tile === 'Lava' || tile === 'LavaGround') {
            if (rnd > 0.8) type = 'dragon';
        } else if (tile === 'WaterShallow') {
            if (rnd > 0.4) type = 'fish';
        } else if (tile === 'WaterMedium') {
            if (rnd > 0.6) type = 'fish';
            else if (rnd > 0.3) type = 'shark';
        } else if (tile === 'WaterDeep') {
            if (rnd > 0.6) type = 'shark';
            else if (rnd > 0.3) type = 'whale';
        }

        if (type) {
            let speed = 1500;
            if (type === 'wolf' || type === 'fox' || type === 'eagle' || type === 'scorpion' || type === 'fish') speed = 1000;
            if (type === 'rabbit' || type === 'deer' || type === 'dragon' || type === 'shark') speed = 800;
            if (type === 'boar') speed = 1200;
            if (type === 'whale') speed = 2000;

            let hp = 30;
            if (type === 'fish') hp = 10;
            if (type === 'shark') hp = 180;
            if (type === 'bear') hp = 280;
            if (type === 'dragon') hp = 500;
            if (type === 'whale') hp = 380;
            if (type === 'boar' || type === 'wolf') hp = 120;
            if (type === 'scorpion') hp = 110;

            eng.entities.push({
                id: Math.random().toString(),
                type: type as any,
                pos: {c, r},
                homePos: {c, r},
                hp: hp, maxHp: hp,
                speedMs: speed + Math.random()*1500,
                lastMove: Date.now()
            });
        }
    }
    
    for (let i = 0; i < 15; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        if (eng.map[r][c] === 'Mountain') {
            eng.entities.push({
                id: Math.random().toString(), type: 'eagle', pos: {c, r}, homePos: {c, r},
                hp: 120, maxHp: 120, speedMs: 800 + Math.random()*500, lastMove: Date.now()
            });
        }
    }

    for (let i = 0; i < 25; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        if (eng.map[r][c] === 'WaterDeep' || eng.map[r][c] === 'WaterMedium') {
            let isWhale = eng.map[r][c] === 'WaterDeep' && Math.random() < 0.6;
            let type = isWhale ? 'whale' : 'shark';
            let hp = isWhale ? 380 : 180;
            eng.entities.push({
                id: Math.random().toString(), type: type as any, pos: {c, r}, homePos: {c, r},
                hp: hp, maxHp: hp,
                speedMs: isWhale ? 2000 + Math.random()*2000 : 1000, lastMove: Date.now()
            });
        }
    }

    let dragonPlaced = false;
    for (let i = 0; i < 100 && !dragonPlaced; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        if (eng.map[r][c] === 'Lava') {
            eng.entities.push({
                id: Math.random().toString(), type: 'dragon', pos: {c, r}, homePos: {c, r},
                hp: 500, maxHp: 500, speedMs: 700 + Math.random()*300, lastMove: Date.now()
            });
            dragonPlaced = true;
        }
    }

    // Spawn Apex Predators: T-Rex dinosaurs in Plains/Mountains
    for (let i = 0; i < 12; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        if (eng.map[r][c] === 'Plains' || eng.map[r][c] === 'Mountain' || eng.map[r][c] === 'MountainGround') {
            eng.entities.push({
                id: Math.random().toString(), type: 'trex', pos: {c, r}, homePos: {c, r},
                hp: 600, maxHp: 600, speedMs: 800, lastMove: Date.now()
            });
        }
    }

    // Spawn Crocodiles around rivers, lakes, ponds, and coasts
    for (let i = 0; i < 20; i++) {
        let r = Math.floor(Math.random() * eng.map.length);
        let c = Math.floor(Math.random() * eng.map[0].length);
        let tile = eng.map[r][c];
        if (isWater(tile) || tile === 'Sand' || tile === 'Plains') {
            let nearWater = false;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    let nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < eng.map.length && nc >= 0 && nc < eng.map[0].length && isWater(eng.map[nr][nc])) {
                        nearWater = true;
                        break;
                    }
                }
                if (nearWater) break;
            }
            if (nearWater) {
                eng.entities.push({
                    id: Math.random().toString(), type: 'crocodile', pos: {c, r}, homePos: {c, r},
                    hp: 180, maxHp: 180, speedMs: 1000, lastMove: Date.now()
                });
            }
        }
    }

    // Spawn villagers near houses
    let houses = [];
    for (let r = 0; r < eng.map.length; r++) {
        for (let c = 0; c < eng.map[0].length; c++) {
            if (eng.map[r][c] === 'House') houses.push({c, r});
        }
    }
    if (houses.length > 0) {
        let trades = ['Buy Iron Armor', 'Buy Iron Sword', 'Buy Eagle', 'Buy Boat', 'Buy Saddle', 'Buy Wood'];
        for (let i = 0; i < houses.length; i++) {
            let h = houses[i];
            let neighbors = getNeighbors(h.c, h.r).filter(n => eng.map[n.r] && eng.map[n.r][n.c] === 'Plains');
            let pos = neighbors.length > 0 ? neighbors[Math.floor(Math.random() * neighbors.length)] : h;
            eng.entities.push({
                id: Math.random().toString(), type: 'villager', pos: pos, homePos: pos,
                hp: 50, maxHp: 50, speedMs: 3000, lastMove: Date.now(),
                trade: trades[i % trades.length]
            });

            // Spawn 1-2 Village Guards per house
            let gPos = neighbors.length > 1 ? neighbors[(i + 1) % neighbors.length] : pos;
            eng.entities.push({
                id: Math.random().toString(), type: 'guard', pos: gPos, homePos: gPos,
                hp: 80, maxHp: 80, speedMs: 1200, lastMove: Date.now()
            });
        }
    }

    // Spawn The King and Royal Capital Guards / Villagers
    let cityC = 100, cityR = 100;
    eng.entities.push({
        id: 'king_the_first', type: 'king', pos: { c: cityC, r: cityR }, homePos: { c: cityC, r: cityR },
        hp: 150, maxHp: 150, speedMs: 2500, lastMove: Date.now()
    });

    let royalGuardPositions = [
        { c: cityC, r: cityR - 9 }, { c: cityC, r: cityR + 9 },
        { c: cityC - 9, r: cityR }, { c: cityC + 9, r: cityR },
        { c: cityC - 2, r: cityR + 3 }, { c: cityC + 2, r: cityR + 3 },
        { c: cityC - 1, r: cityR - 1 }, { c: cityC + 1, r: cityR - 1 }
    ];
    for (let gPos of royalGuardPositions) {
        eng.entities.push({
            id: Math.random().toString(), type: 'guard', pos: gPos, homePos: gPos,
            hp: 100, maxHp: 100, speedMs: 1100, lastMove: Date.now()
        });
    }

    let royalVillagerPositions = [
        { c: cityC - 5, r: cityR - 5 }, { c: cityC + 5, r: cityR - 5 },
        { c: cityC - 5, r: cityR + 5 }, { c: cityC + 5, r: cityR + 5 }
    ];
    let capitalTrades = ['Buy Iron Armor', 'Buy Iron Sword', 'Buy Eagle', 'Buy Saddle'];
    for (let i = 0; i < royalVillagerPositions.length; i++) {
        let vPos = royalVillagerPositions[i];
        eng.entities.push({
            id: Math.random().toString(), type: 'villager', pos: vPos, homePos: vPos,
            hp: 60, maxHp: 60, speedMs: 3000, lastMove: Date.now(),
            trade: capitalTrades[i % capitalTrades.length]
        });
    }

    eng.log("Welcome to the wild. Click adjacent tiles to interact or move.");
    return eng;
}

export function getMap(engine: GameEngine): TileType[][] {
    if (engine.inCave && engine.currentCaveId) return engine.caveMaps[engine.currentCaveId];
    if (engine.inHouse && engine.currentHouseId) return engine.houseMaps[engine.currentHouseId];
    return engine.map;
}

export function getEntities(engine: GameEngine): Entity[] {
    if (engine.inCave && engine.currentCaveId) return engine.caveEntitiesMap[engine.currentCaveId];
    if (engine.inHouse && engine.currentHouseId) return engine.houseEntitiesMap[engine.currentHouseId];
    return engine.entities;
}

export function setEntities(engine: GameEngine, newEntities: Entity[]) {
    if (engine.inCave && engine.currentCaveId) engine.caveEntitiesMap[engine.currentCaveId] = newEntities;
    else if (engine.inHouse && engine.currentHouseId) engine.houseEntitiesMap[engine.currentHouseId] = newEntities;
    else engine.entities = newEntities;
}

export function updateGame(engine: GameEngine, dt: number, now: number) {
    if (engine.stats.hp <= 0) return;

    // Player Smart Path Movement Processing
    if (engine.playerPath && engine.playerPath.length > 0) {
        let isEagle = engine.stats.riding && engine.stats.riding.type === 'eagle';
        let isDragon = engine.stats.riding && engine.stats.riding.type === 'dragon';
        let isFlying = isEagle || isDragon;
        let inBoat = engine.stats.inBoat || (engine.stats.riding && engine.stats.riding.type === 'boat');
        let currentMap = getMap(engine);

        let stepMs = 150;
        if (isFlying) stepMs = 90;
        else if (inBoat) stepMs = 110;
        else if (isWater(currentMap[engine.player.pos.r]?.[engine.player.pos.c])) stepMs = 220;

        if (now - engine.lastPlayerStepTime >= stepMs) {
            engine.lastPlayerStepTime = now;
            let nextHex = engine.playerPath[0];

            let ents = getEntities(engine);
            let entityBlocking = ents.find(e => e.hp > 0 && e.pos.c === nextHex.c && e.pos.r === nextHex.r && e.type !== 'boat');
            let tilePassable = isTilePassableForPlayer(engine, nextHex.c, nextHex.r);

            if (!tilePassable || (entityBlocking && engine.playerPath.length > 1)) {
                if (engine.targetHex) {
                    let rePath = findPathAStar(engine, engine.player.pos, engine.targetHex);
                    if (rePath && rePath.length > 0) {
                        engine.playerPath = rePath;
                        nextHex = engine.playerPath[0];
                    } else {
                        engine.playerPath = [];
                        engine.targetHex = null;
                        engine.log("Path blocked!");
                    }
                } else {
                    engine.playerPath = [];
                    engine.log("Path blocked!");
                }
            }

            if (engine.playerPath.length > 0) {
                engine.playerPath.shift();
                executeSingleStep(engine, nextHex);

                if (engine.playerPath.length === 0 && engine.targetHex) {
                    let tHex = engine.targetHex;
                    let pItem = engine.pendingActionItem;
                    engine.targetHex = null;
                    engine.pendingActionItem = null;

                    let d = Hex.dist(engine.player.pos.c, engine.player.pos.r, tHex.c, tHex.r);
                    if (d <= 1) {
                        handleHexClick(engine, tHex, pItem);
                    }
                }
            }
        }
    }

    if (engine.wasHostile && now >= engine.villageHostileUntil) {
        engine.wasHostile = false;
        engine.log("🕊️ The Village Guards have calmed down and are peaceful again.");
    }
    
    // Day/Night Cycle Progression
    let prevTime = engine.timeOfDay;
    engine.timeOfDay += dt / 1000;

    if (prevTime < 120 && engine.timeOfDay >= 120) {
        engine.log(`🌙 Night has fallen! Find a Bed or Campfire to sleep through the night, or stay awake at your own risk...`);
    }

    if (engine.timeOfDay >= 240) {
        engine.timeOfDay = 0;
        engine.dayCount++;
        engine.nightSpawnedThisCycle = false;
        engine.log(`🌅 Day ${engine.dayCount} has begun! The sun rises over the realm.`);
    } else if (engine.timeOfDay >= 230 && !engine.nightSpawnedThisCycle) {
        engine.nightSpawnedThisCycle = true;
        let numRaiders = 4 + Math.floor(Math.random() * 3);
        let overworldMap = engine.map;
        let teamId = 'night_squad_' + Math.floor(now / 1000);
        for (let i = 0; i < numRaiders; i++) {
            let r = Math.floor(Math.random() * overworldMap.length);
            let c = Math.floor(Math.random() * overworldMap[0].length);
            if (!isWater(overworldMap[r][c]) && overworldMap[r][c] !== 'Lava' && overworldMap[r][c] !== 'Wall') {
                engine.entities.push({
                    id: Math.random().toString(), type: 'raider', teamId: teamId, pos: {c, r}, homePos: {c, r},
                    hp: 120, maxHp: 120, speedMs: 800, lastMove: now
                });
            }
        }
        engine.log(`🚨 You stayed awake through the WHOLE night! A team of ${numRaiders} Raiders ambushes you at dawn!`);
    }

    // Slowly despawn raiders during the daytime (timeOfDay < 120)
    if (engine.timeOfDay < 120 && now - engine.lastRaiderDespawnTime >= 7000) {
        engine.lastRaiderDespawnTime = now;
        let raiders = engine.entities.filter(e => e.type === 'raider' && e.hp > 0);
        if (raiders.length > 0) {
            let fleeTarget = raiders.find(r => Hex.dist(r.pos.c, r.pos.r, engine.player.pos.c, engine.player.pos.r) > 2) || raiders[0];
            engine.entities = engine.entities.filter(e => e.id !== fleeTarget.id);
            engine.log(`☀️ As daylight fills the realm, a Raider retreats into the shadows and flees!`);
        }
    }

    // 5-Minute Royal Capital City Raid
    if (now - engine.lastRaidTime >= 300000) {
        engine.lastRaidTime = now;
        let raidCount = 8 + Math.floor(Math.random() * 4);
        let cityGates = [
            {c: 100, r: 87}, {c: 100, r: 113}, {c: 87, r: 100}, {c: 113, r: 100}
        ];
        let teamId = 'raid_team_' + Math.floor(now / 1000);
        for (let i = 0; i < raidCount; i++) {
            let gate = cityGates[i % cityGates.length];
            let spawnPos = { c: gate.c + Math.floor(Math.random()*3 - 1), r: gate.r + Math.floor(Math.random()*3 - 1) };
            engine.entities.push({
                id: Math.random().toString(), type: 'raider', teamId: teamId, pos: spawnPos, homePos: spawnPos,
                hp: 120, maxHp: 120, speedMs: 800, lastMove: now
            });
        }
        engine.log("🚨 RAID ALERT! A formidable team of heavily-armed Raiders is besieging the Royal City!");
    }

    let map = getMap(engine);

    // Slowly regenerate harvested resource tiles (Trees, BerryBushes, GoldVeins, Mountains)
    let remainingDepleted = [];
    for (let dep of engine.depletedTiles) {
        if (now - dep.harvestedAt >= 35000) {
            let dP = Hex.dist(engine.player.pos.c, engine.player.pos.r, dep.c, dep.r);
            if (dP >= 2 && !getEntities(engine).find(e => e.pos.c === dep.c && e.pos.r === dep.r)) {
                map[dep.r][dep.c] = dep.originalTile;
                continue;
            }
        }
        remainingDepleted.push(dep);
    }
    engine.depletedTiles = remainingDepleted;

    // Slowly respawn and repopulate creatures far away from player
    if (now - engine.lastCreatureRespawn >= 22000) {
        engine.lastCreatureRespawn = now;
        let overworldEnts = engine.entities;
        if (overworldEnts.length < 110) {
            let countToSpawn = Math.min(8, 110 - overworldEnts.length);
            for (let i = 0; i < countToSpawn; i++) {
                let r = Math.floor(Math.random() * engine.map.length);
                let c = Math.floor(Math.random() * engine.map[0].length);
                let pDist = Hex.dist(engine.player.pos.c, engine.player.pos.r, c, r);
                if (pDist > 16) {
                    let tile = engine.map[r][c];
                    let t: Entity['type'] | null = null;
                    if (tile === 'Plains') t = Math.random() < 0.6 ? 'deer' : 'wolf';
                    else if (tile === 'Forest' || tile === 'ForestGround') t = Math.random() < 0.5 ? 'wolf' : 'boar';
                    else if (tile === 'Sand') t = Math.random() < 0.5 ? 'scorpion' : 'rabbit';
                    else if (tile === 'Mountain' || tile === 'MountainGround') t = Math.random() < 0.6 ? 'bear' : 'eagle';
                    else if (isWater(tile)) t = Math.random() < 0.5 ? 'fish' : 'shark';

                    if (t) {
                        engine.entities.push({
                            id: Math.random().toString(), type: t, pos: {c, r}, homePos: {c, r},
                            hp: t === 'bear' ? 50 : 20, maxHp: t === 'bear' ? 50 : 20,
                            speedMs: 1200 + Math.random()*1000, lastMove: now
                        });
                    }
                }
            }
        }
    }

    // Clean up expired floating combat texts
    engine.floatingTexts = engine.floatingTexts.filter(ft => now - ft.createdAt < ft.durationMs);

    // Weather Engine System
    if (now - engine.lastWeatherChange >= 120000) {
        engine.lastWeatherChange = now;
        let weatherOptions: ('Clear' | 'Rain' | 'Snow' | 'Fog')[] = ['Clear', 'Rain', 'Snow', 'Fog'];
        let nextW = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
        engine.weather = nextW;
        if (nextW === 'Rain') engine.log("🌧️ Weather Update: Dark storm clouds roll in. Heavy rain begins to fall!");
        else if (nextW === 'Snow') engine.log("🌨️ Weather Update: Freezing arctic winds blow! Snow flurries coat the ground.");
        else if (nextW === 'Fog') engine.log("🌫️ Weather Update: Dense misty fog settles over the wilderness.");
        else engine.log("☀️ Weather Update: The sky clears up and warm sunlight fills the land.");
    }

    let playerTile = map[engine.player.pos.r]?.[engine.player.pos.c] || 'Plains';
    let playerOnWater = isWater(playerTile);
    let isFlying = engine.stats.riding && (engine.stats.riding.type === 'eagle' || engine.stats.riding.type === 'dragon');

    // Update player inventory weight
    engine.stats.weight = calculateWeight(engine.stats);

    // Survival Hunger & Thirst Simulation
    let hungerDrain = 0.12 * (dt / 1000);
    let thirstDrain = 0.22 * (dt / 1000);
    if (engine.stats.riding) { hungerDrain *= 1.4; thirstDrain *= 1.4; }

    if (engine.weather === 'Rain' && !engine.inCave && !engine.inHouse) {
        thirstDrain *= 0.3; // Rain slows dehydration
    }

    engine.stats.hunger = Math.max(0, engine.stats.hunger - hungerDrain);
    engine.stats.thirst = Math.max(0, engine.stats.thirst - thirstDrain);

    // Temperature & Environmental Insulation Calculation
    let targetTemp = 37.0;
    if (playerTile === 'Snow') targetTemp -= 7.0;
    if (playerTile === 'Sand' || playerTile === 'Lava' || playerTile === 'LavaGround') targetTemp += 6.5;
    if (!engine.inCave && !engine.inHouse && engine.timeOfDay >= 120) targetTemp -= 3.5;
    if (engine.weather === 'Snow') targetTemp -= 4.0;

    // Check nearby Campfires / Lava for thermal warmth
    let nearHeatSource = false;
    let pPos = engine.player.pos;
    for (let dr = -2; dr <= 2 && !nearHeatSource; dr++) {
        for (let dc = -2; dc <= 2 && !nearHeatSource; dc++) {
            let nr = pPos.r + dr;
            let nc = pPos.c + dc;
            if (nr >= 0 && nr < map.length && nc >= 0 && nc < map[0].length) {
                let t = map[nr][nc];
                if (t === 'Campfire' || t === 'Lava') nearHeatSource = true;
            }
        }
    }
    if (nearHeatSource) targetTemp += 10.0;

    // Armor Insulation Benefits
    let eq = engine.stats.equipment;
    if (eq.chest === 'Leather Chest' || eq.head === 'Leather Cap') targetTemp += 3.0;
    if (eq.chest === 'Iron Armor' || eq.head === 'Iron Helmet') targetTemp += 2.0;

    // Move player body temperature smoothly
    engine.stats.temperature += (targetTemp - engine.stats.temperature) * 0.1 * (dt / 1000);

    // Extreme Temperature & Starvation/Dehydration Damage Effects
    let isStarving = engine.stats.hunger <= 2;
    let isDehydrated = engine.stats.thirst <= 2;
    let isFreezing = engine.stats.temperature <= 32.0;
    let isOverheating = engine.stats.temperature >= 41.5;

    if (isStarving || isDehydrated) {
        engine.stats.hp -= 1.8 * (dt / 1000);
        if (Math.random() < 0.03) {
            engine.addFloatingText(pPos.c, pPos.r, isStarving ? '🍖 STARVING!' : '💧 DEHYDRATED!', '#ef4444');
        }
    }

    if (isFreezing || isOverheating) {
        engine.stats.hp -= 1.5 * (dt / 1000);
        if (Math.random() < 0.03) {
            engine.addFloatingText(pPos.c, pPos.r, isFreezing ? '🥶 HYPOTHERMIA!' : '🥵 HEATSTROKE!', '#38bdf8');
        }
    }

    // Stamina Regeneration / Swimming Exhaustion
    if ((!playerOnWater || engine.stats.inBoat || isFlying) && !isStarving && !isDehydrated) {
        engine.stats.stamina = Math.min(engine.stats.maxStamina, engine.stats.stamina + 6 * (dt / 1000));
    } else if (playerOnWater && !engine.stats.inBoat && !isFlying) {
        engine.stats.stamina = Math.max(0, engine.stats.stamina - 4 * (dt / 1000));
        if (engine.stats.stamina <= 0) {
            engine.stats.hp -= 3 * (dt / 1000);
            if (Math.random() < 0.04) {
                engine.addFloatingText(pPos.c, pPos.r, '🌊 DROWNING!', '#0284c7');
            }
        }
    }

    // Campfire Cooking Realism: Standing near Campfire cooks raw meat into prime meat
    if (nearHeatSource && engine.stats.inventory.meat > 0 && now - engine.lastCampfireCook >= 7000) {
        engine.lastCampfireCook = now;
        engine.stats.inventory.meat--;
        engine.stats.inventory.cooked_prime_meat++;
        engine.addFloatingText(pPos.c, pPos.r, '🔥 +1 PRIME MEAT', '#f59e0b');
        engine.log("🔥 Campfire cooked 1 Raw Meat into Cooked Prime Meat!");
    }
    
    // Regenerate gold in caves
    if (Math.random() < 0.05 * (dt / 1000)) {
        let caveIds = Object.keys(engine.caveMaps);
        if (caveIds.length > 0) {
            let randomCaveId = caveIds[Math.floor(Math.random() * caveIds.length)];
            let cmap = engine.caveMaps[randomCaveId];
            let floors = [];
            for (let r = 0; r < cmap.length; r++) {
                for (let c = 0; c < cmap[0].length; c++) {
                    if (cmap[r][c] === 'CaveFloor') floors.push({c, r});
                }
            }
            if (floors.length > 0) {
                let f = floors[Math.floor(Math.random() * floors.length)];
                cmap[f.r][f.c] = 'GoldVein';
            }
        }
    }
    
    let entities = getEntities(engine);
    
    for (let ent of entities) {
        if (now - ent.lastMove > ent.speedMs) {
            ent.lastMove = now;
            
            if (ent.hp <= 0 || ent.unconscious || ent.type === 'boat' || ent.type === 'chest') continue;

            let targets = [engine.player, ...entities.filter(e => (e.tamed || e.type === 'villager' || e.type === 'king' || e.type === 'guard') && e.hp > 0 && e.type !== 'boat' && e.id !== ent.id)];
            let nearestTarget = targets[0];
            let nearestDist = nearestTarget ? Hex.dist(ent.pos.c, ent.pos.r, nearestTarget.pos.c, nearestTarget.pos.r) : 999;
            for (let i = 1; i < targets.length; i++) {
                let d = Hex.dist(ent.pos.c, ent.pos.r, targets[i].pos.c, targets[i].pos.r);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestTarget = targets[i];
                }
            }
            
            if (ent.tamed) {
                // Tamed AI: follow player if far, attack enemies if close
                let nearestEnemy = entities.find(e => !e.tamed && e.type !== 'deer' && e.type !== 'rabbit' && e.type !== 'fish' && e.hp > 0 && !e.unconscious && Hex.dist(ent.pos.c, ent.pos.r, e.pos.c, e.pos.r) <= 1);
                if (nearestEnemy) {
                    nearestEnemy.hp -= (ent.type === 'bear' || ent.type === 'dragon' ? 20 : 8);
                    if (nearestEnemy.hp <= 0) engine.log(`Your ${ent.type} killed a ${nearestEnemy.type}!`);
                } else if (nearestDist > 2) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            let t = map[n.r][n.c];
                            if (isTileAllowedForEntity(ent, t, n)) {
                                if (!entities.find(e => e.pos.c === n.c && e.pos.r === n.r)) {
                                    let d = Hex.dist(n.c, n.r, engine.player.pos.c, engine.player.pos.r);
                                    if (d < bestDist) {
                                        bestDist = d;
                                        best = n;
                                    }
                                }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                }
            } else if (ent.type === 'dragon') {
                // DRAGON: Fire breath range attack (up to 3 hexes away)
                if (nearestDist <= 3) {
                    let fireDmg = Math.floor(35 + Math.random() * 15);
                    if (nearestTarget === engine.player) {
                        let actualDmg = Math.max(15, fireDmg - engine.stats.equipment.armorLevel * 5);
                        engine.stats.hp -= actualDmg;
                        engine.log(`🐉 FIRE BREATH! The Dragon incinerates you for ${actualDmg} damage!`);
                    } else {
                        nearestTarget.hp -= fireDmg;
                        engine.log(`🐉 The Dragon breathed fire on your ${nearestTarget.type} for ${fireDmg} damage!`);
                    }
                    if (nearestDist > 1) {
                        // Move closer to keep incinerating
                        let best = null;
                        let bestDist = 999;
                        for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                            if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                                if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                    let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                    if (d < bestDist) { bestDist = d; best = n; }
                                }
                            }
                        }
                        if (best) ent.pos = best;
                    }
                } else if (nearestDist <= 9) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                if (d < bestDist) { bestDist = d; best = n; }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n)
                    );
                    if (neighbors.length > 0) ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            } else if (ent.type === 'eagle') {
                if (nearestDist === 1) {
                    let rawDmg = 15;
                    if (nearestTarget === engine.player) {
                        let actualDmg = Math.max(5, rawDmg - engine.stats.equipment.armorLevel * 3);
                        engine.stats.hp -= actualDmg;
                        engine.log(`🦅 An Eagle swoops down and strikes you for ${actualDmg} damage!`);
                    } else {
                        nearestTarget.hp -= rawDmg;
                        engine.log(`🦅 An Eagle swooped down on your ${nearestTarget.type} for ${rawDmg} damage!`);
                    }
                } else if (nearestDist <= 6) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                if (d < bestDist) { bestDist = d; best = n; }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n)
                    );
                    if (neighbors.length > 0) ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            } else if (ent.type === 'whale') {
                if (nearestDist === 1) {
                    let rawDmg = 30;
                    if (nearestTarget === engine.player) {
                        engine.stats.hp -= rawDmg;
                        engine.log(`🐋 The Whale thrashes its massive tail for ${rawDmg} damage!`);
                    } else {
                        nearestTarget.hp -= rawDmg;
                        engine.log(`🐋 The Whale thrashing strikes your ${nearestTarget.type} for ${rawDmg} damage!`);
                    }
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n)
                    );
                    if (neighbors.length > 0) ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            } else if (ent.type === 'shark') {
                if (nearestDist === 1) {
                    let rawDmg = 18;
                    if (nearestTarget === engine.player) {
                        engine.stats.hp -= rawDmg;
                        engine.log(`🦈 A Shark bites you for ${rawDmg} damage!`);
                    } else {
                        nearestTarget.hp -= rawDmg;
                        engine.log(`🦈 A Shark bites your ${nearestTarget.type} for ${rawDmg} damage!`);
                    }
                } else if (nearestDist <= 7) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                if (d < bestDist) { bestDist = d; best = n; }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n)
                    );
                    if (neighbors.length > 0) ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            } else if (ent.type === 'wolf' || ent.type === 'bear' || ent.type === 'fox' || ent.type === 'boar' || ent.type === 'scorpion') {
                let isAggro = (ent.type !== 'boar') || (nearestDist <= 2);
                if (isAggro && nearestDist === 1) {
                    let dmg = ent.type === 'bear' ? 12 : (ent.type === 'boar' ? 8 : (ent.type === 'scorpion' ? 6 : 5));
                    if (nearestTarget === engine.player) {
                        let actualDmg = Math.max(1, dmg - getTotalArmor(engine.stats));
                        engine.stats.hp -= actualDmg;
                        engine.log(`A ${ent.type} attacked you for ${actualDmg} damage!`);
                    } else {
                        nearestTarget.hp -= dmg;
                        engine.log(`A ${ent.type} attacked your ${nearestTarget.type} for ${dmg} damage!`);
                    }
                } else if (isAggro && nearestDist < 8) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            let t = map[n.r][n.c];
                            if (isTileAllowedForEntity(ent, t, n)) {
                                if (!entities.find(e => e.pos.c === n.c && e.pos.r === n.r)) {
                                    let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                    if (d < bestDist) {
                                        bestDist = d;
                                        best = n;
                                    }
                                }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n) &&
                        !entities.find(e => e.pos.c === n.c && e.pos.r === n.r) &&
                        (engine.player.pos.c !== n.c || engine.player.pos.r !== n.r)
                    );
                    if (neighbors.length > 0) {
                        ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                    }
                }
            } else if (ent.type === 'villager') {
                // Villagers do NOT fight; they only wander peacefully near their homes.
                let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                    n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                    isTileAllowedForEntity(ent, map[n.r][n.c], n) &&
                    !entities.find(e => e.pos.c === n.c && e.pos.r === n.r) &&
                    (engine.player.pos.c !== n.c || engine.player.pos.r !== n.r)
                );
                if (neighbors.length > 0 && Math.random() < 0.5) {
                    ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            } else if (ent.type === 'crocodile') {
                let crocTargets = [engine.player, ...entities.filter(e => (e.type === 'villager' || e.type === 'guard' || e.type === 'deer' || e.type === 'raider' || e.tamed) && e.hp > 0)];
                let nearestTarget = crocTargets[0];
                let nearestDist = nearestTarget ? Hex.dist(ent.pos.c, ent.pos.r, nearestTarget.pos.c, nearestTarget.pos.r) : 999;
                for (let i = 1; i < crocTargets.length; i++) {
                    let d = Hex.dist(ent.pos.c, ent.pos.r, crocTargets[i].pos.c, crocTargets[i].pos.r);
                    if (d < nearestDist) { nearestDist = d; nearestTarget = crocTargets[i]; }
                }

                if (nearestDist === 1 && nearestTarget) {
                    if (nearestTarget === engine.player) {
                        let actualDmg = Math.max(2, 10 - getTotalArmor(engine.stats));
                        engine.stats.hp -= actualDmg;
                        engine.log(`🐊 A Crocodile snapped at you for ${actualDmg} damage!`);
                    } else {
                        nearestTarget.hp -= 12;
                        engine.log(`🐊 Crocodile attacks ${nearestTarget.type} for 12 damage!`);
                    }
                } else if (nearestDist <= 6 && nearestTarget) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n, map)) {
                                if (!entities.find(e => e.pos.c === n.c && e.pos.r === n.r)) {
                                    let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                    if (d < bestDist) { bestDist = d; best = n; }
                                }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n, map) &&
                        !entities.find(e => e.pos.c === n.c && e.pos.r === n.r)
                    );
                    if (neighbors.length > 0 && Math.random() < 0.4) {
                        ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                    }
                }
            } else if (ent.type === 'guard') {
                let isHostile = now < engine.villageHostileUntil;
                if (isHostile) {
                    let pDist = Hex.dist(ent.pos.c, ent.pos.r, engine.player.pos.c, engine.player.pos.r);
                    if (pDist === 1) {
                        let rawDmg = 12;
                        let actualDmg = Math.max(2, rawDmg - getTotalArmor(engine.stats));
                        engine.stats.hp -= actualDmg;
                        engine.log(`🛡️ Village Guard strikes you for ${actualDmg} damage!`);
                    } else if (pDist <= 12) {
                        let best = null;
                        let bestDist = 999;
                        for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                            if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                                if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                    let d = Hex.dist(n.c, n.r, engine.player.pos.c, engine.player.pos.r);
                                    if (d < bestDist) { bestDist = d; best = n; }
                                }
                            }
                        }
                        if (best) ent.pos = best;
                    }
                } else {
                    let raiders = entities.filter(e => e.type === 'raider' && e.hp > 0);
                    let nearestRaider = raiders[0];
                    let nearestRDist = nearestRaider ? Hex.dist(ent.pos.c, ent.pos.r, nearestRaider.pos.c, nearestRaider.pos.r) : 999;
                    for (let i = 1; i < raiders.length; i++) {
                        let d = Hex.dist(ent.pos.c, ent.pos.r, raiders[i].pos.c, raiders[i].pos.r);
                        if (d < nearestRDist) { nearestRDist = d; nearestRaider = raiders[i]; }
                    }

                    // Scan for broken or damaged walls within perception range (15 tiles)
                    let wallTargets: {c: number, r: number, dist: number}[] = [];
                    for (let dr = -15; dr <= 15; dr++) {
                        for (let dc = -15; dc <= 15; dc++) {
                            let nr = ent.pos.r + dr;
                            let nc = ent.pos.c + dc;
                            if (nr >= 0 && nr < map.length && nc >= 0 && nc < map[0].length) {
                                let d = Hex.dist(ent.pos.c, ent.pos.r, nc, nr);
                                if (d <= 15) {
                                    let tile = map[nr][nc];
                                    if (tile === 'Wall' && engine.getWallHp(nc, nr) < 60) {
                                        wallTargets.push({c: nc, r: nr, dist: d});
                                    } else if (tile === 'BrokenWall') {
                                        wallTargets.push({c: nc, r: nr, dist: d});
                                    }
                                }
                            }
                        }
                    }
                    wallTargets.sort((a, b) => a.dist - b.dist);
                    let closestWall = wallTargets[0];

                    if (nearestRaider && nearestRDist === 1) {
                        // Priority 1: Fight adjacent Raider
                        nearestRaider.hp -= 16;
                        if (nearestRaider.hp <= 0) engine.log("🛡️ A Royal Guard vanquished a Raider!");
                        else engine.log("🛡️ Royal Guard strikes Raider for 16 damage!");
                    } else if (closestWall && closestWall.dist <= 2) {
                        // Priority 2: Auto fix/rebuild walls within 2 tiles
                        engine.repairWall(closestWall.c, closestWall.r, 60, map);
                    } else if (closestWall && (!nearestRaider || nearestRDist > 8)) {
                        // Priority 3: Go directly to repair broken/damaged wall
                        let best = null;
                        let bestDist = 999;
                        for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                            if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                                if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                    let d = Hex.dist(n.c, n.r, closestWall.c, closestWall.r);
                                    if (d < bestDist) { bestDist = d; best = n; }
                                }
                            }
                        }
                        if (best) ent.pos = best;
                    } else if (nearestRaider && nearestRDist <= 12) {
                        // Priority 4: Pursue Raider
                        let best = null;
                        let bestDist = 999;
                        for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                            if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                                if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                    let d = Hex.dist(n.c, n.r, nearestRaider.pos.c, nearestRaider.pos.r);
                                    if (d < bestDist) { bestDist = d; best = n; }
                                }
                            }
                        }
                        if (best) ent.pos = best;
                    } else {
                        let gNeighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length);
                        let predators = ['wolf', 'bear', 'dragon'];
                        let nearestPredator = entities.find(e => predators.includes(e.type) && e.hp > 0 && !e.unconscious && Hex.dist(ent.pos.c, ent.pos.r, e.pos.c, e.pos.r) <= 1);
                        if (nearestPredator) {
                            nearestPredator.hp -= 15;
                            if (nearestPredator.hp <= 0) engine.log(`A Village Guard slain a ${nearestPredator.type}!`);
                        } else {
                            let neighbors = gNeighbors.filter(n => 
                                isTileAllowedForEntity(ent, map[n.r][n.c], n) &&
                                !entities.find(e => e.pos.c === n.c && e.pos.r === n.r) &&
                                (engine.player.pos.c !== n.c || engine.player.pos.r !== n.r)
                            );
                            if (neighbors.length > 0 && Math.random() < 0.4) {
                                ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                            }
                        }
                    }
                }
            } else if (ent.type === 'raider') {
                let rTargets = [engine.player, ...entities.filter(e => (e.type === 'king' || e.type === 'guard' || e.type === 'villager' || e.tamed) && e.hp > 0 && e.id !== ent.id)];
                let nearestT = rTargets[0];
                let nDist = nearestT ? Hex.dist(ent.pos.c, ent.pos.r, nearestT.pos.c, nearestT.pos.r) : 999;
                for (let i = 1; i < rTargets.length; i++) {
                    let d = Hex.dist(ent.pos.c, ent.pos.r, rTargets[i].pos.c, rTargets[i].pos.r);
                    if (d < nDist) { nDist = d; nearestT = rTargets[i]; }
                }

                let rNeighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length);

                // 1. Raiders actively bust ANY wall they come in contact with!
                let adjWall = rNeighbors.find(n => map[n.r][n.c] === 'Wall');
                if (adjWall) {
                    engine.damageWall(adjWall.c, adjWall.r, 22, map);
                    engine.log("💥 Raider team member is smashing down a Wall!");
                }

                // 2. Raider tames & mounts wild deer
                if (!ent.riding) {
                    let nearbyDeer = entities.find(e => e.type === 'deer' && !e.tamed && e.hp > 0 && Hex.dist(ent.pos.c, ent.pos.r, e.pos.c, e.pos.r) === 1);
                    if (nearbyDeer) {
                        ent.riding = 'deer';
                        ent.speedMs = 600;
                        setEntities(engine, getEntities(engine).filter(e => e !== nearbyDeer));
                        engine.log("⚔️ A Raider tame-mounted a wild Deer!");
                    }
                }

                // 3. Raider cuts timber & builds boats when encountering water
                if (nearestT && nDist <= 12 && !ent.inBoat && !ent.riding) {
                    let waterAdj = rNeighbors.find(n => isWater(map[n.r][n.c]));
                    if (waterAdj) {
                        let forestAdj = rNeighbors.find(n => map[n.r][n.c] === 'Forest');
                        if (forestAdj) {
                            map[forestAdj.r][forestAdj.c] = 'ForestGround';
                            engine.depletedTiles.push({ c: forestAdj.c, r: forestAdj.r, originalTile: 'Forest', harvestedAt: now });
                            ent.inBoat = true;
                            engine.log("🪓 A Raider chopped down trees to build a Boat!");
                        }
                    }
                }

                if (nDist === 1 && nearestT) {
                    let rDmg = 24; // Raiders deal 24 damage (stronger than guards who deal 18)
                    if (nearestT === engine.player) {
                        let actualDmg = Math.max(4, rDmg - getTotalArmor(engine.stats));
                        engine.stats.hp -= actualDmg;
                        engine.log(`⚔️ Raider strikes you for ${actualDmg} damage!`);
                    } else {
                        nearestT.hp -= rDmg;
                        if (nearestT.type === 'king' && nearestT.hp <= 0) {
                            engine.kingDead = true;
                            engine.log("👑 THE KING HAS BEEN SLAIN BY RAIDERS!");
                        } else {
                            engine.log(`⚔️ Raider attacks ${nearestT.type} for ${rDmg} damage!`);
                        }
                    }
                } else if (nDist <= 16 && nearestT) {
                    let best = null;
                    let bestDist = 999;
                    let blockingWall: Position | null = null;
                    for (let n of rNeighbors) {
                        let tile = map[n.r][n.c];
                        let d = Hex.dist(n.c, n.r, nearestT.pos.c, nearestT.pos.r);
                        if (isTileAllowedForEntity(ent, tile, n)) {
                            if (d < bestDist) { bestDist = d; best = n; }
                        } else if (tile === 'Wall' && d < nDist) {
                            blockingWall = n;
                        }
                    }
                    if (best) {
                        ent.pos = best;
                    } else if (blockingWall) {
                        engine.damageWall(blockingWall.c, blockingWall.r, 22, map);
                        engine.log("💥 Raider team is hacking through a City Wall!");
                    }
                } else {
                    // Team cohesion: move towards team members if far from enemies
                    let teamMates = ent.teamId ? entities.filter(e => e.type === 'raider' && e.teamId === ent.teamId && e.id !== ent.id && e.hp > 0) : [];
                    if (teamMates.length > 0) {
                        let lead = teamMates[0];
                        let best = null;
                        let bestDist = 999;
                        for (let n of rNeighbors) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                let d = Hex.dist(n.c, n.r, lead.pos.c, lead.pos.r);
                                if (d < bestDist) { bestDist = d; best = n; }
                            }
                        }
                        if (best) ent.pos = best;
                    } else {
                        let validN = rNeighbors.filter(n => isTileAllowedForEntity(ent, map[n.r][n.c], n));
                        if (validN.length > 0 && Math.random() < 0.5) {
                            ent.pos = validN[Math.floor(Math.random() * validN.length)];
                        }
                    }
                }
            } else if (ent.type === 'king') {
                let raiders = entities.filter(e => e.type === 'raider' && e.hp > 0);
                let nearestR = raiders[0];
                let nearestRDist = nearestR ? Hex.dist(ent.pos.c, ent.pos.r, nearestR.pos.c, nearestR.pos.r) : 999;
                for (let i = 1; i < raiders.length; i++) {
                    let d = Hex.dist(ent.pos.c, ent.pos.r, raiders[i].pos.c, raiders[i].pos.r);
                    if (d < nearestRDist) { nearestRDist = d; nearestR = raiders[i]; }
                }

                if (nearestR && nearestRDist === 1) {
                    nearestR.hp -= 22;
                    engine.log(`👑 The King strikes a Raider with his Royal Blade for 22 damage!`);
                } else if (nearestR && nearestRDist <= 12) {
                    let best = null;
                    let bestDist = 999;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                                let d = Hex.dist(n.c, n.r, nearestR.pos.c, nearestR.pos.r);
                                if (d < bestDist) { bestDist = d; best = n; }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let kNeighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n) &&
                        !entities.find(e => e.pos.c === n.c && e.pos.r === n.r) &&
                        Hex.dist(n.c, n.r, 100, 100) <= 12
                    );
                    if (kNeighbors.length > 0 && Math.random() < 0.35) {
                        ent.pos = kNeighbors[Math.floor(Math.random() * kNeighbors.length)];
                    }
                }
            } else if (ent.type === 'trex') {
                let targets = [engine.player, ...entities.filter(e => (e.type === 'villager' || e.type === 'guard' || e.type === 'raider' || e.type === 'king' || e.tamed) && e.hp > 0 && e.id !== ent.id)];
                let nearestT = targets[0];
                let nDist = nearestT ? Hex.dist(ent.pos.c, ent.pos.r, nearestT.pos.c, nearestT.pos.r) : 999;
                for (let i = 1; i < targets.length; i++) {
                    let d = Hex.dist(ent.pos.c, ent.pos.r, targets[i].pos.c, targets[i].pos.r);
                    if (d < nDist) { nDist = d; nearestT = targets[i]; }
                }
                if (nearestT && nDist === 1) {
                    let tDmg = 45;
                    if (nearestT === engine.player) {
                        let actual = Math.max(8, tDmg - getTotalArmor(engine.stats) * 2);
                        engine.stats.hp -= actual;
                        engine.log(`🦖 Apex T-Rex devours you for ${actual} damage!`);
                    } else {
                        nearestT.hp -= tDmg;
                        engine.log(`🦖 Apex T-Rex bites ${nearestT.type} for ${tDmg} damage!`);
                    }
                } else if (nearestT && nDist <= 10) {
                    let best = null;
                    let bestDist = 999;
                    let tNeighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length);
                    for (let n of tNeighbors) {
                        if (isTileAllowedForEntity(ent, map[n.r][n.c], n)) {
                            let d = Hex.dist(n.c, n.r, nearestT.pos.c, nearestT.pos.r);
                            if (d < bestDist) { bestDist = d; best = n; }
                        }
                    }
                    if (best) ent.pos = best;
                }
            } else if (ent.type === 'deer' || ent.type === 'rabbit' || ent.type === 'fish') {
                if (nearestDist < 5 && ent.type !== 'fish') {
                    let best = null;
                    let bestDist = -1;
                    for (let n of getNeighbors(ent.pos.c, ent.pos.r)) {
                        if (n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length) {
                            let t = map[n.r][n.c];
                            if (isTileAllowedForEntity(ent, t, n)) {
                                if (!entities.find(e => e.pos.c === n.c && e.pos.r === n.r)) {
                                    let d = Hex.dist(n.c, n.r, nearestTarget.pos.c, nearestTarget.pos.r);
                                    if (d > bestDist) {
                                        bestDist = d;
                                        best = n;
                                    }
                                }
                            }
                        }
                    }
                    if (best) ent.pos = best;
                } else {
                    let neighbors = getNeighbors(ent.pos.c, ent.pos.r).filter(n => 
                        n.r >= 0 && n.r < map.length && n.c >= 0 && n.c < map[0].length &&
                        isTileAllowedForEntity(ent, map[n.r][n.c], n) &&
                        !entities.find(e => e.pos.c === n.c && e.pos.r === n.r) &&
                        (engine.player.pos.c !== n.c || engine.player.pos.r !== n.r)
                    );
                    if (neighbors.length > 0) {
                        ent.pos = neighbors[Math.floor(Math.random() * neighbors.length)];
                    }
                }
            }
        }
    }

    // Coronation Check: If King died and player cleared remaining raiders, player becomes King!
    if (engine.kingDead) {
        let activeRaiders = getEntities(engine).filter(e => e.type === 'raider' && e.hp > 0).length;
        if (activeRaiders === 0) {
            engine.isKing = true;
            engine.kingDead = false;
            engine.log("👑 VICTORY! The King has fallen and you defeated the Raiders! YOU ARE NOW THE KING OF THE REALM!");
        }
    }

    setEntities(engine, getEntities(engine).filter(e => e.hp > 0));
}

export function updateCamera(engine: GameEngine, dt: number) {
    let ppx = Hex.getPixel(engine.player.pos.c, engine.player.pos.r);
    engine.camera.x += (ppx.x - engine.camera.x) * 10 * (dt / 1000);
    engine.camera.y += (ppx.y - engine.camera.y) * 10 * (dt / 1000);
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

const TILE_EMOJIS: Record<TileType, string> = {
    Plains: '',
    ForestGround: '',
    MountainGround: '',
    LavaGround: '',
    Forest: '',
    Mountain: '',
    Water: '',
    WaterShallow: '',
    WaterMedium: '',
    WaterDeep: '',
    CaveEntrance: '🕳️',
    CaveFloor: '',
    CaveWall: '🧱',
    GoldVein: '',
    Wall: '🧱',
    BrokenWall: '🩷',
    Campfire: '🔥',
    Sand: '',
    BerryBush: '',
    Snow: '',
    Lava: '',
    House: '🏠',
    HouseFloor: '',
    HouseDoor: '🚪',
    CraftingTable: '🛠️',
    Palace: '🏰',
    PalaceDoor: '🚪',
    PalaceFloor: '👑',
    Bed: '🛏️'
};

function drawHexTerrain(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: TileType, c: number, r: number, timeMs: number) {
    let h = hash2D(c * 17.3 + 3.1, r * 31.7 + 7.9);
    let baseHexColor = TILE_COLORS[tile] || '#3f7032';
    
    // Per-hex natural color variation (±7%)
    let varFactor = 0.93 + h * 0.14;
    let fillStyle = adjustColor(baseHexColor, varFactor);
    
    let size = Hex.size;
    
    // 1. Draw base Hex Polygon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        let a = Math.PI / 180 * (60 * i - 30);
        let x = cx + size * Math.cos(a);
        let y = cy + size * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    
    // 2. 3D Bevel Relief Shading
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    for (let i = 3; i <= 6; i++) {
        let idx = i % 6;
        let a = Math.PI / 180 * (60 * idx - 30);
        let x = cx + size * Math.cos(a);
        let y = cy + size * Math.sin(a);
        if (i === 3) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
        let a = Math.PI / 180 * (60 * i - 30);
        let x = cx + size * Math.cos(a);
        let y = cy + size * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Tile Micro-Textures & Natural Decorative Details
    if (tile === 'Plains') {
        ctx.fillStyle = adjustColor('#4f8c40', 0.85 + h * 0.3);
        let count = 2 + Math.floor(h * 3);
        for (let i = 0; i < count; i++) {
            let gx = cx + (hash2D(c * 3 + i, r * 5) - 0.5) * (size * 1.1);
            let gy = cy + (hash2D(c * 7, r * 2 + i) - 0.5) * (size * 1.1);
            ctx.beginPath();
            ctx.arc(gx, gy, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
        if (h > 0.72) {
            ctx.fillStyle = h > 0.86 ? '#fef08a' : '#bfdbfe';
            let fx = cx + (h - 0.5) * 16;
            let fy = cy + (hash2D(c, r) - 0.5) * 16;
            ctx.beginPath();
            ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (tile === 'Forest' || tile === 'ForestGround') {
        let treeCount = tile === 'Forest' ? 3 : 1;
        for (let i = 0; i < treeCount; i++) {
            let tx = cx + (hash2D(c * 11 + i, r * 7) - 0.5) * 22;
            let ty = cy + (hash2D(c * 5, r * 13 + i) - 0.5) * 22;
            let treeSize = 8 + hash2D(c + i, r) * 6;
            
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(tx, ty + treeSize * 0.5, treeSize * 0.7, treeSize * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = i % 2 === 0 ? '#1b401d' : '#143316';
            ctx.beginPath();
            ctx.moveTo(tx, ty - treeSize);
            ctx.lineTo(tx - treeSize * 0.65, ty + treeSize * 0.4);
            ctx.lineTo(tx + treeSize * 0.65, ty + treeSize * 0.4);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#2f6333';
            ctx.beginPath();
            ctx.moveTo(tx, ty - treeSize);
            ctx.lineTo(tx - treeSize * 0.35, ty - treeSize * 0.2);
            ctx.lineTo(tx, ty - treeSize * 0.2);
            ctx.closePath();
            ctx.fill();
        }
    } else if (tile === 'Mountain' || tile === 'MountainGround') {
        let peakX = cx + (h - 0.5) * 6;
        let peakY = cy - 10;
        
        ctx.fillStyle = '#2e353d';
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(cx + 16, cy + 12);
        ctx.lineTo(cx, cy + 14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#7a8591';
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(cx - 16, cy + 12);
        ctx.lineTo(cx, cy + 14);
        ctx.closePath();
        ctx.fill();

        if (tile === 'Mountain' && h > 0.3) {
            ctx.fillStyle = '#f1f5f9';
            ctx.beginPath();
            ctx.moveTo(peakX, peakY);
            ctx.lineTo(peakX - 6, peakY + 8);
            ctx.lineTo(peakX + 6, peakY + 8);
            ctx.closePath();
            ctx.fill();
        }
    } else if (tile === 'Snow') {
        ctx.strokeStyle = 'rgba(195, 221, 240, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 4);
        ctx.lineTo(cx + 8, cy + 6);
        ctx.stroke();
    } else if (tile === 'Sand') {
        ctx.strokeStyle = 'rgba(180, 130, 60, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 12, 0.2, Math.PI * 0.7);
        ctx.stroke();
    } else if (isWater(tile)) {
        let shimmerOffset = Math.sin((timeMs * 0.002) + (c * 0.8) + (r * 0.6));
        ctx.strokeStyle = tile === 'WaterShallow' ? 'rgba(255, 255, 255, 0.38)' : 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let wx = cx + shimmerOffset * 5;
        let wy = cy + (h - 0.5) * 10;
        ctx.moveTo(wx - 8, wy);
        ctx.quadraticCurveTo(wx, wy - 3, wx + 8, wy);
        ctx.stroke();
    } else if (tile === 'Lava' || tile === 'LavaGround') {
        let pulse = (Math.sin(timeMs * 0.004 + c + r) + 1) / 2;
        if (tile === 'Lava') {
            let grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
            grad.addColorStop(0, '#fef08a');
            grad.addColorStop(0.5, '#f97316');
            grad.addColorStop(1, '#b91c1c');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, 14 + pulse * 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = `rgba(249, 115, 22, ${0.4 + pulse * 0.4})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy - 6);
            ctx.lineTo(cx, cy + 2);
            ctx.lineTo(cx + 8, cy - 4);
            ctx.stroke();
        }
    } else if (tile === 'GoldVein') {
        let glint = (Math.sin(timeMs * 0.005 + c * 3 + r) + 1) / 2;
        ctx.fillStyle = glint > 0.5 ? '#fef08a' : '#ca8a04';
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 5, cy + 3, 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (tile === 'BerryBush') {
        ctx.fillStyle = '#234218';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9333ea';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 3, cy + 2, 2.5, 0, Math.PI * 2);
        ctx.arc(cx, cy + 4, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawRealisticEntity(ctx: CanvasRenderingContext2D, ent: Entity, engine: GameEngine, timeMs: number) {
    if (ent.hp <= 0) return;
    let {x, y} = Hex.getPixel(ent.pos.c, ent.pos.r);
    let h = hash2D(ent.pos.c * 13.1, ent.pos.r * 19.3);
    let breath = Math.sin((timeMs * 0.003) + h * 10) * 2;
    
    let isAir = ent.type === 'eagle' || ent.type === 'dragon';
    let isWater = ent.type === 'whale' || ent.type === 'shark' || ent.type === 'fish' || ent.type === 'boat';
    
    // 1. Realistic Ground / Water Shadows & Ripple Effects
    if (isAir) {
        let shadowRadX = ent.type === 'dragon' ? 18 : 10;
        let grad = ctx.createRadialGradient(x, y + 18, 2, x, y + 18, shadowRadX);
        grad.addColorStop(0, 'rgba(0,0,0,0.42)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y + 18, shadowRadX, shadowRadX * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (isWater) {
        let ripplePhase = (timeMs * 0.002 + h * 5) % (Math.PI * 2);
        let rippleRad = 10 + Math.sin(ripplePhase) * 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y + 4, rippleRad, rippleRad * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        let shadowRadX = 11;
        let shadowRadY = 5;
        if (ent.type === 'trex') { shadowRadX = 22; shadowRadY = 8; }
        else if (ent.type === 'bear') { shadowRadX = 16; shadowRadY = 6; }
        else if (ent.type === 'rabbit') { shadowRadX = 6; shadowRadY = 3; }
        
        let grad = ctx.createRadialGradient(x, y + 8, 2, x, y + 8, shadowRadX);
        grad.addColorStop(0, 'rgba(0,0,0,0.5)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y + 8, shadowRadX, shadowRadY, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2. Creature Threat / Faction Backdrop Auras
    if (ent.type === 'trex') {
        let pulse = (Math.sin(timeMs * 0.005) + 1) / 2;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.35 + pulse * 0.35})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 22 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
    } else if (ent.type === 'dragon') {
        let pulse = (Math.sin(timeMs * 0.006) + 1) / 2;
        ctx.strokeStyle = `rgba(249, 115, 22, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 10, 24 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
    } else if (ent.type === 'raider') {
        ctx.fillStyle = 'rgba(153, 27, 27, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
    } else if (ent.type === 'guard') {
        ctx.fillStyle = 'rgba(30, 58, 138, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Render Creature / Unit Model
    let drawY = isAir ? y - 14 + breath : y + breath;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let emoji = '🐺';
    let size = 28;
    if (ent.type === 'deer') emoji = '🦌';
    if (ent.type === 'bear') { emoji = '🐻'; size = 32; }
    if (ent.type === 'rabbit') { emoji = '🐇'; size = 22; }
    if (ent.type === 'scorpion') emoji = '🦂';
    if (ent.type === 'boar') emoji = '🐗';
    if (ent.type === 'fox') emoji = '🦊';
    if (ent.type === 'boat') emoji = '🛶';
    if (ent.type === 'eagle') { emoji = '🦅'; size = 32; }
    if (ent.type === 'dragon') { emoji = '🐉'; size = 38; }
    if (ent.type === 'whale') { emoji = '🐋'; size = 36; }
    if (ent.type === 'fish') { emoji = '🐟'; size = 20; }
    if (ent.type === 'shark') { emoji = '🦈'; size = 30; }
    if (ent.type === 'villager') emoji = '🧙‍♂️';
    if (ent.type === 'guard') emoji = '🛡️';
    if (ent.type === 'chest') emoji = '🧰';
    if (ent.type === 'raider') emoji = '🥷';
    if (ent.type === 'king') emoji = '👑';
    if (ent.type === 'crocodile') emoji = '🐊';
    if (ent.type === 'trex') { emoji = '🦖'; size = 40; }

    if (ent.type === 'raider' && ent.riding === 'deer') {
        ctx.font = '32px Arial';
        ctx.fillText('🦌', x, drawY);
        ctx.font = '20px Arial';
        ctx.fillText('🥷', x, drawY - 10);
    } else if (ent.type === 'raider' && ent.inBoat) {
        ctx.font = '32px Arial';
        ctx.fillText('🛶', x, drawY);
        ctx.font = '20px Arial';
        ctx.fillText('🥷', x, drawY - 10);
    } else {
        ctx.font = `${size}px Arial`;
        ctx.fillText(emoji, x, drawY);
    }

    // 4. Status Badges & Indicators
    if (ent.unconscious) {
        let zY = y - 20 - Math.abs(Math.sin(timeMs * 0.003)) * 6;
        ctx.font = '14px Arial';
        ctx.fillText('💤', x + 16, zY);
        let prog = ent.tamingProgress || 0;
        if (prog > 0) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            if (ctx.roundRect) ctx.roundRect(x - 18, y - 28, 36, 7, 3);
            else ctx.fillRect(x - 18, y - 28, 36, 7);
            ctx.fill();
            ctx.fillStyle = '#c084fc';
            if (ctx.roundRect) ctx.roundRect(x - 17, y - 27, 34 * (prog / 100), 5, 2);
            else ctx.fillRect(x - 17, y - 27, 34 * (prog / 100), 5);
            ctx.fill();
            ctx.strokeStyle = '#e9d5ff';
            ctx.lineWidth = 1;
            if (ctx.roundRect) ctx.roundRect(x - 18, y - 28, 36, 7, 3);
            else ctx.strokeRect(x - 18, y - 28, 36, 7);
            ctx.stroke();
        }
    } else if (ent.tamed) {
        ctx.font = '16px Arial';
        ctx.fillText('❤️', x, y - 22);
    } else if (ent.type === 'guard' && Date.now() < engine.villageHostileUntil) {
        ctx.font = '14px Arial';
        ctx.fillText('😡', x, y - 22);
    } else if (ent.type === 'villager' && ent.trade) {
        ctx.font = '10px Arial';
        ctx.fillStyle = '#fcd34d';
        let tradeStr = ent.trade.replace('Buy ', '');
        ctx.fillText(tradeStr, x, y - 22);
    }

    // 5. Metallic High-Contrast Health Bar
    if (ent.type !== 'boat' && ent.type !== 'chest') {
        let barW = (ent.type === 'trex' || ent.type === 'dragon' || ent.type === 'whale') ? 34 : 24;
        let barX = x - barW / 2;
        let barY = y + 16;
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        if (ctx.roundRect) ctx.roundRect(barX - 1, barY - 1, barW + 2, 6, 3);
        else ctx.fillRect(barX - 1, barY - 1, barW + 2, 6);
        ctx.fill();
        
        let hpPct = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
        let hpColor = ent.tamed ? '#0284c7' : (hpPct > 0.5 ? '#22c55e' : (hpPct > 0.25 ? '#eab308' : '#ef4444'));
        ctx.fillStyle = hpColor;
        if (barW * hpPct > 0) {
            if (ctx.roundRect) ctx.roundRect(barX, barY, barW * hpPct, 4, 2);
            else ctx.fillRect(barX, barY, barW * hpPct, 4);
            ctx.fill();
        }
    }
}

function drawRealisticPlayer(ctx: CanvasRenderingContext2D, engine: GameEngine, timeMs: number) {
    let ppos = Hex.getPixel(engine.player.pos.c, engine.player.pos.r);
    let pBreath = Math.sin(timeMs * 0.003) * 2;
    let x = ppos.x;
    let y = ppos.y;
    
    // 1. Player Ground Contact Shadow
    let grad = ctx.createRadialGradient(x, y + 8, 2, x, y + 8, 12);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Equipped Armor Defensive Shield / Glow Overlay
    let eq = engine.stats.equipment;
    if (eq && (eq.head !== 'None' || eq.chest !== 'None')) {
        let auraColor = 'rgba(148, 163, 184, 0.3)';
        if (eq.chest === 'Iron Armor' || eq.head === 'Iron Helmet') auraColor = 'rgba(56, 189, 248, 0.35)';
        else if (eq.chest === 'Chitin Chest' || eq.head === 'Chitin Helmet') auraColor = 'rgba(234, 179, 8, 0.35)';
        
        ctx.fillStyle = auraColor;
        ctx.beginPath();
        ctx.arc(x, y - 2 + pBreath, 16, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Main Player Model / Mount Stack
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let pEmoji = engine.isKing ? '👑' : '👨‍🌾';

    if (engine.stats.riding) {
        let rType = engine.stats.riding.type;
        let rEmoji = '🦌';
        if (rType === 'bear') rEmoji = '🐻';
        if (rType === 'eagle') rEmoji = '🦅';
        if (rType === 'dragon') rEmoji = '🐉';
        if (rType === 'boat') rEmoji = '🛶';
        ctx.font = '36px Arial';
        ctx.fillText(rEmoji, x, y - 2 + pBreath);
        ctx.font = '20px Arial';
        ctx.fillText(pEmoji, x, y - 14 + pBreath);
    } else if (engine.stats.inBoat) {
        ctx.font = '36px Arial';
        ctx.fillText('🛶', x, y - 2 + pBreath);
        ctx.font = '20px Arial';
        ctx.fillText(pEmoji, x, y - 14 + pBreath);
    } else {
        ctx.font = '32px Arial';
        ctx.fillText(pEmoji, x, y - 2 + pBreath);
    }

    // 4. Equipped Weapon Hand Indicator
    let heldWeapon = '';
    if (eq) {
        if (eq.swordLevel > 0) heldWeapon = '🗡️';
        else if (eq.bow) heldWeapon = '🏹';
        else if (eq.axeLevel > 0) heldWeapon = '🪓';
        else if (eq.pickaxeLevel > 0) heldWeapon = '⛏️';
        else if (eq.clubLevel > 0) heldWeapon = '🪵';
    }

    if (heldWeapon) {
        ctx.font = '14px Arial';
        ctx.fillText(heldWeapon, x + 14, y - 10 + pBreath);
    }

    // 5. Equipped Helmet Overlay
    if (eq && eq.head && eq.head !== 'None') {
        let helmSymbol = '🧢';
        if (eq.head === 'Leather Cap') helmSymbol = '🪖';
        else if (eq.head === 'Chitin Helmet') helmSymbol = '🪖';
        else if (eq.head === 'Iron Helmet') helmSymbol = '🪖';
        
        ctx.font = '12px Arial';
        ctx.fillText(helmSymbol, x, y - 20 + pBreath);
    }
}

export function render(ctx: CanvasRenderingContext2D, engine: GameEngine, width: number, height: number, hoverHex: Position | null) {
    ctx.fillStyle = engine.inCave ? '#0a0a0a' : engine.inHouse ? '#451a03' : '#1c1917'; // stone-950 or house floor bg
    ctx.fillRect(0, 0, width, height);
    
    let map = getMap(engine);
    let entities = getEntities(engine);
    
    let camX = engine.camera.x;
    let camY = engine.camera.y;
    let timeMs = Date.now();
    
    ctx.save();
    ctx.translate(width/2 - camX, height/2 - camY);
    
    let startR = Math.max(0, Math.floor((camY - height/2) / (Hex.height() * 0.75)) - 1);
    let endR = Math.min(map.length - 1, Math.ceil((camY + height/2) / (Hex.height() * 0.75)) + 1);
    let startC = Math.max(0, Math.floor((camX - width/2) / Hex.width()) - 1);
    let endC = Math.min(map[0].length - 1, Math.ceil((camX + width/2) / Hex.width()) + 1);
    
    for (let r = startR; r <= endR; r++) {
        for (let c = startC; c <= endC; c++) {
            let tile = map[r][c];
            let {x, y} = Hex.getPixel(c, r);
            
            drawHexTerrain(ctx, x, y, tile, c, r, timeMs);
            
            if (TILE_EMOJIS[tile]) {
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(TILE_EMOJIS[tile], x, y + 2);
            }
        }
    }
    
    for (let ent of entities) {
        drawRealisticEntity(ctx, ent, engine, timeMs);
    }
    
    drawRealisticPlayer(ctx, engine, timeMs);
    let ppos = Hex.getPixel(engine.player.pos.c, engine.player.pos.r);

    // Night atmosphere overlay over the canvas with dynamic limited vision
    if (!engine.inCave && !engine.inHouse && engine.timeOfDay >= 120) {
        let nightProgress = Math.sin(((engine.timeOfDay - 120) / 120) * Math.PI);
        let baseDarkness = 0.72 + nightProgress * 0.23;
        
        let viewLeft = camX - width/2;
        let viewTop = camY - height/2;

        let nightCanvas = document.createElement('canvas');
        nightCanvas.width = width;
        nightCanvas.height = height;
        let nctx = nightCanvas.getContext('2d');

        if (nctx) {
            nctx.fillStyle = `rgba(5, 8, 22, ${baseDarkness})`;
            nctx.fillRect(0, 0, width, height);

            nctx.globalCompositeOperation = 'destination-out';

            let pSx = ppos.x - viewLeft;
            let pSy = ppos.y - viewTop;
            let playerRad = 210 - nightProgress * 30;

            let gradP = nctx.createRadialGradient(pSx, pSy, 20, pSx, pSy, playerRad);
            gradP.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            gradP.addColorStop(0.5, 'rgba(0, 0, 0, 0.7)');
            gradP.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
            nctx.fillStyle = gradP;
            nctx.beginPath();
            nctx.arc(pSx, pSy, playerRad, 0, Math.PI * 2);
            nctx.fill();

            for (let r = startR; r <= endR; r++) {
                for (let c = startC; c <= endC; c++) {
                    let t = map[r][c];
                    if (t === 'Campfire' || t === 'Lava' || t === 'Palace' || t === 'Bed') {
                        let {x, y} = Hex.getPixel(c, r);
                        let sx = x - viewLeft;
                        let sy = y - viewTop;
                        let lightRad = t === 'Lava' ? 150 : t === 'Campfire' ? 190 : 170;
                        let gradF = nctx.createRadialGradient(sx, sy, 10, sx, sy, lightRad);
                        gradF.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
                        gradF.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
                        gradF.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
                        nctx.fillStyle = gradF;
                        nctx.beginPath();
                        nctx.arc(sx, sy, lightRad, 0, Math.PI * 2);
                        nctx.fill();
                    }
                }
            }

            ctx.drawImage(nightCanvas, viewLeft, viewTop);
        }
    }
    
    // Draw active path trail
    if (engine.playerPath && engine.playerPath.length > 0) {
        ctx.save();
        ctx.beginPath();
        let pPos = engine.player.pos;
        let startPx = Hex.getPixel(pPos.c, pPos.r);
        ctx.moveTo(startPx.x, startPx.y);

        for (let i = 0; i < engine.playerPath.length; i++) {
            let px = Hex.getPixel(engine.playerPath[i].c, engine.playerPath[i].r);
            ctx.lineTo(px.x, px.y);
        }
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();

        for (let i = 0; i < engine.playerPath.length; i++) {
            let px = Hex.getPixel(engine.playerPath[i].c, engine.playerPath[i].r);
            ctx.beginPath();
            ctx.arc(px.x, px.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#fbbf24';
            ctx.fill();
        }
        ctx.restore();
    }

    if (engine.targetHex) {
        let tPx = Hex.getPixel(engine.targetHex.c, engine.targetHex.r);
        Hex.draw(ctx, tPx.x, tPx.y, 'rgba(245, 158, 11, 0.25)', '#f59e0b', 3);
    }

    if (hoverHex) {
        let {x, y} = Hex.getPixel(hoverHex.c, hoverHex.r);
        Hex.draw(ctx, x, y, 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.8)', 2);
    }
    
    ctx.restore();
}

export function getHexFromPixel(engine: GameEngine, mx: number, my: number, width: number, height: number): Position {
    let worldX = mx - width/2 + engine.camera.x;
    let worldY = my - height/2 + engine.camera.y;
    let grid = Hex.getGrid(worldX, worldY);
    return {c: grid.col, r: grid.row};
}

export function handleHexClick(engine: GameEngine, hex: Position, activeItem?: string | null) {
    if (engine.stats.hp <= 0) return;
    
    let map = getMap(engine);
    let entities = getEntities(engine);
    
    if (hex.r < 0 || hex.r >= map.length || hex.c < 0 || hex.c >= map[0].length) return;
    
    let dist = Hex.dist(engine.player.pos.c, engine.player.pos.r, hex.c, hex.r);
    
    let tile = map[hex.r][hex.c];
    let targetEnt = entities.find(e => e.hp > 0 && e.pos.c === hex.c && e.pos.r === hex.r);
    
    // Bow & Tranq Arrow shooting
    if ((activeItem === 'Bow' || activeItem === 'tranq_arrows') && engine.stats.equipment.bow && dist > 1 && dist <= 5 && targetEnt && !targetEnt.tamed) {
        if (activeItem === 'tranq_arrows' || (activeItem === 'Bow' && engine.stats.inventory.tranq_arrows > 0 && engine.stats.inventory.arrows === 0)) {
            if (engine.stats.inventory.tranq_arrows > 0) {
                engine.stats.inventory.tranq_arrows--;
                targetEnt.unconscious = true;
                targetEnt.tamingProgress = targetEnt.tamingProgress || 0;
                engine.log(`🎯 Shot ${targetEnt.type} with a Tranq Arrow! Knocked unconscious for taming!`);
            } else {
                engine.log("No Tranq Arrows left!");
            }
        } else if (engine.stats.inventory.arrows > 0) {
            engine.stats.inventory.arrows--;
            targetEnt.hp -= 15;
            engine.log(`Shot ${targetEnt.type} with an arrow for 15 damage.`);
            if (targetEnt.hp <= 0) {
                if (targetEnt.type === 'whale') {
                    engine.log(`Slain ${targetEnt.type}. Found whale meat!`);
                    engine.stats.inventory.whale_meat++;
                } else {
                    engine.log(`Slain ${targetEnt.type}. Found meat!`);
                    engine.stats.inventory.meat++;
                }
            }
        } else {
            engine.log("No arrows left!");
        }
        return;
    }
    
    let maxDist = 1;
    if ((activeItem === 'Bow' || activeItem === 'tranq_arrows') && engine.stats.equipment.bow) {
        maxDist = 5;
    } else if (engine.stats.riding) {
        if (engine.stats.riding.type === 'dragon' && targetEnt) maxDist = 3;
        else if (engine.stats.riding.type === 'eagle' && targetEnt) maxDist = 2;
        else if (!targetEnt && tile !== 'Forest' && tile !== 'Mountain' && tile !== 'GoldVein' && tile !== 'BerryBush') maxDist = 2;
    }

    if (dist > maxDist) {
        let path = findPathAStar(engine, engine.player.pos, hex);
        if (path && path.length > 0) {
            engine.playerPath = path;
            engine.targetHex = hex;
            engine.pendingActionItem = activeItem || null;
            engine.log(`Pathing to (${hex.c}, ${hex.r})...`);
        } else {
            engine.log("No valid path to selected hex.");
        }
        return;
    } else {
        engine.playerPath = [];
        engine.targetHex = null;
        engine.pendingActionItem = null;
    }
    
    if (targetEnt) {
        if (targetEnt.type === 'whale' && engine.stats.riding && engine.stats.riding.type === 'eagle') {
            engine.log("An eagle cannot hunt a whale!");
            return;
        }

        // MOUNTED ATTACKS (Dragon fire breath, Eagle aerial swoop, Bear/Deer charge)
        if (engine.stats.riding && !targetEnt.tamed) {
            let rType = engine.stats.riding.type;
            if (rType === 'dragon') {
                if (dist <= 3) {
                    if (engine.stats.stamina >= 10) {
                        engine.stats.stamina -= 10;
                        let fireDmg = Math.floor(35 + Math.random() * 20);
                        targetEnt.hp -= fireDmg;
                        engine.log(`🐉 FIRE BREATH! Your Dragon incinerates the ${targetEnt.type} for ${fireDmg} damage!`);
                        if (targetEnt.type === 'villager' || targetEnt.type === 'guard') {
                            engine.villageHostileUntil = Date.now() + 30000;
                            engine.wasHostile = true;
                        }
                        if (targetEnt.hp <= 0) {
                            if (targetEnt.type === 'whale') { engine.log(`Slain Whale! Found whale meat.`); engine.stats.inventory.whale_meat++; }
                            else if (targetEnt.type === 'dragon') { engine.log(`Slain Dragon! Obtained 2 Dragon Meat.`); engine.stats.inventory.dragon_meat += 2; }
                            else { engine.log(`Slain ${targetEnt.type}.`); engine.stats.inventory.meat++; }
                        }
                    } else {
                        engine.log("Not enough stamina for Dragon Fire Breath!");
                    }
                    return;
                }
            } else if (rType === 'eagle') {
                if (dist <= 2) {
                    if (engine.stats.stamina >= 10) {
                        engine.stats.stamina -= 10;
                        let swoopDmg = Math.floor(25 + Math.random() * 15);
                        targetEnt.hp -= swoopDmg;
                        engine.log(`🦅 AERIAL SWOOP! Your Eagle strikes the ${targetEnt.type} for ${swoopDmg} damage!`);
                        if (targetEnt.type === 'villager' || targetEnt.type === 'guard') {
                            engine.villageHostileUntil = Date.now() + 30000;
                            engine.wasHostile = true;
                        }
                        if (targetEnt.hp <= 0) {
                            if (targetEnt.type === 'whale') { engine.log(`Slain Whale! Found whale meat.`); engine.stats.inventory.whale_meat++; }
                            else { engine.log(`Slain ${targetEnt.type}.`); engine.stats.inventory.meat++; }
                        }
                    } else {
                        engine.log("Not enough stamina for Aerial Swoop!");
                    }
                    return;
                }
            } else if (rType === 'bear' || rType === 'deer') {
                if (dist === 1) {
                    if (engine.stats.stamina >= 10) {
                        engine.stats.stamina -= 10;
                        let chargeDmg = Math.floor(20 + Math.random() * 10);
                        targetEnt.hp -= chargeDmg;
                        engine.log(`Mounted Charge! Your ${rType} strikes the ${targetEnt.type} for ${chargeDmg} damage!`);
                        if (targetEnt.type === 'villager' || targetEnt.type === 'guard') {
                            engine.villageHostileUntil = Date.now() + 30000;
                            engine.wasHostile = true;
                        }
                        if (targetEnt.hp <= 0) {
                            engine.log(`Slain ${targetEnt.type}.`);
                            engine.stats.inventory.meat++;
                        }
                    } else {
                        engine.log("Not enough stamina for Mounted Charge!");
                    }
                    return;
                }
            }
        }

        if (targetEnt.tamed) {
            if (['deer', 'eagle', 'dragon', 'bear'].includes(targetEnt.type) && activeItem === 'saddle' && engine.stats.inventory.saddle > 0 && !engine.stats.riding) {
                engine.stats.riding = targetEnt;
                engine.stats.inventory.saddle--;
                engine.log(`You mounted the ${targetEnt.type}!`);
                setEntities(engine, getEntities(engine).filter(e => e !== targetEnt));
            } else if (targetEnt.type === 'boat') {
                if (!engine.stats.riding) {
                    engine.stats.riding = targetEnt;
                    engine.stats.inBoat = true;
                    engine.log("You mounted the boat.");
                }
            } else if (!engine.stats.riding) {
                engine.stats.pets.push(targetEnt);
                setEntities(engine, getEntities(engine).filter(e => e !== targetEnt));
                engine.log(`Picked up ${targetEnt.type}.`);
            }
            return;
        }

        if (targetEnt.type === 'chest') {
            let goldFound = Math.floor(15 + Math.random() * 60);
            let ironFound = Math.floor(2 + Math.random() * 12);
            let woodFound = Math.floor(10 + Math.random() * 25);
            let stoneFound = Math.floor(5 + Math.random() * 20);

            engine.stats.inventory.gold += goldFound;
            engine.stats.inventory.iron += ironFound;
            engine.stats.inventory.wood += woodFound;
            engine.stats.inventory.stone += stoneFound;

            let extra = '';
            if (Math.random() < 0.4) {
                let arr = Math.floor(5 + Math.random() * 10);
                engine.stats.inventory.arrows += arr;
                extra += `, ${arr} Arrows`;
            }
            if (Math.random() < 0.25) {
                engine.stats.inventory.saddle += 1;
                extra += `, 1 Saddle`;
            }

            engine.log(`🧰 Opened Chest! Found ${goldFound} Gold, ${ironFound} Iron, ${woodFound} Wood, ${stoneFound} Stone${extra}.`);

            // Stealing from village chest alerts village guards!
            engine.villageHostileUntil = Date.now() + 30000;
            engine.wasHostile = true;
            engine.log("🚨 You stole from a village chest! Village Guards are hostile for 30s!");

            setEntities(engine, getEntities(engine).filter(e => e !== targetEnt));
            return;
        }

        if (targetEnt.type === 'villager') {
            let item = targetEnt.trade;
            if (item === 'Buy Iron Armor') {
                if (engine.stats.inventory.gold >= 20) {
                    engine.stats.inventory.gold -= 20;
                    engine.stats.equipment.armorLevel = 1;
                    engine.log("🤝 Traded with Villager: Bought Iron Armor for 20 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: 'Iron Armor costs 20 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            } else if (item === 'Buy Eagle') {
                if (engine.stats.inventory.gold >= 50) {
                    engine.stats.inventory.gold -= 50;
                    engine.stats.pets.push({
                        id: Math.random().toString(), type: 'eagle', pos: {c: 0, r: 0},
                        hp: 40, maxHp: 40, speedMs: 800, lastMove: Date.now(), tamed: true
                    });
                    engine.log("🤝 Traded with Villager: Bought an Eagle pet for 50 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: 'An Eagle pet costs 50 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            } else if (item === 'Buy Iron Sword') {
                if (engine.stats.inventory.gold >= 15) {
                    engine.stats.inventory.gold -= 15;
                    engine.stats.equipment.swordLevel = 4;
                    engine.log("🤝 Traded with Villager: Bought an Iron Sword for 15 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: 'An Iron Sword costs 15 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            } else if (item === 'Buy Boat') {
                if (engine.stats.inventory.gold >= 30) {
                    engine.stats.inventory.gold -= 30;
                    engine.stats.inventory.boat++;
                    engine.log("🤝 Traded with Villager: Bought a Boat for 30 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: 'A Boat costs 30 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            } else if (item === 'Buy Saddle') {
                if (engine.stats.inventory.gold >= 25) {
                    engine.stats.inventory.gold -= 25;
                    engine.stats.inventory.saddle++;
                    engine.log("🤝 Traded with Villager: Bought a Saddle for 25 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: 'A Saddle costs 25 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            } else if (item === 'Buy Wood') {
                if (engine.stats.inventory.gold >= 5) {
                    engine.stats.inventory.gold -= 5;
                    engine.stats.inventory.wood += 20;
                    engine.log("🤝 Traded with Villager: Bought 20 Wood for 5 Gold!");
                } else {
                    engine.log(`🧙‍♂️ Villager: '20 Wood costs 5 Gold. You only have ${engine.stats.inventory.gold}g.'`);
                }
            }
            return;
        }

        if (targetEnt.unconscious) {
            if (activeItem === 'meat' || activeItem === 'grand_flower' || activeItem === 'berries' || activeItem === 'whale_meat' || activeItem === 'dragon_meat' || activeItem === 'cooked_prime_meat') {
                let itemStr = activeItem as keyof PlayerStats['inventory'];
                if (engine.stats.inventory[itemStr] > 0) {
                    engine.stats.inventory[itemStr]--;
                    
                    let canTame = false;
                    let increment = 25; // default 25% progress per feed

                    if (itemStr === 'meat' && ['wolf', 'bear', 'fox', 'scorpion', 'crocodile', 'shark'].includes(targetEnt.type)) {
                        canTame = true;
                        increment = ['rabbit', 'fox'].includes(targetEnt.type) ? 35 : (['wolf', 'scorpion'].includes(targetEnt.type) ? 25 : 20);
                    } else if (itemStr === 'grand_flower' && ['deer', 'eagle'].includes(targetEnt.type)) {
                        canTame = true;
                        increment = 35;
                    } else if (itemStr === 'berries' && ['rabbit', 'boar'].includes(targetEnt.type)) {
                        canTame = true;
                        increment = 35;
                    } else if (itemStr === 'dragon_meat' && targetEnt.type === 'dragon') {
                        canTame = true;
                        increment = 25;
                    } else if (itemStr === 'cooked_prime_meat' && ['trex', 'dragon', 'bear', 'crocodile', 'shark', 'wolf'].includes(targetEnt.type)) {
                        canTame = true;
                        increment = 34; // 3 feeds for prime meat
                    } else if (itemStr === 'whale_meat' && ['whale', 'dragon', 'trex', 'bear'].includes(targetEnt.type)) {
                        canTame = true;
                        increment = 25;
                    }

                    if (canTame) {
                        targetEnt.tamingProgress = (targetEnt.tamingProgress || 0) + increment;
                        if (targetEnt.tamingProgress >= 100) {
                            targetEnt.tamingProgress = 100;
                            targetEnt.tamed = true;
                            targetEnt.unconscious = false;
                            targetEnt.hp = targetEnt.maxHp;
                            engine.log(`🎉 Taming complete! You successfully tamed the ${targetEnt.type}!`);
                        } else {
                            engine.log(`🍖 Fed the unconscious ${targetEnt.type}! Taming progress: ${targetEnt.tamingProgress}% / 100%. Keep feeding it!`);
                        }
                    } else {
                        engine.log(`The ${targetEnt.type} rejects this food.`);
                    }
                } else {
                    engine.log(`You don't have any ${itemStr}.`);
                }
                return;
            }
        }

        if (!targetEnt.tamed) {
            if (targetEnt.type === 'guard') {
                engine.villageHostileUntil = Date.now() + 30000;
                engine.wasHostile = true;
            }
            let dmg = 10;
            let usedClub = false;

            if (activeItem === 'Club' && engine.stats.equipment.clubLevel > 0) {
                let lvl = engine.stats.equipment.clubLevel;
                if (targetEnt.type === 'dragon' && lvl < 3) {
                    engine.log("Only a Gold Club is strong enough to knock out a Dragon!");
                    return;
                }
                dmg = lvl === 1 ? 8 : (lvl === 2 ? 5 : 2);
                usedClub = true;
            } else {
                if (engine.stats.equipment.swordLevel === 1) dmg = 20; // Wood Sword
                if (engine.stats.equipment.swordLevel === 2) dmg = 35; // Stone Sword
                if (engine.stats.equipment.swordLevel === 3) dmg = 50; // Gold Sword
                if (engine.stats.equipment.swordLevel === 4) dmg = 75; // Iron Sword
                else {
                    if (engine.stats.equipment.axeLevel === 1) dmg = 12; // Wood Axe
                    if (engine.stats.equipment.axeLevel === 2) dmg = 15; // Stone Axe
                    if (engine.stats.equipment.axeLevel === 3) dmg = 25; // Gold Axe
                }
            }
            
            if (engine.stats.stamina >= 10) {
                engine.stats.stamina -= 10;
                targetEnt.hp -= dmg;
                engine.log(usedClub ? `You bonked the ${targetEnt.type} for ${dmg} damage.` : `You struck the ${targetEnt.type} for ${dmg} damage.`);
                
                if (usedClub && targetEnt.hp > 0) {
                    let lvl = engine.stats.equipment.clubLevel;
                    let koChance = targetEnt.type === 'dragon' ? (lvl === 3 ? 0.60 : 0) : (lvl === 1 ? 0.15 : (lvl === 2 ? 0.30 : 0.45));
                    if (Math.random() < koChance) {
                        targetEnt.unconscious = true;
                        engine.log(`The ${targetEnt.type} was knocked unconscious!`);
                    }
                }

                if (targetEnt.hp <= 0) {
                    if (targetEnt.type === 'whale') {
                        engine.log(`Slain ${targetEnt.type}. Found whale meat!`);
                        engine.stats.inventory.whale_meat++;
                    } else if (targetEnt.type === 'dragon') {
                        engine.log(`Slain Dragon! Obtained 2 Dragon Meat.`);
                        engine.stats.inventory.dragon_meat += 2;
                    } else if (targetEnt.type === 'trex') {
                        engine.log(`🦖 Slain Apex T-Rex! Obtained 2 Cooked Prime Meat, 4 Chitin & 3 Leather!`);
                        engine.stats.inventory.cooked_prime_meat += 2;
                        engine.stats.inventory.chitin += 4;
                        engine.stats.inventory.leather += 3;
                    } else {
                        engine.log(`Slain ${targetEnt.type}.`);
                        engine.stats.inventory.meat++;
                        if (Math.random() < 0.7) {
                            let amount = Math.floor(Math.random() * 3) + 2; // 2 to 4 leather
                            engine.stats.inventory.leather += amount;
                            engine.log(`Found ${amount} leather!`);
                        }
                    }
                }
            } else {
                engine.log("Not enough stamina to attack!");
            }
            return;
        }
        return;
    }
    
    if (activeItem && dist === 1) {
        if (activeItem.startsWith('drop_pet_')) {
            if (tile !== 'Mountain' && tile !== 'Water' && tile !== 'Wall' && tile !== 'CaveWall') {
                let idx = parseInt(activeItem.split('_')[2]);
                let pet = engine.stats.pets[idx];
                if (pet) {
                    engine.stats.pets.splice(idx, 1);
                    pet.pos = hex;
                    entities.push(pet);
                    engine.log(`Dropped pet ${pet.type}.`);
                }
            }
            return;
        }
        if (activeItem === 'boat' && tile === 'Water') {
            if (engine.stats.inventory.boat > 0) {
                engine.stats.inventory.boat--;
                entities.push({
                    id: Math.random().toString(),
                    type: 'boat',
                    pos: hex,
                    hp: 100, maxHp: 100,
                    speedMs: 999999, lastMove: 0,
                    tamed: true
                });
                engine.log("Placed a boat.");
            }
            return;
        }
        if (tile === 'Plains' || tile === 'CaveFloor' || tile === 'Sand' || tile === 'HouseFloor') {
            if (activeItem === 'Wall' && engine.stats.inventory.wood >= 2 && engine.stats.inventory.stone >= 2) {
                engine.stats.inventory.wood -= 2;
                engine.stats.inventory.stone -= 2;
                map[hex.r][hex.c] = 'Wall';
                engine.log("Built a Wall.");
                return;
            } else if (activeItem === 'Campfire' && engine.stats.inventory.wood >= 5 && engine.stats.inventory.stone >= 5) {
                engine.stats.inventory.wood -= 5;
                engine.stats.inventory.stone -= 5;
                map[hex.r][hex.c] = 'Campfire';
                engine.log("Built a Campfire.");
                return;
            } else if (activeItem === 'CraftingTable' && engine.stats.inventory.wood >= 10 && engine.stats.inventory.stone >= 5) {
                engine.stats.inventory.wood -= 10;
                engine.stats.inventory.stone -= 5;
                map[hex.r][hex.c] = 'CraftingTable';
                engine.log("Built a Crafting Table.");
                return;
            }
        }
    }
    
    if (dist === 1) {
        if (tile === 'Bed' || tile === 'Campfire') {
            if (engine.timeOfDay >= 120) {
                engine.timeOfDay = 0;
                engine.dayCount++;
                engine.nightSpawnedThisCycle = false;
                engine.stats.hp = engine.stats.maxHp;
                engine.stats.stamina = engine.stats.maxStamina;
                engine.log(`🌅 You rested comfortably and slept through the night! HP & Stamina fully restored. Day ${engine.dayCount} has arrived.`);
                return;
            }
        }
        if (tile === 'BerryBush') {
            if (engine.stats.stamina >= 5) {
                engine.stats.stamina -= 5;
                engine.stats.inventory.berries += 2;
                map[hex.r][hex.c] = 'Plains';
                engine.depletedTiles.push({ c: hex.c, r: hex.r, originalTile: 'BerryBush', harvestedAt: Date.now() });
                engine.log("Gathered berries.");
            } else {
                engine.log("Not enough stamina to gather berries.");
            }
            return;
        }
        if (tile === 'Forest') {
            let cost = 20;
            if (engine.stats.equipment.axeLevel === 1) cost = 15; // Wood
            if (engine.stats.equipment.axeLevel === 2) cost = 10; // Stone
            if (engine.stats.equipment.axeLevel === 3) cost = 5;  // Gold
            
            if (engine.stats.stamina >= cost) {
                engine.stats.stamina -= cost;
                engine.stats.inventory.wood++;
                if (Math.random() < 0.1) {
                    engine.stats.inventory.grand_flower++;
                    engine.log("Found a rare grand flower in the trees!");
                }
                map[hex.r][hex.c] = 'ForestGround';
                engine.depletedTiles.push({ c: hex.c, r: hex.r, originalTile: 'Forest', harvestedAt: Date.now() });
                engine.log("Chopped wood from the forest.");
            } else {
                engine.log("Not enough stamina to chop wood.");
            }
            return;
        }
        if (tile === 'Mountain') {
            let cost = 30;
            if (engine.stats.equipment.pickaxeLevel === 1) cost = 25; // Wood
            if (engine.stats.equipment.pickaxeLevel === 2) cost = 15; // Stone
            if (engine.stats.equipment.pickaxeLevel === 3) cost = 10; // Gold
            
            if (engine.stats.stamina >= cost) {
                engine.stats.stamina -= cost;
                engine.stats.inventory.stone++;
                map[hex.r][hex.c] = 'MountainGround';
                engine.depletedTiles.push({ c: hex.c, r: hex.r, originalTile: 'Mountain', harvestedAt: Date.now() });
                engine.log("Mined stone from the mountain.");
            } else {
                engine.log("Not enough stamina to mine stone.");
            }
            return;
        }
        if (tile === 'GoldVein') {
            let cost = 30;
            if (engine.stats.equipment.pickaxeLevel === 1) cost = 25;
            if (engine.stats.equipment.pickaxeLevel === 2) cost = 15;
            if (engine.stats.equipment.pickaxeLevel === 3) cost = 10;
            
            if (engine.stats.stamina >= cost) {
                engine.stats.stamina -= cost;
                engine.stats.inventory.gold++;
                map[hex.r][hex.c] = 'CaveFloor';
                engine.depletedTiles.push({ c: hex.c, r: hex.r, originalTile: 'GoldVein', harvestedAt: Date.now() });
                engine.log("Mined gold from the cave wall.");
            } else {
                engine.log("Not enough stamina to mine gold.");
            }
            return;
        }
        if (tile === 'CaveWall' && engine.stats.equipment.pickaxeLevel >= 3) {
            if (engine.stats.stamina >= 10) {
                engine.stats.stamina -= 10;
                map[hex.r][hex.c] = 'CaveFloor';
                engine.log("Mined through the cave wall.");
            } else {
                engine.log("Not enough stamina to mine cave wall.");
            }
            return;
        }
        if (tile === 'Wall' || tile === 'Campfire') {
            if (engine.stats.stamina >= 10) {
                engine.stats.stamina -= 10;
                map[hex.r][hex.c] = engine.inCave ? 'CaveFloor' : 'Plains';
                engine.log(`Destroyed ${tile.toLowerCase()}.`);
            } else {
                engine.log("Not enough stamina.");
            }
            return;
        }
        if (tile === 'CaveEntrance') {
            if (engine.inCave) {
                engine.inCave = false;
                if (engine.overworldPos) engine.player.pos = engine.overworldPos;
                engine.currentCaveId = null;
                engine.log("Emerged from the cave.");
            } else {
                engine.inCave = true;
                engine.overworldPos = { ...engine.player.pos };
                let caveId = `${hex.c},${hex.r}`;
                engine.currentCaveId = caveId;
                
                if (!engine.caveMaps[caveId]) {
                    engine.caveMaps[caveId] = generateCaveMap();
                    engine.caveEntitiesMap[caveId] = generateCaveEntities(engine.caveMaps[caveId]);
                }
                
                let entrance = findTile(engine.caveMaps[caveId], 'CaveEntrance');
                if (entrance) engine.player.pos = entrance;
                engine.log("Entered a dark cave.");
            }
            return;
        }

        if (tile === 'HouseDoor' && engine.inHouse) {
            engine.inHouse = false;
            if (engine.overworldPos) engine.player.pos = engine.overworldPos;
            engine.currentHouseId = null;
            engine.log("You stepped outside.");
            return;
        }

        if (!engine.stats.riding && engine.stats.stamina < 1) {
            engine.log("Not enough stamina to move.");
            return;
        }

        executeSingleStep(engine, hex);
    }
}
