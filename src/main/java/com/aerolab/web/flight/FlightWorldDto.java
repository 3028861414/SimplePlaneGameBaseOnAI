package com.aerolab.web.flight;

import com.aerolab.web.dto.ModelDto;

public record FlightWorldDto(
        int resolution,
        double originX,
        double originZ,
        double sizeX,
        double sizeZ,
        double minHeight,
        double maxHeight,
        String heightEncoding,
        String heights,
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
