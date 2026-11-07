package com.aerolab.core.simulation;

public record SimulationSummary(
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
