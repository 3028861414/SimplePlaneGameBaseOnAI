package com.aerolab.web.dto;

public record SimulationRequest(
        ModelDto model,
        FlowConditionsDto conditions
) {

    public record FlowConditionsDto(
            double windSpeedMps,
            double windFromAzimuthDeg,
            double airDensity
    ) {
    }
}
