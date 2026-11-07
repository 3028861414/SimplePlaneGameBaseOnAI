package com.aerolab.web.flight;

import com.aerolab.web.dto.ModelDto;

import java.util.List;

public record FlightWorldDto(
        int chunkSize,
        int chunkResolution,
        String heightEncoding,
        int chunkRadius,
        int minChunkRadius,
        int maxChunkRadius,
        int loadedChunkCount,
        List<TerrainChunkDto> chunks,
        RunwayDto runway,
        ModelDto.Vec3Dto start
) {

    public record RunwayDto(
            double centerX,
            double centerZ,
            double length,
            double width,
            double elevation,
            double headingRadians
    ) {
    }
}
