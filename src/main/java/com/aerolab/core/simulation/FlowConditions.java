package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Vec3;

public record FlowConditions(double windSpeedMps, double windFromAzimuthDeg, double airDensity) {

    public FlowConditions {
        if (!Double.isFinite(windSpeedMps) || windSpeedMps < 1 || windSpeedMps > 150) {
            throw new IllegalArgumentException("风速需在 1-150 m/s 之间");
        }
        if (!Double.isFinite(windFromAzimuthDeg)) {
            throw new IllegalArgumentException("风向角必须为有限数值");
        }
        if (!Double.isFinite(airDensity) || airDensity < 0.3 || airDensity > 2.5) {
            throw new IllegalArgumentException("空气密度需在 0.3-2.5 kg/m³ 之间");
        }
    }

    public double dynamicPressurePa() {
        return 0.5 * airDensity * windSpeedMps * windSpeedMps;
    }

    public Vec3 downstreamDirection() {
        double azimuth = Math.toRadians(windFromAzimuthDeg);
        return new Vec3(-Math.cos(azimuth), 0, -Math.sin(azimuth)).normalized();
    }
}
