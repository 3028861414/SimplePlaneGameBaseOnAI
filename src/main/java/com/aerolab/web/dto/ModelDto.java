package com.aerolab.web.dto;

import com.aerolab.core.model.ShapeType;

import java.util.List;

public record ModelDto(
        String name,
        List<PartDto> parts,
        CockpitDto cockpit
) {

    public record Vec3Dto(double x, double y, double z) {
    }

    public record PartDto(
            String id,
            String name,
            ShapeType shape,
            Vec3Dto position,
            Vec3Dto rotation,
            Vec3Dto size,
            String color
    ) {
    }

    public record CockpitDto(
            Vec3Dto position,
            double yawDegrees,
            double pitchDegrees
    ) {
    }
}
