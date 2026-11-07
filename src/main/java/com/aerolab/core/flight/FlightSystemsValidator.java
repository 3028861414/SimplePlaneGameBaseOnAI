package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;

import java.util.HashSet;
import java.util.Set;

public final class FlightSystemsValidator {

    private FlightSystemsValidator() {
    }

    public static void validate(FlightSystems systems) {
        if (systems == null) {
            throw new IllegalArgumentException("飞行操纵系统不能为空");
        }
        if (!Double.isFinite(systems.massKg()) || systems.massKg() < 100 || systems.massKg() > 100_000) {
            throw new IllegalArgumentException("载具质量需在 100-100000 kg 之间");
        }
        if (systems.engines().size() > 12 || systems.horizontalRudders().size() > 12
                || systems.verticalRudders().size() > 12 || systems.guns().size() > 16) {
            throw new IllegalArgumentException("飞行系统部件数量超出限制");
        }

        Set<String> ids = new HashSet<>();
        for (EngineSpec engine : systems.engines()) {
            requireIdentity(engine.id(), engine.name(), "引擎", ids);
            validatePosition(engine.position(), engine.name());
            if (!Double.isFinite(engine.maxThrustN()) || engine.maxThrustN() < 0 || engine.maxThrustN() > 200_000) {
                throw new IllegalArgumentException(engine.name() + " 的最大推力需在 0-200000 N 之间");
            }
            validateMass(engine.massKg(), engine.name());
        }
        for (ControlSurfaceSpec surface : systems.horizontalRudders()) {
            requireIdentity(surface.id(), surface.name(), "水平舵", ids);
            validatePosition(surface.position(), surface.name());
            validateSurface(surface);
        }
        for (ControlSurfaceSpec surface : systems.verticalRudders()) {
            requireIdentity(surface.id(), surface.name(), "垂直舵", ids);
            validatePosition(surface.position(), surface.name());
            validateSurface(surface);
        }
        for (GunSpec gun : systems.guns()) {
            requireIdentity(gun.id(), gun.name(), "机炮", ids);
            validatePosition(gun.position(), gun.name());
            validateMass(gun.massKg(), gun.name());
        }
    }

    private static void requireIdentity(String id, String name, String kind, Set<String> ids) {
        if (id == null || id.isBlank() || id.length() > 80) {
            throw new IllegalArgumentException(kind + " ID 无效");
        }
        if (!ids.add(id)) {
            throw new IllegalArgumentException("飞行系统部件 ID 重复：" + id);
        }
        if (name == null || name.isBlank() || name.length() > 60) {
            throw new IllegalArgumentException(kind + "名称需为 1-60 个字符");
        }
    }

    private static void validateSurface(ControlSurfaceSpec surface) {
        if (!Double.isFinite(surface.areaM2()) || surface.areaM2() <= 0 || surface.areaM2() > 200) {
            throw new IllegalArgumentException(surface.name() + " 的舵面积需在 0-200 m² 之间");
        }
        validateMass(surface.massKg(), surface.name());
    }

    private static void validateMass(double massKg, String name) {
        if (!Double.isFinite(massKg) || massKg < 0 || massKg > 100_000) {
            throw new IllegalArgumentException(name + " 的质量需在 0-100000 kg 之间");
        }
    }

    private static void validatePosition(Vec3 position, String name) {
        if (position == null
                || Math.abs(position.x()) > 2000
                || Math.abs(position.y()) > 2000
                || Math.abs(position.z()) > 2000) {
            throw new IllegalArgumentException(name + " 的位置超出允许范围");
        }
    }
}
