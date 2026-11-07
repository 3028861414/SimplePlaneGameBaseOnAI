package com.aerolab.core.geometry;

public record Aabb(Vec3 min, Vec3 max) {

    public Aabb {
        if (min == null || max == null) {
            throw new IllegalArgumentException("包围盒边界不能为空");
        }
    }

    public static Aabb fromPoints(Iterable<Vec3> points) {
        double minX = Double.POSITIVE_INFINITY;
        double minY = Double.POSITIVE_INFINITY;
        double minZ = Double.POSITIVE_INFINITY;
        double maxX = Double.NEGATIVE_INFINITY;
        double maxY = Double.NEGATIVE_INFINITY;
        double maxZ = Double.NEGATIVE_INFINITY;
        boolean any = false;
        for (Vec3 point : points) {
            any = true;
            minX = Math.min(minX, point.x());
            minY = Math.min(minY, point.y());
            minZ = Math.min(minZ, point.z());
            maxX = Math.max(maxX, point.x());
            maxY = Math.max(maxY, point.y());
            maxZ = Math.max(maxZ, point.z());
        }
        if (!any) {
            throw new IllegalArgumentException("无法从空点集创建包围盒");
        }
        return new Aabb(new Vec3(minX, minY, minZ), new Vec3(maxX, maxY, maxZ));
    }

    public static Aabb union(Aabb a, Aabb b) {
        return new Aabb(
                new Vec3(Math.min(a.min.x(), b.min.x()), Math.min(a.min.y(), b.min.y()), Math.min(a.min.z(), b.min.z())),
                new Vec3(Math.max(a.max.x(), b.max.x()), Math.max(a.max.y(), b.max.y()), Math.max(a.max.z(), b.max.z()))
        );
    }

    public Aabb expand(double margin) {
        Vec3 delta = new Vec3(margin, margin, margin);
        return new Aabb(min.subtract(delta), max.add(delta));
    }

    public Vec3 size() {
        return max.subtract(min);
    }

    public Vec3 center() {
        return min.add(max).multiply(0.5);
    }

    public double diagonal() {
        return size().length();
    }

    public Aabb inFrame(Vec3 axisX, Vec3 axisY, Vec3 axisZ) {
        Vec3[] corners = {
                new Vec3(min.x(), min.y(), min.z()),
                new Vec3(max.x(), min.y(), min.z()),
                new Vec3(min.x(), max.y(), min.z()),
                new Vec3(min.x(), min.y(), max.z()),
                new Vec3(max.x(), max.y(), min.z()),
                new Vec3(max.x(), min.y(), max.z()),
                new Vec3(min.x(), max.y(), max.z()),
                new Vec3(max.x(), max.y(), max.z())
        };
        Vec3[] rotated = new Vec3[8];
        for (int i = 0; i < corners.length; i++) {
            Vec3 p = corners[i];
            rotated[i] = new Vec3(p.dot(axisX), p.dot(axisY), p.dot(axisZ));
        }
        return Aabb.fromPoints(java.util.Arrays.asList(rotated));
    }

    public Vec3 cornerWorld(Vec3 axisX, Vec3 axisY, Vec3 axisZ, int ix, int iy, int iz) {
        double x = ix == 0 ? min.x() : max.x();
        double y = iy == 0 ? min.y() : max.y();
        double z = iz == 0 ? min.z() : max.z();
        return axisX.multiply(x).add(axisY.multiply(y)).add(axisZ.multiply(z));
    }
}
