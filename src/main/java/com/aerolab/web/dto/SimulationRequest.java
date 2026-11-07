package com.aerolab.web.dto;

public record SimulationRequest(
        ModelDto model,
        FlowConditionsDto conditions
) {

    public record FlowConditionsDto(
            ModelDto.Vec3Dto direction,
            double windSpeedMps,
            double airDensity
    ) {
    }
}
