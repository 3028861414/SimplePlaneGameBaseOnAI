package com.aerolab.core.flight;

import java.util.List;

public record FlightSystems(
        List<EngineSpec> engines,
        List<ControlSurfaceSpec> horizontalRudders,
        List<ControlSurfaceSpec> verticalRudders,
        List<GunSpec> guns,
        double massKg
) {

    public FlightSystems {
        engines = engines == null ? List.of() : List.copyOf(engines);
        horizontalRudders = horizontalRudders == null ? List.of() : List.copyOf(horizontalRudders);
        verticalRudders = verticalRudders == null ? List.of() : List.copyOf(verticalRudders);
        guns = guns == null ? List.of() : List.copyOf(guns);
    }

    public double totalMaxThrustN() {
        return engines.stream().mapToDouble(EngineSpec::maxThrustN).sum();
    }
}
