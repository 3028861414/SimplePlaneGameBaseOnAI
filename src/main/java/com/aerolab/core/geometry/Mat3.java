package com.aerolab.core.geometry;

public record Mat3(
        double m00, double m01, double m02,
        double m10, double m11, double m12,
        double m20, double m21, double m22
) {

    public static final Mat3 IDENTITY = new Mat3(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
    );

    public Mat3 {
        if (!Double.isFinite(m00) || !Double.isFinite(m01) || !Double.isFinite(m02)
                || !Double.isFinite(m10) || !Double.isFinite(m11) || !Double.isFinite(m12)
                || !Double.isFinite(m20) || !Double.isFinite(m21) || !Double.isFinite(m22)) {
            throw new IllegalArgumentException("矩阵元素必须为有限数值");
        }
    }

    public static Mat3 diagonal(double x, double y, double z) {
        return new Mat3(x, 0, 0, 0, y, 0, 0, 0, z);
    }

    public Vec3 apply(Vec3 value) {
        return new Vec3(
                m00 * value.x() + m01 * value.y() + m02 * value.z(),
                m10 * value.x() + m11 * value.y() + m12 * value.z(),
                m20 * value.x() + m21 * value.y() + m22 * value.z()
        );
    }

    public Mat3 add(Mat3 other) {
        return new Mat3(
                m00 + other.m00, m01 + other.m01, m02 + other.m02,
                m10 + other.m10, m11 + other.m11, m12 + other.m12,
                m20 + other.m20, m21 + other.m21, m22 + other.m22
        );
    }

    public Mat3 inverse() {
        double c00 = m11 * m22 - m12 * m21;
        double c01 = m12 * m20 - m10 * m22;
        double c02 = m10 * m21 - m11 * m20;
        double determinant = m00 * c00 + m01 * c01 + m02 * c02;
        if (Math.abs(determinant) < 1e-12) {
            return IDENTITY;
        }
        double inv = 1.0 / determinant;
        return new Mat3(
                c00 * inv,
                (m02 * m21 - m01 * m22) * inv,
                (m01 * m12 - m02 * m11) * inv,
                c01 * inv,
                (m00 * m22 - m02 * m20) * inv,
                (m02 * m10 - m00 * m12) * inv,
                c02 * inv,
                (m01 * m20 - m00 * m21) * inv,
                (m00 * m11 - m01 * m10) * inv
        );
    }
}
