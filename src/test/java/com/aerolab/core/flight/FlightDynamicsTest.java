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
        run(4.5);
        FlightState airborne = dynamics.snapshot();
        assertFalse(airborne.onGround(), "elevator input at takeoff speed should lift the aircraft");
        assertTrue(airborne.altitudeAglM() > 1.0);
        assertTrue(airborne.pitchDeg() > 0);

        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), false);
        run(4.0);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.ROLL_RIGHT), true);
        run(1.2);
        FlightState rolled = dynamics.snapshot();
        assertTrue(rolled.rollDeg() > 5, "ailerons should roll the aircraft, roll=" + rolled.rollDeg() + ", crashed=" + rolled.crashed());
    }

    @Test
    void remainsControllableAfterAShortRotationInput() {
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.THROTTLE_UP), true);
        run(9.0);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), true);
        run(1.5);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), false);
        run(20.0);
        FlightState state = dynamics.snapshot();
        assertFalse(state.crashed(), state.crashReason());
        assertFalse(state.onGround());
        assertTrue(state.speedMps() > 12, "speed after climb = " + state.speedMps());
        assertTrue(Math.abs(state.rollDeg()) < 90, "spiral divergence, roll=" + state.rollDeg());
    }

    @Test
    void individualEngineThrottleIsReflectedInTelemetry() {
        dynamics.setEngineThrottle("engine-left", 1.0);
        run(0.2);
        FlightState state = dynamics.snapshot();
        EngineState left = state.engines().stream()
                .filter(engine -> engine.id().equals("engine-left")).findFirst().orElseThrow();
        EngineState right = state.engines().stream()
                .filter(engine -> engine.id().equals("engine-right")).findFirst().orElseThrow();
        assertEquals(1.0, left.throttle(), 1e-9);
        assertEquals(0.0, right.throttle(), 1e-9);
        assertEquals(4200, left.thrustN(), 1e-9);
        assertEquals(0, right.thrustN(), 1e-9);
        assertEquals(4200, state.engineThrustN(), 1e-9);
    }

    @Test
    void weatherProducesWindAndCanBeDisabled() {
        dynamics.setWeatherEnabled(true);
        run(3.0);
        FlightState windy = dynamics.snapshot();
        assertTrue(windy.weatherEnabled());
        assertTrue(windy.windVelocity().length() > 2.0);

        dynamics.setWeatherEnabled(false);
        run(8.0);
        FlightState calm = dynamics.snapshot();
        assertFalse(calm.weatherEnabled());
        assertTrue(calm.windVelocity().length() < 0.2);
    }

    @Test
    void canTakeOffWithWeatherWindEnabled() {
        dynamics.setWeatherEnabled(true);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.THROTTLE_UP), true);
        run(9.0);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.PITCH_UP), true);
        run(4.0);
        FlightState state = dynamics.snapshot();
        assertFalse(state.crashed(), state.crashReason());
        assertFalse(state.onGround());
        assertTrue(state.altitudeAglM() > 1.0);
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

    @Test
    void nitroDoublesThrustForFourSecondsAndThenCoolsDown() {
        dynamics.setThrottle(1.0);
        run(0.05);
        double normalThrust = dynamics.snapshot().engineThrustN();
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.BOOST), true);
        run(0.1);
        dynamics.setKey(KeyBindings.defaults().codeFor(KeyBindings.BOOST), false);
        FlightState active = dynamics.snapshot();
        assertTrue(active.nitroActive());
        assertEquals(normalThrust * 2, active.engineThrustN(), 1e-6);
        assertEquals(2.0, active.nitroMultiplier(), 1e-9);

        run(4.2);
        FlightState cooling = dynamics.snapshot();
        assertFalse(cooling.nitroActive());
        assertTrue(cooling.nitroCooldownSeconds() > 0);
        assertEquals(normalThrust, cooling.engineThrustN(), 1e-6);
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
