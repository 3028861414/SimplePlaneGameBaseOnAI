package com.aerolab.core.flight;

/**
 * Per-engine telemetry exposed to any UI layer. Values are normalized throttle
 * (0-1) and the instantaneous thrust produced at the current throttle.
 */
public record EngineState(
        String id,
        String name,
        double throttle,
        double thrustN,
        double maxThrustN
) {
}
