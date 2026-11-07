package com.aerolab.core.flight;

import com.aerolab.core.geometry.TestModels;
import com.aerolab.core.world.TerrainWorld;
import com.aerolab.core.world.WorldGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FlightDynamicsTest {

    private TerrainWorld world;
    private FlightDynamics dynamics;

    @BeforeEach
    void setUp() {
        world = new WorldGenerator().generate();
        dynamics = new FlightDynamics(
                world,
                new AircraftDefinition(
                        TestModels.aircraft(),
                        FlightSystemsFactory.defaults(),
                        KeyBindings.defaults()
                )
        );
    }

    @Test
    void startsOnRunwayAndCanTakeOffWithThrottleAndElevator() {
        FlightState initial = dynamics.snapshot();
        assertTrue(initial.onGround());
        assertEquals(0, initial.speedMps(), 0.001);
        assertTrue(world.runway().contains(initial.position().x(), initial.position().z()));

        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.THROTTLE_UP), true);
        run(9.0);
        FlightState rolling = dynamics.snapshot();
        assertTrue(rolling.speedMps() > 20, "aircraft should accelerate along the runway");
        assertTrue(rolling.throttle() > 0.8);

        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), true);
        run(2.5);
        FlightState airborne = dynamics.snapshot();
        assertFalse(airborne.onGround(), "elevator input at takeoff speed should lift the aircraft");
        assertTrue(airborne.altitudeAglM() > 1.42);
        assertTrue(airborne.pitchDeg() > 0);

        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), false);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.YAW_RIGHT), true);
        double heading = dynamics.snapshot().headingDeg();
        run(1.2);
        FlightState turning = dynamics.snapshot();
        assertTrue(turning.headingDeg() > heading || Math.abs(turning.headingDeg() - heading) > 350);
        assertTrue(turning.rollDeg() > 5, "bank should coordinate the turn, roll=" + turning.rollDeg() + ", heading=" + turning.headingDeg() + ", crashed=" + turning.crashed());
    }

    @Test
    void resetRestoresRunwayStart() {
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.THROTTLE_UP), true);
        run(2);
        dynamics.reset();
        FlightState state = dynamics.snapshot();
        assertTrue(state.onGround());
        assertEquals(0, state.speedMps(), 0.001);
        assertEquals(0, state.timeSeconds(), 0.001);
        assertEquals(0, state.throttle(), 0.001);
        assertNotNull(state.position());
    }

    @Test
    void customBindingsAreResolvedByTheCore() {
        KeyBindings custom = new KeyBindings(java.util.Map.of(KeyBindings.THROTTLE_UP, "KeyI"));
        FlightDynamics bound = new FlightDynamics(
                world,
                new AircraftDefinition(TestModels.aircraft(), FlightSystemsFactory.defaults(), custom)
        );
        bound.setKey("KeyW", true);
        run(bound, 1.5);
        assertEquals(0, bound.throttle(), 0.001);
        bound.setKey("KeyW", false);
        bound.setKey("KeyI", true);
        run(bound, 1.5);
        assertTrue(bound.throttle() > 0.5);
    }

    private void run(double seconds) {
        run(dynamics, seconds);
    }

    private void run(FlightDynamics target, double seconds) {
        int steps = (int) Math.round(seconds * 60);
        for (int i = 0; i < steps; i++) {
            target.step(1.0 / 60.0);
        }
    }
}
