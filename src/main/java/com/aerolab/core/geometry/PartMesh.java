package com.aerolab.core.geometry;

import com.aerolab.core.model.ModelPart;

import java.util.List;

public record PartMesh(ModelPart part, List<MeshTriangle> triangles, Aabb bounds) {

    public PartMesh {
        triangles = List.copyOf(triangles);
    }

    public double surfaceArea() {
        return triangles.stream().mapToDouble(MeshTriangle::area).sum();
    }
}
