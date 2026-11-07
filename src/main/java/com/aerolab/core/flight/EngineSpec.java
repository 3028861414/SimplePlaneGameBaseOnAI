package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;

public record EngineSpec(String id, String name, Vec3 position, double maxThrustN, double massKg) {

    public EngineSpec(String id, String name, Vec3 position, double maxThrustN) {
        this(id, name, position, maxThrustN, 165);
    }
}
