package com.aerolab.core.geometry;

import com.aerolab.core.model.CockpitCamera;
import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.ShapeType;
import com.aerolab.core.model.VehicleModel;

import java.util.List;

public final class TestModels {

    private TestModels() {
    }

    public static VehicleModel singleShape(ShapeType shape, Vec3 size) {
        ModelPart part = new ModelPart(
                "part-1",
                "Test part",
                shape,
                new Vec3(0, 0, 0),
                Vec3.ZERO,
                size,
                "#33ccbb"
        );
        return new VehicleModel(
                "Test model",
                List.of(part),
                new CockpitCamera(new Vec3(0, 1, 0), 0, 0)
        );
    }

    public static VehicleModel aircraft() {
        List<ModelPart> parts = List.of(
                new ModelPart("fuselage", "Fuselage", ShapeType.CYLINDER,
                        new Vec3(0, 0, 0), new Vec3(0, 0, -90), new Vec3(1.0, 4.8, 1.0), "#c9d7df"),
                new ModelPart("nose", "Nose", ShapeType.CONE,
                        new Vec3(2.9, 0, 0), new Vec3(0, 0, -90), new Vec3(1.0, 1.0, 1.0), "#a9bcc7"),
                new ModelPart("wing-left", "Wing left", ShapeType.BOX,
                        new Vec3(-0.3, 0.05, -2.0), new Vec3(0, 0, 0), new Vec3(1.6, 0.1, 4.0), "#35c6b1"),
                new ModelPart("wing-right", "Wing right", ShapeType.BOX,
                        new Vec3(-0.3, 0.05, 2.0), new Vec3(0, 0, 0), new Vec3(1.6, 0.1, 4.0), "#35c6b1"),
                new ModelPart("tailplane", "Tailplane", ShapeType.BOX,
                        new Vec3(-2.3, 0.12, 0), new Vec3(0, 0, 0), new Vec3(0.9, 0.08, 3.0), "#2eab99"),
                new ModelPart("fin", "Fin", ShapeType.BOX,
                        new Vec3(-2.2, 0.6, 0), new Vec3(0, 0, 0), new Vec3(0.96, 1.12, 0.08), "#4ac8b3"),
                new ModelPart("canopy", "Canopy", ShapeType.ELLIPSOID,
                        new Vec3(1.1, 0.5, 0), new Vec3(0, 0, 0), new Vec3(0.9, 0.35, 0.55), "#123d49")
        );
        return new VehicleModel(
                "Test aircraft",
                parts,
                new CockpitCamera(new Vec3(1.1, 0.75, 0), 0, -3)
        );
    }
}
