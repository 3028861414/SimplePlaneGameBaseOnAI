package com.aerolab.core.simulation;

import com.aerolab.core.geometry.TestModels;
import com.aerolab.core.model.VehicleModel;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SimplifiedAerodynamicSimulatorTest {

    private final SimplifiedAerodynamicSimulator simulator = new SimplifiedAerodynamicSimulator();

    @Test
    void producesSurfaceAndFlowFieldsForAircraft() {
        VehicleModel model = TestModels.aircraft();
        FlowConditions conditions = new FlowConditions(new com.aerolab.core.geometry.Vec3(-1, 0, 0), 38, 1.225);

        SimulationResult result = simulator.simulate(model, conditions);

        assertEquals(model.parts().size(), result.surfaces().size());
        assertTrue(result.computeTimeMs() >= 0);
        assertEquals(38, result.conditions().windSpeedMps());
        assertEquals(0.5 * 1.225 * 38 * 38, result.summary().dynamicPressurePa(), 1e-9);
        assertTrue(result.summary().dragN() > 0, "pressure drag must point downstream");
        assertTrue(result.summary().maxFlowSpeedMps() > 38);
        assertTrue(result.summary().surfaceAreaM2() > 20);
        assertTrue(result.summary().minCp() < 0);
        assertTrue(result.summary().maxCp() > 0);

        FlowField flow = result.flow();
        assertTrue(flow.grid().nx() > 10);
        assertTrue(flow.grid().ny() > 10);
        assertTrue(flow.grid().nz() > 10);
        assertEquals(flow.grid().size(), flow.speed().length);
        assertEquals(flow.grid().size(), flow.pressureCoefficient().length);
        assertEquals(flow.grid().size(), flow.velocityX().length);

        long fluidSamples = 0;
        for (int i = 0; i < flow.speed().length; i++) {
            if (Float.isFinite(flow.speed()[i])) {
                fluidSamples++;
                assertTrue(flow.speed()[i] >= 0);
                assertTrue(flow.pressureCoefficient()[i] >= -2.2f && flow.pressureCoefficient()[i] <= 1.0f + 1e-6);
            }
        }
        assertTrue(fluidSamples > flow.grid().size() * 0.8, "most of the domain should be fluid");

        for (PartSurface surface : result.surfaces()) {
            assertTrue(surface.positions().length > 0);
            assertEquals(surface.positions().length / 3, surface.pressureCoefficient().length);
            assertEquals(surface.positions().length / 3, surface.speed().length);
            assertTrue(surface.positions().length % 9 == 0);
        }
    }

    @Test
    void scalesFlowAndLoadsWithWindSpeed() {
        VehicleModel model = TestModels.aircraft();
        SimulationResult slow = simulator.simulate(model, new FlowConditions(new com.aerolab.core.geometry.Vec3(-1, 0, 0), 20, 1.225));
        SimulationResult fast = simulator.simulate(model, new FlowConditions(new com.aerolab.core.geometry.Vec3(-1, 0, 0), 40, 1.225));

        assertTrue(fast.summary().maxFlowSpeedMps() > slow.summary().maxFlowSpeedMps());
        assertTrue(Math.abs(fast.summary().dragN()) > Math.abs(slow.summary().dragN()));
        assertTrue(fast.summary().dynamicPressurePa() > slow.summary().dynamicPressurePa());
        assertEquals(4.0, fast.summary().dynamicPressurePa() / slow.summary().dynamicPressurePa(), 0.001);
    }

    @Test
    void sideWindChangesFlowDirection() {
        VehicleModel model = TestModels.aircraft();
        SimulationResult result = simulator.simulate(model, new FlowConditions(new com.aerolab.core.geometry.Vec3(0, 0, -1), 30, 1.225));
        double[] direction = {result.windDirection().x(), result.windDirection().y(), result.windDirection().z()};
        assertEquals(0, direction[0], 1e-9);
        assertEquals(-1, direction[2], 1e-9);

        List<PartSurface> surfaces = result.surfaces();
        assertFalse(surfaces.isEmpty());
        assertTrue(result.summary().sideForceN() != 0, "a side wind should produce a lateral force component");
    }
}
