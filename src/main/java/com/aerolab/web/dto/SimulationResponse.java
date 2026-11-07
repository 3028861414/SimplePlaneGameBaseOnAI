package com.aerolab.web.dto;

import java.util.List;

public record SimulationResponse(
        String solver,
        long computeTimeMs,
        ModelDto.Vec3Dto windDirection,
        BoundsDto modelBounds,
        SurfaceDto surface,
        FlowDto flow,
        SummaryDto summary,
        List<String> warnings
) {

    public record BoundsDto(
            ModelDto.Vec3Dto min,
            ModelDto.Vec3Dto max
    ) {
    }

    public record SurfaceDto(
            List<PartSurfaceDto> parts,
            double minCp,
            double maxCp
    ) {
    }

    public record PartSurfaceDto(
            String id,
            String name,
            String color,
            float[] positions,
            float[] normals,
            float[] pressureCoefficient,
            float[] speed
    ) {
    }

    public record FlowDto(
            int nx,
            int ny,
            int nz,
            ModelDto.Vec3Dto origin,
            ModelDto.Vec3Dto stepX,
            ModelDto.Vec3Dto stepY,
            ModelDto.Vec3Dto stepZ,
            String indexOrder,
            String encoding,
            String speed,
            String pressureCoefficient,
            String velocityX,
            String velocityY,
            String velocityZ
    ) {
    }

    public record SummaryDto(
            double dynamicPressurePa,
            double dragN,
            double liftN,
            double sideForceN,
            double totalPressureForceN,
            double surfaceAreaM2,
            double minCp,
            double maxCp,
            double minPressureKpa,
            double maxPressureKpa,
            double maxFlowSpeedMps,
            double minFlowSpeedMps
    ) {
    }
}
