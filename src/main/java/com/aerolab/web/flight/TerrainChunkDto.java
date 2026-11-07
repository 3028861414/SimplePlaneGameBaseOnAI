package com.aerolab.web.flight;

public record TerrainChunkDto(
        int chunkX,
        int chunkZ,
        int resolution,
        double originX,
        double originZ,
        double sizeX,
        double sizeZ,
        double minHeight,
        double maxHeight,
        String biome,
        String heights
) {
}
