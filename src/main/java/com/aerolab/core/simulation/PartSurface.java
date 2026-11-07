package com.aerolab.core.simulation;

public record PartSurface(
        String id,
        String name,
        String color,
        float[] positions,
        float[] normals,
        float[] pressureCoefficient,
        float[] speed
) {

    public PartSurface {
        int vertices = positions.length / 3;
        if (positions.length == 0
                || positions.length % 9 != 0
                || normals.length != positions.length
                || pressureCoefficient.length != vertices
                || speed.length != vertices) {
            throw new IllegalArgumentException("表面数组长度不一致");
        }
    }

    public int vertexCount() {
        return positions.length / 3;
    }

    public double surfaceArea() {
        double area = 0;
        for (int i = 0; i < positions.length; i += 9) {
            double abx = positions[i + 3] - positions[i];
            double aby = positions[i + 4] - positions[i + 1];
            double abz = positions[i + 5] - positions[i + 2];
            double acx = positions[i + 6] - positions[i];
            double acy = positions[i + 7] - positions[i + 1];
            double acz = positions[i + 8] - positions[i + 2];
            double cx = aby * acz - abz * acy;
            double cy = abz * acx - abx * acz;
            double cz = abx * acy - aby * acx;
            area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
        }
        return area;
    }
}
