package com.aerolab.core.flight;

import com.aerolab.core.geometry.Quat;
import com.aerolab.core.geometry.Vec3;

import java.util.List;

public record FlightState(
        double timeSeconds,
        Vec3 position,
        Vec3 velocity,
        Quat orientation,
        double speedMps,
        double verticalSpeedMps,
        double altitudeMslM,
        double altitudeAglM,
        double headingDeg,
        double pitchDeg,
        double rollDeg,
        double throttle,
        double engineThrustN,
        List<EngineState> engines,
        boolean weatherEnabled,
        Vec3 windVelocity,
        double liftN,
        double dragN,
        double angleOfAttackDeg,
        double massKg,
        Vec3 centerOfMass,
        double gLoad,
        boolean onGround,
        boolean crashed,
        boolean stalled,
        boolean outsideWorld,
        String crashReason
) {
}
