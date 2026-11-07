package com.aerolab.web.flight;

import com.aerolab.web.dto.ModelDto;

import java.util.List;
import java.util.Map;

public record FlightStartRequest(
        String type,
        ModelDto model,
        FlightSystemsDto flightSystems,
        Map<String, String> bindings,
        Integer chunkRadius
) {

    public record FlightSystemsDto(
            double massKg,
            List<EngineDto> engines,
            List<ControlSurfaceDto> horizontalRudders,
            List<ControlSurfaceDto> verticalRudders,
            List<GunDto> guns
    ) {
    }

    public record EngineDto(
            String id,
            String name,
            ModelDto.Vec3Dto position,
            double maxThrustN
    ) {
    }

    public record ControlSurfaceDto(
            String id,
            String name,
            ModelDto.Vec3Dto position
    ) {
    }

    public record GunDto(
            String id,
            String name,
            ModelDto.Vec3Dto position
    ) {
    }
}
