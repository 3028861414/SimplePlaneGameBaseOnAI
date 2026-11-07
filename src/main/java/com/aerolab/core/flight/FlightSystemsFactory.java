package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;

import java.util.List;

public final class FlightSystemsFactory {

    private FlightSystemsFactory() {
    }

    public static FlightSystems defaults() {
        return new FlightSystems(
                List.of(
                        new EngineSpec("engine-left", "左引擎", new Vec3(0.35, -0.44, -1.85), 4200),
                        new EngineSpec("engine-right", "右引擎", new Vec3(0.35, -0.44, 1.85), 4200)
                ),
                List.of(
                        new ControlSurfaceSpec("elevator-left", "左升降舵", new Vec3(-2.55, 0.13, -0.9)),
                        new ControlSurfaceSpec("elevator-right", "右升降舵", new Vec3(-2.55, 0.13, 0.9))
                ),
                List.of(
                        new ControlSurfaceSpec("rudder-main", "方向舵", new Vec3(-2.45, 0.65, 0))
                ),
                List.of(
                        new GunSpec("gun-left", "左机炮", new Vec3(3.05, 0, -0.18)),
                        new GunSpec("gun-right", "右机炮", new Vec3(3.05, 0, 0.18))
                ),
                1350
        );
    }
}
