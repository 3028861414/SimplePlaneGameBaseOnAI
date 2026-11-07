package com.aerolab.core.model;

import com.aerolab.core.geometry.Rotations;
import com.aerolab.core.geometry.Vec3;

public record CockpitCamera(Vec3 position, double yawDegrees, double pitchDegrees) {

    public CockpitCamera {
        if (position == null) {
            throw new IllegalArgumentException("驾驶舱位置不能为空");
        }
    }

    public Vec3 forwardDirection() {
        double pitch = Math.toRadians(pitchDegrees);
        Vec3 forward = Rotations.rotateXyz(
                new Vec3(Math.cos(pitch), Math.sin(pitch), 0),
                new Vec3(0, yawDegrees, 0)
        );
        return forward.normalized();
    }
}
