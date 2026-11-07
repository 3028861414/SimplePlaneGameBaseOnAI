package com.aerolab.core.world;

import com.aerolab.core.geometry.Vec3;

/**
 * Deterministic, unbounded terrain sampled on demand. Physics queries the
 * continuous height function while the flight transport streams fixed-size
 * chunks for rendering.
 */
public final class TerrainWorld {

    private final Runway runway;
    private final PerlinNoise2D continentalNoise;
    private final PerlinNoise2D terrainTypeNoise;
    private final PerlinNoise2D plateauNoise;
    private final PerlinNoise2D mountainNoise;
    private final PerlinNoise2D rollingNoise;
    private final PerlinNoise2D detailNoise;

    public TerrainWorld(long seed, Runway runway) {
        this.runway = runway;
        this.continentalNoise = new PerlinNoise2D(seed);
        this.terrainTypeNoise = new PerlinNoise2D(seed + 17);
        this.plateauNoise = new PerlinNoise2D(seed + 41);
        this.mountainNoise = new PerlinNoise2D(seed + 73);
        this.rollingNoise = new PerlinNoise2D(seed + 109);
        this.detailNoise = new PerlinNoise2D(seed + 151);
    }

    public Runway runway() {
        return runway;
    }

    public Vec3 startPosition(double clearance) {
        return runway.startPosition(clearance);
    }

    public double heightAt(double x, double z) {
        return sample(x, z).height();
    }

    public TerrainBiome biomeAt(double x, double z) {
        return sample(x, z).biome();
    }

    public TerrainChunk chunkAt(int chunkX, int chunkZ) {
        int resolution = WorldConfig.CHUNK_RESOLUTION;
        int count = resolution * resolution;
        float[] heights = new float[count];
        int[] biomeCounts = new int[TerrainBiome.values().length];
        double originX = WorldConfig.chunkOrigin(chunkX);
        double originZ = WorldConfig.chunkOrigin(chunkZ);
        double step = WorldConfig.CHUNK_SIZE / (resolution - 1);
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;

        for (int iz = 0; iz < resolution; iz++) {
            double z = originZ + iz * step;
            for (int ix = 0; ix < resolution; ix++) {
                double x = originX + ix * step;
                TerrainSample sample = sample(x, z);
                float height = (float) sample.height();
                heights[iz * resolution + ix] = height;
                biomeCounts[sample.biome().ordinal()]++;
                min = Math.min(min, height);
                max = Math.max(max, height);
            }
        }

        int dominant = 0;
        for (int i = 1; i < biomeCounts.length; i++) {
            if (biomeCounts[i] > biomeCounts[dominant]) dominant = i;
        }
        return new TerrainChunk(
                chunkX,
                chunkZ,
                resolution,
                originX,
                originZ,
                WorldConfig.CHUNK_SIZE,
                WorldConfig.CHUNK_SIZE,
                heights,
                min,
                max,
                TerrainBiome.values()[dominant]
        );
    }

    private TerrainSample sample(double x, double z) {
        double broad = continentalNoise.fbm(x * 0.00009, z * 0.00009, 4, 2.0, 0.55);
        double type = clamp(
                terrainTypeNoise.fbm(x * 0.00027 + 13.7, z * 0.00027 - 8.2, 4, 2.05, 0.5) * 1.9,
                -1, 1
        );
        double plateauSignal = 0.5 + 0.5 * clamp(
                plateauNoise.fbm(x * 0.00021 - 31.3, z * 0.00021 + 19.4, 4, 2.05, 0.5) * 1.9,
                -1, 1
        );
        double ridgeBase = 1 - Math.abs(
                mountainNoise.fbm(x * 0.00048 + 5.1, z * 0.00048 - 2.8, 5, 2.12, 0.5)
        );
        double ridge = Math.pow(clamp(ridgeBase, 0, 1), 2.35);
        double rolling = rollingNoise.fbm(x * 0.0011, z * 0.0011, 5, 2.08, 0.48);
        double detail = detailNoise.fbm(x * 0.0065, z * 0.0065, 3, 2.1, 0.42);

        double plains = 20 + broad * 26 + rolling * 8 + detail * 1.5;
        double hills = 38 + broad * 30 + rolling * 52 + ridge * 18 + detail * 3.5;
        double mountains = 60 + broad * 38 + ridge * 460 + rolling * 36 + detail * 6;
        double hillsMix = smoothStep(-0.35, -0.05, type);
        double mountainMix = smoothStep(0.18, 0.55, type);
        double plainsWeight = 1 - hillsMix;
        double hillsWeight = hillsMix * (1 - mountainMix);
        double mountainWeight = mountainMix;
        double natural = plains * plainsWeight + hills * hillsWeight + mountains * mountainWeight;

        double plateauMask = smoothStep(0.60, 0.665, plateauSignal);
        double plateau = 210 + rolling * 7 + detail * 1.2 + broad * 10;
        natural = natural * (1 - plateauMask) + plateau * plateauMask;
        natural = clamp(natural, -20, 820);

        TerrainBiome biome;
        if (plateauMask > 0.5) biome = TerrainBiome.PLATEAU;
        else if (mountainWeight > 0.5) biome = TerrainBiome.MOUNTAINS;
        else if (hillsWeight > plainsWeight) biome = TerrainBiome.HILLS;
        else biome = TerrainBiome.PLAINS;

        double padHalfX = runway.length() * 0.5 + 220;
        double padHalfZ = 260;
        double dx = Math.max(0, Math.abs(x - runway.centerX()) - padHalfX);
        double dz = Math.max(0, Math.abs(z - runway.centerZ()) - padHalfZ);
        double distance = Math.hypot(dx, dz);
        double runwayBlend = smoothStep(0, 1000, distance);
        double height = runway.elevation() + (natural - runway.elevation()) * runwayBlend;
        return new TerrainSample(height, biome);
    }

    private static double smoothStep(double edge0, double edge1, double value) {
        double t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record TerrainSample(double height, TerrainBiome biome) {
    }
}
