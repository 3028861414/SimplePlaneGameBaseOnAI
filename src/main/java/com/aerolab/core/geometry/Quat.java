package com.aerolab.core.geometry;

public record Quat(double x, double y, double z, double w) {

    public static final Quat IDENTITY = new Quat(0, 0, 0, 1);

    public Quat {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) || !Double.isFinite(w)) {
            throw new IllegalArgumentException("四元数必须为有限数值");
        }
    }

    public Quat normalized() {
        double length = Math.sqrt(x * x + y * y + z * z + w * w);
        if (length < 1e-12) {
            return IDENTITY;
        }
        return new Quat(x / length, y / length, z / length, w / length);
    }

    public Quat conjugate() {
        return new Quat(-x, -y, -z, w);
    }

    public Quat multiply(Quat other) {
        return new Quat(
                w * other.x + x * other.w + y * other.z - z * other.y,
                w * other.y - x * other.z + y * other.w + z * other.x,
                w * other.z + x * other.y - y * other.x + z * other.w,
                w * other.w - x * other.x - y * other.y - z * other.z
        );
    }

    public Vec3 rotate(Vec3 value) {
        Vec3 q = new Vec3(x, y, z);
        Vec3 t = q.cross(value).multiply(2);
        return value.add(t.multiply(w)).add(q.cross(t));
    }

    public static Quat fromAxisAngle(Vec3 unitAxis, double radians) {
        Vec3 axis = unitAxis.normalized();
        double half = radians * 0.5;
        double sin = Math.sin(half);
        return new Quat(axis.x() * sin, axis.y() * sin, axis.z() * sin, Math.cos(half));
    }

    public static Quat fromYawPitchRoll(double yaw, double pitch, double roll) {
        Quat qYaw = fromAxisAngle(Vec3.UP, yaw);
        Quat qPitch = fromAxisAngle(new Vec3(0, 0, 1), pitch);
        Quat qRoll = fromAxisAngle(new Vec3(1, 0, 0), roll);
        return qYaw.multiply(qPitch).multiply(qRoll).normalized();
    }
}
