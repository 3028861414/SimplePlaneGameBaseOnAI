package com.aerolab.core.geometry;

import java.util.Locale;
import java.util.Objects;

public record Vec3(double x, double y, double z) {

    public static final Vec3 ZERO = new Vec3(0, 0, 0);
    public static final Vec3 UP = new Vec3(0, 1, 0);

    public Vec3 {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new IllegalArgumentException("坐标必须为有限数值");
        }
    }

    public Vec3 add(Vec3 other) {
        return new Vec3(x + other.x, y + other.y, z + other.z);
    }

    public Vec3 subtract(Vec3 other) {
        return new Vec3(x - other.x, y - other.y, z - other.z);
    }

    public Vec3 multiply(double scalar) {
        return new Vec3(x * scalar, y * scalar, z * scalar);
    }

    public Vec3 multiply(Vec3 other) {
        return new Vec3(x * other.x, y * other.y, z * other.z);
    }

    public Vec3 divide(Vec3 other) {
        return new Vec3(x / other.x, y / other.y, z / other.z);
    }

    public double dot(Vec3 other) {
        return x * other.x + y * other.y + z * other.z;
    }

    public Vec3 cross(Vec3 other) {
        return new Vec3(
                y * other.z - z * other.y,
                z * other.x - x * other.z,
                x * other.y - y * other.x
        );
    }

    public double lengthSquared() {
        return dot(this);
    }

    public double length() {
        return Math.sqrt(lengthSquared());
    }

    public Vec3 normalized() {
        double length = length();
        if (length < 1e-12) {
            return ZERO;
        }
        return multiply(1.0 / length);
    }

    public Vec3 withX(double value) {
        return new Vec3(value, y, z);
    }

    public Vec3 withY(double value) {
        return new Vec3(x, value, z);
    }

    public Vec3 withZ(double value) {
        return new Vec3(x, y, value);
    }

    public double get(int axis) {
        return switch (axis) {
            case 0 -> x;
            case 1 -> y;
            case 2 -> z;
            default -> throw new IllegalArgumentException("轴索引必须为 0、1 或 2");
        };
    }

    public Vec3 with(int axis, double value) {
        return switch (axis) {
            case 0 -> withX(value);
            case 1 -> withY(value);
            case 2 -> withZ(value);
            default -> throw new IllegalArgumentException("轴索引必须为 0、1 或 2");
        };
    }

    public static Vec3 of(double... values) {
        Objects.requireNonNull(values, "values");
        if (values.length != 3) {
            throw new IllegalArgumentException("Vec3 需要三个分量");
        }
        return new Vec3(values[0], values[1], values[2]);
    }

    public String format(double scale) {
        return String.format(Locale.ROOT, "%.2f, %.2f, %.2f", x * scale, y * scale, z * scale);
    }
}
