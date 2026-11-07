package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;

public record GunSpec(String id, String name, Vec3 position, double massKg) {

    public GunSpec(String id, String name, Vec3 position) {
        this(id, name, position, 25);
    }
}
