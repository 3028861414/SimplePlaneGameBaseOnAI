package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;

public record ControlSurfaceSpec(
        String id,
        String name,
        Vec3 position,
        double areaM2,
        double massKg
) {

    public ControlSurfaceSpec(String id, String name, Vec3 position) {
        this(id, name, position, 0.9, 18);
    }
}
