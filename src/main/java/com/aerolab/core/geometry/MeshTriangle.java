package com.aerolab.core.geometry;

public record MeshTriangle(Vec3 a, Vec3 b, Vec3 c, Vec3 normalA, Vec3 normalB, Vec3 normalC) {

    public Vec3 geometricNormal() {
        return b.subtract(a).cross(c.subtract(a)).normalized();
    }

    public double area() {
        return b.subtract(a).cross(c.subtract(a)).length() * 0.5;
    }
}
