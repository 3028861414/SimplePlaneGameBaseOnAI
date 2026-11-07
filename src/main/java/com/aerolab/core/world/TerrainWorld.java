package com.aerolab.core.world;

import com.aerolab.core.geometry.Vec3;

public final class TerrainWorld {

    private final int resolution;
    private final double originX;
    private final double originZ;
    private final double sizeX;
    private final double sizeZ;
    private final float[] heights;
    private final double minHeight;
    private final double maxHeight;
    private final Runway runway;

    public TerrainWorld(
            int resolution,
            double originX,
            double originZ,
            double sizeX,
            double sizeZ,
            float[] heights,
            Runway runway
    ) {
        if (resolution < 2 || heights.length != resolution * resolution) {
            throw new IllegalArgumentException("地形高度图尺寸无效");
        }
        this.resolution = resolution;
        this.originX = originX;
        this.originZ = originZ;
        this.sizeX = sizeX;
        this.sizeZ = sizeZ;
        this.heights = heights;
        this.runway = runway;
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        for (float height : heights) {
            min = Math.min(min, height);
            max = Math.max(max, height);
        }
        this.minHeight = min;
        this.maxHeight = max;
    }

    public int resolution() {
        return resolution;
    }

    public double originX() {
        return originX;
    }

    public double originZ() {
        return originZ;
    }

    public double sizeX() {
        return sizeX;
    }

    public double sizeZ() {
        return sizeZ;
    }

    public float[] heights() {
        return heights;
    }

    public double minHeight() {
        return minHeight;
    }

    public double maxHeight() {
        return maxHeight;
    }

    public Runway runway() {
        return runway;
    }

    public double minX() {
        return originX;
    }

    public double maxX() {
        return originX + sizeX;
    }

    public double minZ() {
        return originZ;
    }

    public double maxZ() {
        return originZ + sizeZ;
    }

    public boolean inside(double x, double z) {
        return x >= minX() && x <= maxX() && z >= minZ() && z <= maxZ();
    }

    public double heightAt(double x, double z) {
        double localX = clamp(x, originX, originX + sizeX);
        double localZ = clamp(z, originZ, originZ + sizeZ);
        double gx = (localX - originX) / sizeX * (resolution - 1);
        double gz = (localZ - originZ) / sizeZ * (resolution - 1);
        int x0 = (int) Math.floor(gx);
        int z0 = (int) Math.floor(gz);
        int x1 = Math.min(x0 + 1, resolution - 1);
        int z1 = Math.min(z0 + 1, resolution - 1);
        double fx = gx - x0;
        double fz = gz - z0;
        double h00 = heights[z0 * resolution + x0];
        double h10 = heights[z0 * resolution + x1];
        double h01 = heights[z1 * resolution + x0];
        double h11 = heights[z1 * resolution + x1];
        double h0 = h00 + (h10 - h00) * fx;
        double h1 = h01 + (h11 - h01) * fx;
        return h0 + (h1 - h0) * fz;
    }

    public Vec3 startPosition(double clearance) {
        return runway.startPosition(clearance);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
