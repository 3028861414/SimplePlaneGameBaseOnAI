package com.aerolab.core.model;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.Rotations;
import com.aerolab.core.geometry.Vec3;

import java.util.List;

public record ModelPart(
        String id,
        String name,
        ShapeType shape,
        Vec3 position,
        Vec3 rotation,
        Vec3 size,
        String color,
        double massKg,
        boolean liftingSurface
) {

    public ModelPart {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("部件 ID 不能为空");
        }
        if (shape == null) {
            throw new IllegalArgumentException("部件形状不能为空");
        }
        if (position == null || rotation == null || size == null) {
            throw new IllegalArgumentException("部件变换不能为空");
        }
        if (!Double.isFinite(massKg) || massKg < 0) {
            throw new IllegalArgumentException("部件质量必须为非负有限数值");
        }
    }

    public ModelPart(
            String id,
            String name,
            ShapeType shape,
            Vec3 position,
            Vec3 rotation,
            Vec3 size,
            String color
    ) {
        this(id, name, shape, position, rotation, size, color, 0, inferLiftingSurface(shape, size));
    }

    public static boolean inferLiftingSurface(ShapeType shape, Vec3 size) {
        if (shape != ShapeType.BOX && shape != ShapeType.ELLIPSOID) return false;
        double span = Math.max(size.x(), size.z());
        return span >= 0.5 && size.y() <= Math.min(size.x(), size.z()) * 0.35;
    }

    public Vec3 toLocal(Vec3 worldPoint) {
        return Rotations.inverseRotateXyz(worldPoint.subtract(position), rotation);
    }

    public Vec3 toWorld(Vec3 localPoint) {
        return Rotations.rotateXyz(localPoint.multiply(size), rotation).add(position);
    }

    public Vec3 normalizedLocal(Vec3 worldPoint) {
        Vec3 local = toLocal(worldPoint);
        return new Vec3(local.x() / size.x(), local.y() / size.y(), local.z() / size.z());
    }

    public Vec3 normalToWorld(Vec3 unitLocalNormal) {
        Vec3 inverseScaled = new Vec3(
                unitLocalNormal.x() / size.x(),
                unitLocalNormal.y() / size.y(),
                unitLocalNormal.z() / size.z()
        );
        return Rotations.rotateXyz(inverseScaled, rotation).normalized();
    }

    public boolean contains(Vec3 worldPoint) {
        Vec3 p = normalizedLocal(worldPoint);
        return switch (shape) {
            case BOX -> Math.abs(p.x()) <= 0.5 && Math.abs(p.y()) <= 0.5 && Math.abs(p.z()) <= 0.5;
            case ELLIPSOID -> p.lengthSquared() <= 0.25;
            case CYLINDER -> p.x() * p.x() + p.z() * p.z() <= 0.25 && Math.abs(p.y()) <= 0.5;
            case CONE -> {
                double radial = Math.hypot(p.x(), p.z());
                yield p.y() >= -0.5 && p.y() <= 0.5 && radial <= 0.5 * (0.5 - p.y());
            }
        };
    }

    public Aabb localBounds() {
        Vec3 half = size.multiply(0.5);
        List<Vec3> corners = List.of(
                new Vec3(-half.x(), -half.y(), -half.z()),
                new Vec3(half.x(), -half.y(), -half.z()),
                new Vec3(-half.x(), half.y(), -half.z()),
                new Vec3(-half.x(), -half.y(), half.z()),
                new Vec3(half.x(), half.y(), -half.z()),
                new Vec3(half.x(), -half.y(), half.z()),
                new Vec3(-half.x(), half.y(), half.z()),
                new Vec3(half.x(), half.y(), half.z())
        );
        return Aabb.fromPoints(corners.stream().map(this::toWorld).toList());
    }
}
