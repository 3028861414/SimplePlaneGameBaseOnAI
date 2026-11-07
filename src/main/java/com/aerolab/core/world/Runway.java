package com.aerolab.core.world;

import com.aerolab.core.geometry.Vec3;

public record Runway(
        double centerX,
        double centerZ,
        double length,
        double width,
        double elevation,
        double headingRadians
) {

    public Runway {
        if (length <= 0 || width <= 0) {
            throw new IllegalArgumentException("跑道尺寸必须为正数");
        }
    }

    public boolean contains(double x, double z) {
        double dx = x - centerX;
        double dz = z - centerZ;
        double cos = Math.cos(headingRadians);
        double sin = Math.sin(headingRadians);
        double along = dx * cos - dz * sin;
        double across = dx * sin + dz * cos;
        return Math.abs(along) <= length * 0.5 && Math.abs(across) <= width * 0.5;
    }

    public Vec3 startPosition(double clearance) {
        double along = -length * 0.5 + Math.min(140, length * 0.12);
        double x = centerX + Math.cos(headingRadians) * along;
        double z = centerZ + Math.sin(headingRadians) * along;
        return new Vec3(x, elevation + clearance, z);
    }
}
