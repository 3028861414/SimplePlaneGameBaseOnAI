package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Vec3;

public record WindFrame(Vec3 downstream, Vec3 up, Vec3 lateral) {

    public static WindFrame from(FlowConditions conditions) {
        Vec3 downstream = conditions.downstreamDirection();
        Vec3 up = Vec3.UP;
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
