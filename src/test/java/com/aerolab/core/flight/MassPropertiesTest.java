package com.aerolab.core.flight;

import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.CockpitCamera;
import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.ShapeType;
import com.aerolab.core.model.VehicleModel;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MassPropertiesTest {

    @Test
    void centerOfMassFollowsPartMasses() {
        VehicleModel model = new VehicleModel(
                "Mass test",
                List.of(
                        part("light", new Vec3(-1, 0, 0), 10),
                        part("heavy", new Vec3(1, 0, 0), 90)
                ),
                new CockpitCamera(new Vec3(0, 1, 0), 0, 0)
        );

        MassProperties properties = MassProperties.from(model, emptySystems());

        assertEquals(100, properties.massKg(), 1e-9);
        assertEquals(0.8, properties.centerOfMass().x(), 1e-9);
        assertTrue(properties.inertia().m00() > 0);
        assertTrue(properties.inertia().m11() > 0);
        assertTrue(properties.inertia().m22() > 0);
    }

    @Test
    void fallbackMassUsesConfiguredTotalWhenPartsAreMassless() {
        VehicleModel model = new VehicleModel(
                "Legacy test",
                List.of(part("a", new Vec3(0, 0, 0), 0), part("b", new Vec3(2, 0, 0), 0)),
                new CockpitCamera(new Vec3(0, 1, 0), 0, 0)
        );

        MassProperties properties = MassProperties.from(model, emptySystems());

        assertEquals(1350, properties.massKg(), 1e-9);
        assertEquals(1.0, properties.centerOfMass().x(), 1e-9);
    }

    private static ModelPart part(String id, Vec3 position, double massKg) {
        return new ModelPart(
                id,
                id,
                ShapeType.BOX,
                position,
                Vec3.ZERO,
                new Vec3(1, 1, 1),
                "#ffffff",
                massKg,
                false
        );
    }

    private static FlightSystems emptySystems() {
        return new FlightSystems(List.of(), List.of(), List.of(), List.of(), 1350);
    }
}
