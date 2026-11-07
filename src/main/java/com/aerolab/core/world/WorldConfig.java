package com.aerolab.core.world;

public final class WorldConfig {

    public static final long SEED = 20261107L;
    public static final double CHUNK_SIZE = 512;
    public static final int CHUNK_RESOLUTION = 65;
    public static final int DEFAULT_CHUNK_RADIUS = 3;
    public static final int MIN_CHUNK_RADIUS = 2;
    public static final int MAX_CHUNK_RADIUS = 6;

    public static final double RUNWAY_CENTER_X = 200;
    public static final double RUNWAY_CENTER_Z = 0;
    public static final double RUNWAY_LENGTH = 1600;
    public static final double RUNWAY_WIDTH = 52;
    public static final double RUNWAY_ELEVATION = 35;

    private WorldConfig() {
    }

    public static int clampChunkRadius(int radius) {
        return Math.max(MIN_CHUNK_RADIUS, Math.min(MAX_CHUNK_RADIUS, radius));
    }

    public static int chunkIndex(double coordinate) {
        return (int) Math.floor(coordinate / CHUNK_SIZE);
    }

    public static double chunkOrigin(int chunkIndex) {
        return chunkIndex * CHUNK_SIZE;
    }

    public static String chunkKey(int chunkX, int chunkZ) {
        return chunkX + "," + chunkZ;
    }
}
