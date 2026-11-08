package com.aerolab.web.flight;

import com.aerolab.core.flight.FlightState;
import com.aerolab.web.dto.ModelDto;

import java.util.List;

public record FlightStateDto(
        double timeSeconds,
        ModelDto.Vec3Dto position,
        ModelDto.Vec3Dto velocity,
        QuatDto orientation,
        double speedMps,
        double verticalSpeedMps,
        double altitudeMslM,
        double altitudeAglM,
        double headingDeg,
        double pitchDeg,
        double rollDeg,
        double throttle,
        double engineThrustN,
        List<EngineStateDto> engines,
        boolean weatherEnabled,
        ModelDto.Vec3Dto windVelocity,
        double liftN,
        double dragN,
        double angleOfAttackDeg,
        double massKg,
        ModelDto.Vec3Dto centerOfMass,
        double gLoad,
        boolean onGround,
        boolean crashed,
        boolean stalled,
        boolean outsideWorld,
        String crashReason,
        boolean nitroActive,
        double nitroRemainingSeconds,
        double nitroCooldownSeconds,
        double nitroDurationSeconds,
        double nitroCooldownDurationSeconds,
        double nitroMultiplier,
        String autopilotTemplate,
        double autopilotProgress
) {

    public record QuatDto(double x, double y, double z, double w) {
    }

    public record EngineStateDto(
            String id,
            String name,
            double throttle,
            double thrustN,
            double maxThrustN
    ) {
    }

    public static FlightStateDto from(FlightState state) {
        return from(state, null, 0);
    }

    public static FlightStateDto from(FlightState state, String autopilotTemplate, double autopilotProgress) {
        return new FlightStateDto(
                state.timeSeconds(),
                new ModelDto.Vec3Dto(state.position().x(), state.position().y(), state.position().z()),
                new ModelDto.Vec3Dto(state.velocity().x(), state.velocity().y(), state.velocity().z()),
                new QuatDto(
                        state.orientation().x(),
                        state.orientation().y(),
                        state.orientation().z(),
                        state.orientation().w()
                ),
                state.speedMps(),
                state.verticalSpeedMps(),
                state.altitudeMslM(),
                state.altitudeAglM(),
                state.headingDeg(),
                state.pitchDeg(),
                state.rollDeg(),
                state.throttle(),
                state.engineThrustN(),
                state.engines().stream()
                        .map(engine -> new EngineStateDto(
                                engine.id(),
                                engine.name(),
                                engine.throttle(),
                                engine.thrustN(),
                                engine.maxThrustN()
                        ))
                        .toList(),
                state.weatherEnabled(),
                new ModelDto.Vec3Dto(
                        state.windVelocity().x(),
                        state.windVelocity().y(),
                        state.windVelocity().z()
                ),
                state.liftN(),
                state.dragN(),
                state.angleOfAttackDeg(),
                state.massKg(),
                new ModelDto.Vec3Dto(
                        state.centerOfMass().x(),
                        state.centerOfMass().y(),
                        state.centerOfMass().z()
                ),
                state.gLoad(),
                state.onGround(),
                state.crashed(),
                state.stalled(),
                state.outsideWorld(),
                state.crashReason(),
                state.nitroActive(),
                state.nitroRemainingSeconds(),
                state.nitroCooldownSeconds(),
                state.nitroDurationSeconds(),
                state.nitroCooldownDurationSeconds(),
                state.nitroMultiplier(),
                autopilotTemplate,
                autopilotProgress
        );
    }
}
