export type TileType = 'Plains' | 'Forest' | 'ForestGround' | 'Mountain' | 'MountainGround' | 'Water' | 'WaterShallow' | 'WaterMedium' | 'WaterDeep' | 'CaveEntrance' | 'CaveFloor' | 'CaveWall' | 'GoldVein' | 'Wall' | 'BrokenWall' | 'Campfire' | 'Sand' | 'BerryBush' | 'Snow' | 'Lava' | 'LavaGround' | 'House' | 'HouseFloor' | 'HouseDoor' | 'CraftingTable' | 'Palace' | 'PalaceDoor' | 'PalaceFloor' | 'Bed';

export interface Position {
    c: number;
    r: number;
}

export interface Entity {
    id: string;
    type: 'player' | 'wolf' | 'deer' | 'bear' | 'rabbit' | 'boar' | 'fox' | 'boat' | 'villager' | 'guard' | 'eagle' | 'dragon' | 'whale' | 'chest' | 'scorpion' | 'fish' | 'shark' | 'raider' | 'king' | 'crocodile' | 'trex';
    pos: Position;
    hp: number;
    maxHp: number;
    speedMs: number;
    lastMove: number;
    tamed?: boolean;
    unconscious?: boolean;
    tamingProgress?: number;
    trade?: string;
    homePos?: Position;
    riding?: string;
    inBoat?: boolean;
    teamId?: string;
}

export type ArmorPieceHead = 'None' | 'Cloth Cap' | 'Leather Cap' | 'Chitin Helmet' | 'Iron Helmet';
export type ArmorPieceChest = 'None' | 'Cloth Shirt' | 'Leather Chest' | 'Chitin Chest' | 'Iron Armor';
export type ArmorPieceLegs = 'None' | 'Cloth Pants' | 'Leather Leggings' | 'Chitin Leggings' | 'Iron Leggings';
export type ArmorPieceFeet = 'None' | 'Cloth Boots' | 'Leather Boots' | 'Chitin Boots' | 'Iron Boots';

export interface PlayerStats {
    hp: number;
    maxHp: number;
    stamina: number;
    maxStamina: number;
    hunger: number;
    maxHunger: number;
    thirst: number;
    maxThirst: number;
    weight: number;
    maxWeight: number;
    temperature: number; // In Celsius, e.g. 37.0
    bleedTicks?: number; // Damage over time bleed effect
    inventory: {
        wood: number;
        stone: number;
        gold: number;
        iron: number;
        meat: number;
        arrows: number;
        leather: number;
        grand_flower: number;
        boat: number;
        saddle: number;
        berries: number;
        whale_meat: number;
        dragon_meat: number;
        chitin: number;
        metal_ingot: number;
        narcotics: number;
        tranq_arrows: number;
        cooked_prime_meat: number;
        // Armor items
        cloth_cap: number;
        leather_cap: number;
        chitin_helmet: number;
        iron_helmet: number;
        cloth_shirt: number;
        leather_chest: number;
        chitin_chest: number;
        iron_armor: number;
        cloth_pants: number;
        leather_leggings: number;
        chitin_leggings: number;
        iron_leggings: number;
        cloth_boots: number;
        leather_boots: number;
        chitin_boots: number;
        iron_boots: number;
    };
    equipment: {
        axeLevel: number;
        pickaxeLevel: number;
        swordLevel: number;
        clubLevel: number;
        armorLevel: number;
        bow: boolean;
        head: ArmorPieceHead;
        chest: ArmorPieceChest;
        legs: ArmorPieceLegs;
        feet: ArmorPieceFeet;
    };
    pets: Entity[];
    riding: Entity | null;
    inBoat: boolean;
    hotbar: (string | null)[];
}
