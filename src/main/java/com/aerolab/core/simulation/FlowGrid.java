package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Vec3;

/**
 * Structured grid in wind-aligned coordinates. Index order is
 * {@code i + nx * (j + ny * k)} where x is downstream.
 */
public record FlowGrid(
        int nx,
        int ny,
        int nz,
        Vec3 origin,
        Vec3 stepX,
        Vec3 stepY,
        Vec3 stepZ
) {

    public FlowGrid {
        if (nx < 2 || ny < 2 || nz < 2) {
            throw new IllegalArgumentException("流场网格尺寸无效");
        }
    }

    public int size() {
        return nx * ny * nz;
    }

    public int index(int i, int j, int k) {
        return i + nx * (j + ny * k);
    }

    public Vec3 position(int i, int j, int k) {
        return origin
                .add(stepX.multiply(i))
                .add(stepY.multiply(j))
                .add(stepZ.multiply(k));
    }

    public Vec3 worldMin() {
        Vec3 a = origin;
        Vec3 b = origin.add(stepX.multiply(nx - 1)).add(stepY.multiply(ny - 1)).add(stepZ.multiply(nz - 1));
        return new Vec3(
                Math.min(a.x(), b.x()),
                Math.min(a.y(), b.y()),
                Math.min(a.z(), b.z())
        );
    }

    public Vec3 worldMax() {
        Vec3 a = origin;
        Vec3 b = origin.add(stepX.multiply(nx - 1)).add(stepY.multiply(ny - 1)).add(stepZ.multiply(nz - 1));
        return new Vec3(
                Math.max(a.x(), b.x()),
                Math.max(a.y(), b.y()),
                Math.max(a.z(), b.z())
        );
    }
}
