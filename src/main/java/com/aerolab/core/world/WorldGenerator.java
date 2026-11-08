package com.aerolab.core.world;

public final class WorldGenerator {

    public TerrainWorld generate() {
        return generate(WorldConfig.SEED);
    }

    public TerrainWorld generate(long seed) {
        Runway runway = new Runway(
                WorldConfig.RUNWAY_CENTER_X,
                WorldConfig.RUNWAY_CENTER_Z,
                WorldConfig.RUNWAY_LENGTH,
                WorldConfig.RUNWAY_WIDTH,
                WorldConfig.RUNWAY_ELEVATION,
                0
        );
        return new TerrainWorld(seed, runway);
    }
}
