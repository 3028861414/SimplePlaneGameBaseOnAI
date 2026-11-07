package com.aerolab.core.world;

public record TerrainChunk(
        int chunkX,
        int chunkZ,
        int resolution,
        double originX,
        double originZ,
        double sizeX,
        double sizeZ,
        float[] heights,
        double minHeight,
        double maxHeight,
        TerrainBiome dominantBiome
) {

    public TerrainChunk {
        if (resolution < 2 || heights.length != resolution * resolution) {
            throw new IllegalArgumentException("地形区块高度图尺寸无效");
        }
    }
}
