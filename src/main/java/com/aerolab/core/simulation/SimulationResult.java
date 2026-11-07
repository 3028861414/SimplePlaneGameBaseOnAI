package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.Vec3;

import java.util.List;

public record SimulationResult(
        String solver,
        FlowConditions conditions,
        Aabb modelBounds,
        List<PartSurface> surfaces,
        FlowField flow,
        SimulationSummary summary,
        Vec3 windDirection,
        long computeTimeMs
) {
    public SimulationResult {
        surfaces = List.copyOf(surfaces);
    }
}
