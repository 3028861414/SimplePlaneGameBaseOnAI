package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Vec3;

/**
 * @param direction world-space direction in which the air travels; it is
 *                  normalised by the solver and may include vertical components
 */
public record FlowConditions(Vec3 direction, double windSpeedMps, double airDensity) {

    public FlowConditions {
        if (direction == null || direction.lengthSquared() < 1e-12) {
            throw new IllegalArgumentException("来流方向向量不能为零");
        }
        if (!Double.isFinite(windSpeedMps) || windSpeedMps < 0 || windSpeedMps > 150) {
            throw new IllegalArgumentException("风速需在 0-150 m/s 之间");
        }
        if (!Double.isFinite(airDensity) || airDensity < 0.3 || airDensity > 2.5) {
            throw new IllegalArgumentException("空气密度需在 0.3-2.5 kg/m³ 之间");
        }
    }

    public double dynamicPressurePa() {
        return 0.5 * airDensity * windSpeedMps * windSpeedMps;
    }

    public Vec3 downstreamDirection() {
        return direction.normalized();
    }

    public Vec3 unitDirectionVector() {
        return direction.normalized();
    }
}
