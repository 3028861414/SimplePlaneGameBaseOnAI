package com.aerolab.core.geometry;

public final class Rotations {

    private static final double DEG_TO_RAD = Math.PI / 180.0;

    private Rotations() {
    }

    public static Vec3 radians(Vec3 degrees) {
        return new Vec3(degrees.x() * DEG_TO_RAD, degrees.y() * DEG_TO_RAD, degrees.z() * DEG_TO_RAD);
    }

    public static Vec3 rotateXyz(Vec3 value, Vec3 degrees) {
        Vec3 r = radians(degrees);
        double cx = Math.cos(r.x());
        double sx = Math.sin(r.x());
        double cy = Math.cos(r.y());
        double sy = Math.sin(r.y());
        double cz = Math.cos(r.z());
        double sz = Math.sin(r.z());

        double x1 = cz * value.x() - sz * value.y();
        double y1 = sz * value.x() + cz * value.y();
        double z1 = value.z();

        double x2 = cy * x1 + sy * z1;
        double z2 = -sy * x1 + cy * z1;

        return new Vec3(x2, cx * y1 - sx * z2, sx * y1 + cx * z2);
    }

    public static Vec3 inverseRotateXyz(Vec3 value, Vec3 degrees) {
        Vec3 r = radians(degrees);
        double cx = Math.cos(r.x());
        double sx = Math.sin(r.x());
        double cy = Math.cos(r.y());
        double sy = Math.sin(r.y());
        double cz = Math.cos(r.z());
        double sz = Math.sin(r.z());

        double y1 = cx * value.y() + sx * value.z();
        double z1 = -sx * value.y() + cx * value.z();
        double x1 = value.x();

        double x2 = cy * x1 - sy * z1;
        double z2 = sy * x1 + cy * z1;

        return new Vec3(cz * x2 + sz * y1, -sz * x2 + cz * y1, z2);
    }
}
