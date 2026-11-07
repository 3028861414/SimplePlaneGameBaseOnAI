package com.aerolab.web.flight;

import com.aerolab.core.flight.FlightState;
import com.aerolab.web.dto.ModelDto;

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
        double gLoad,
        boolean onGround,
        boolean crashed,
        boolean stalled,
        boolean outsideWorld,
        String crashReason
) {

    public record QuatDto(double x, double y, double z, double w) {
    }

    public static FlightStateDto from(FlightState state) {
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
                state.gLoad(),
                state.onGround(),
                state.crashed(),
                state.stalled(),
                state.outsideWorld(),
                state.crashReason()
        );
    }
}
