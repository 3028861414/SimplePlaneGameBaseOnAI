package com.aerolab.core.world;

public final class WorldGenerator {

    public static final int RESOLUTION = 257;
    public static final double WORLD_SIZE = 6000;
    public static final double WORLD_MIN_X = -3000;
    public static final double WORLD_MIN_Z = -3000;
    public static final double RUNWAY_CENTER_X = 200;
    public static final double RUNWAY_CENTER_Z = 0;
    public static final double RUNWAY_LENGTH = 1600;
    public static final double RUNWAY_WIDTH = 52;
    public static final double RUNWAY_ELEVATION = 35;

    private static final long SEED = 20261107L;

    public TerrainWorld generate() {
        PerlinNoise2D noise = new PerlinNoise2D(SEED);
        Runway runway = new Runway(
                RUNWAY_CENTER_X,
                RUNWAY_CENTER_Z,
                RUNWAY_LENGTH,
                RUNWAY_WIDTH,
                RUNWAY_ELEVATION,
                0
        );
        float[] heights = new float[RESOLUTION * RESOLUTION];
        double cellX = WORLD_SIZE / (RESOLUTION - 1);
        double cellZ = WORLD_SIZE / (RESOLUTION - 1);

        for (int iz = 0; iz < RESOLUTION; iz++) {
            double z = WORLD_MIN_Z + iz * cellZ;
            for (int ix = 0; ix < RESOLUTION; ix++) {
                double x = WORLD_MIN_X + ix * cellX;
                heights[iz * RESOLUTION + ix] = (float) terrainHeight(x, z, noise, runway);
            }
        }
        return new TerrainWorld(
                RESOLUTION,
                WORLD_MIN_X,
                WORLD_MIN_Z,
                WORLD_SIZE,
                WORLD_SIZE,
                heights,
                runway
        );
    }

    private double terrainHeight(double x, double z, PerlinNoise2D noise, Runway runway) {
        double continental = noise.fbm(x * 0.00038, z * 0.00038, 5, 2.02, 0.52);
        double rolling = noise.fbm(x * 0.00135 + 17.3, z * 0.00135 - 9.1, 4, 2.08, 0.46);
        double ridge = 1.0 - Math.abs(noise.fbm(x * 0.00083 - 41.7, z * 0.00083 + 23.8, 4, 2.12, 0.48));
        double mountains = Math.pow(Math.max(0, ridge), 2.35) * 105;
        double detail = noise.fbm(x * 0.0062, z * 0.0062, 3, 2.1, 0.42) * 3.2;
        double natural = 20 + continental * 42 + rolling * 28 + mountains + detail;
        natural = Math.max(-8, Math.min(285, natural));

        double padHalfX = RUNWAY_LENGTH * 0.5 + 180;
        double padHalfZ = 230;
        double dx = Math.max(0, Math.abs(x - runway.centerX()) - padHalfX);
        double dz = Math.max(0, Math.abs(z - runway.centerZ()) - padHalfZ);
        double distance = Math.hypot(dx, dz);
        double blend = smoothStep(0, 520, distance);
        return runway.elevation() + (natural - runway.elevation()) * blend;
    }

    private static double smoothStep(double edge0, double edge1, double value) {
        double t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
}
