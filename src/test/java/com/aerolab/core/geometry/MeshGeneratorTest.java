package com.aerolab.core.geometry;

import com.aerolab.core.model.ShapeType;
import com.aerolab.core.model.VehicleModel;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MeshGeneratorTest {

    private final MeshGenerator generator = new MeshGenerator();

    @Test
    void closedMeshesHaveOutwardWindingAndExpectedVolume() {
        assertVolume(ShapeType.BOX, new Vec3(2, 3, 4), 24.0, 0.01);
        assertVolume(ShapeType.ELLIPSOID, new Vec3(2, 2, 2), 4.0 / 3.0 * Math.PI, 0.03);
        assertVolume(ShapeType.CYLINDER, new Vec3(2, 4, 2), Math.PI * 4.0, 0.02);
        assertVolume(ShapeType.CONE, new Vec3(2, 4, 2), Math.PI * 4.0 / 3.0, 0.02);
    }

    @Test
    void everyPartProducesTrianglesAndBounds() {
        VehicleModel model = TestModels.aircraft();
        List<PartMesh> meshes = generator.generate(model);

        assertEquals(model.parts().size(), meshes.size());
        for (PartMesh mesh : meshes) {
            assertFalse(mesh.triangles().isEmpty());
            assertTrue(mesh.surfaceArea() > 0);
            assertTrue(mesh.bounds().size().length() > 0);
        }
    }

    private void assertVolume(ShapeType shape, Vec3 size, double expected, double relativeTolerance) {
        VehicleModel model = TestModels.singleShape(shape, size);
        PartMesh mesh = generator.generate(model).getFirst();
        double volume = 0;
        for (MeshTriangle triangle : mesh.triangles()) {
            volume += triangle.a().dot(triangle.b().cross(triangle.c())) / 6.0;
        }
        double relativeError = Math.abs(volume - expected) / expected;
        assertTrue(relativeError < relativeTolerance,
                shape + " volume was " + volume + ", expected " + expected);
    }
}
