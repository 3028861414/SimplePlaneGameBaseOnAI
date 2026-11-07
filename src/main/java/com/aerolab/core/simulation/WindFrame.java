package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Vec3;

public record WindFrame(Vec3 downstream, Vec3 up, Vec3 lateral) {

    public static WindFrame from(FlowConditions conditions) {
        Vec3 downstream = conditions.downstreamDirection();
        Vec3 reference = Math.abs(downstream.y()) < 0.92 ? Vec3.UP : new Vec3(0, 0, 1);
        Vec3 up = reference.subtract(downstream.multiply(reference.dot(downstream))).normalized();
        if (up.lengthSquared() < 1e-12) {
            reference = new Vec3(1, 0, 0);
            up = reference.subtract(downstream.multiply(reference.dot(downstream))).normalized();
        }
        Vec3 lateral = downstream.cross(up).normalized();
        return new WindFrame(downstream, up, lateral);
    }

    public Vec3 toWind(Vec3 world) {
        return new Vec3(world.dot(downstream), world.dot(up), world.dot(lateral));
    }

    public Vec3 toWorld(Vec3 wind) {
        return downstream.multiply(wind.x())
                .add(up.multiply(wind.y()))
                .add(lateral.multiply(wind.z()));
    }
}
