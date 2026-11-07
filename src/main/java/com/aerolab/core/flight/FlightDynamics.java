package com.aerolab.core.flight;

import com.aerolab.core.geometry.Quat;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.world.TerrainWorld;

public final class FlightDynamics {

    private static final Vec3 LOCAL_FORWARD = new Vec3(1, 0, 0);
    private static final Vec3 LOCAL_UP = new Vec3(0, 1, 0);
    private static final Vec3 LOCAL_RIGHT = new Vec3(0, 0, 1);
    private static final double GRAVITY = 9.80665;
    private static final double AIR_DENSITY = 1.225;
    private static final double DRAG_AREA = 1.15;
    private static final double GEAR_CLEARANCE = 1.42;
    private static final double TAKEOFF_SPEED = 30;
    private static final double STALL_SPEED = 23;
    private static final double MAX_SPEED = 160;
    private static final double MAX_PITCH_RATE = Math.toRadians(26);
    private static final double MAX_YAW_RATE = Math.toRadians(17);
    private static final double MAX_BANK = Math.toRadians(38);
    private static final double THROTTLE_RATE = 0.62;

    private final TerrainWorld world;
    private final FlightSystems systems;
    private final KeyBindings bindings;
    private final FlightControlState controls = new FlightControlState();
    private final double massKg;
    private final double maxThrustN;
    private final double pitchAuthority;
    private final double yawAuthority;
    private final double weightedEngineY;
    private final double weightedEngineZ;

    private Vec3 position;
    private Vec3 velocity = Vec3.ZERO;
    private double yaw;
    private double pitch;
    private double roll;
    private double pitchInput;
    private double yawInput;
    private double speedMps;
    private double throttle;
    private double timeSeconds;
    private boolean onGround = true;
    private boolean crashed;
    private boolean outsideWorld;
    private String crashReason;
    private double verticalSpeedMps;
    private double gLoad = 1;
    private double engineThrustN;

    public FlightDynamics(
            TerrainWorld world,
            AircraftDefinition aircraft
    ) {
        this.world = world;
        this.systems = aircraft.systems();
        this.bindings = aircraft.bindings();
        FlightSystemsValidator.validate(systems);
        this.massKg = systems.massKg();
        this.maxThrustN = Math.max(1, systems.totalMaxThrustN());
        this.pitchAuthority = authority(systems.horizontalRudders().stream()
                .mapToDouble(surface -> Math.abs(surface.position().x())).average().orElse(0));
        this.yawAuthority = authority(systems.verticalRudders().stream()
                .mapToDouble(surface -> Math.abs(surface.position().x())).average().orElse(0));

        double thrustSum = systems.engines().stream().mapToDouble(EngineSpec::maxThrustN).sum();
        if (thrustSum > 0) {
            this.weightedEngineY = systems.engines().stream()
                    .mapToDouble(engine -> engine.position().y() * engine.maxThrustN()).sum() / thrustSum;
            this.weightedEngineZ = systems.engines().stream()
                    .mapToDouble(engine -> engine.position().z() * engine.maxThrustN()).sum() / thrustSum;
        } else {
            this.weightedEngineY = 0;
            this.weightedEngineZ = 0;
        }
        reset();
    }

    public synchronized void setKey(String code, boolean pressed) {
        controls.setKey(bindings, code, pressed);
    }

    public synchronized void clearInputs() {
        controls.clear();
    }

    public synchronized void reset() {
        position = world.startPosition(GEAR_CLEARANCE);
        velocity = Vec3.ZERO;
        yaw = world.runway().headingRadians();
        pitch = 0;
        roll = 0;
        pitchInput = 0;
        yawInput = 0;
        speedMps = 0;
        throttle = 0;
        timeSeconds = 0;
        onGround = true;
        crashed = false;
        outsideWorld = false;
        crashReason = null;
        verticalSpeedMps = 0;
        gLoad = 1;
        engineThrustN = 0;
        controls.clear();
    }

    public synchronized void step(double dt) {
        double step = Math.max(0.001, Math.min(dt, 0.05));
        if (crashed) {
            return;
        }
        timeSeconds += step;
        updateInputs(step);
        updateThrottle(step);
        engineThrustN = maxThrustN * throttle * (controls.boost() ? 1.38 : 1.0);

        if (onGround) {
            stepOnGround(step);
        } else {
            stepInAir(step);
        }
        updateDerivedValues();
    }

    private void updateInputs(double dt) {
        double targetPitch = controls.pitchDirection();
        double targetYaw = controls.yawDirection();
        double rate = Math.min(1, dt * 5.2);
        pitchInput += (targetPitch - pitchInput) * rate;
        yawInput += (targetYaw - yawInput) * rate;
    }

    private void updateThrottle(double dt) {
        double direction = controls.throttleDirection();
        if (direction > 0) throttle = Math.min(1, throttle + THROTTLE_RATE * dt);
        if (direction < 0) throttle = Math.max(0, throttle - THROTTLE_RATE * dt);
        if (controls.brake() && onGround) throttle = Math.max(0, throttle - THROTTLE_RATE * 1.8 * dt);
    }

    private void stepOnGround(double dt) {
        double groundYawRate = Math.toRadians(14) * yawAuthority
                * Math.max(0.1, Math.min(1, speedMps / 18));
        yaw -= yawInput * groundYawRate * dt;
        pitch += (0 - pitch) * Math.min(1, dt * 5);
        roll += (0 - roll) * Math.min(1, dt * 6);

        double drag = 0.5 * AIR_DENSITY * DRAG_AREA * speedMps * speedMps;
        double rollingResistance = 260 + massKg * GRAVITY * 0.018;
        double brakeForce = controls.brake() ? massKg * 7.0 : 0;
        double netForce = engineThrustN - drag - rollingResistance - brakeForce;
        speedMps += netForce / massKg * dt;
        speedMps = clamp(speedMps, 0, 95);

        double forwardX = Math.cos(yaw);
        double forwardZ = -Math.sin(yaw);
        position = new Vec3(
                position.x() + forwardX * speedMps * dt,
                position.y(),
                position.z() + forwardZ * speedMps * dt
        );
        double ground = world.heightAt(position.x(), position.z());
        position = new Vec3(position.x(), ground + GEAR_CLEARANCE, position.z());
        velocity = new Vec3(forwardX * speedMps, 0, forwardZ * speedMps);
        verticalSpeedMps = 0;
        gLoad = 1;

        if (speedMps >= TAKEOFF_SPEED && pitchInput > 0.17) {
            onGround = false;
            pitch = Math.toRadians(4);
            velocity = new Vec3(forwardX * speedMps, speedMps * Math.sin(pitch), forwardZ * speedMps);
        }
        if (!world.inside(position.x(), position.z())) {
            crash("已离开训练空域");
        }
    }

    private void stepInAir(double dt) {
        boolean stalled = speedMps < STALL_SPEED;
        double stallFactor = stalled ? 0.38 : 1.0;
        double dynamicFactor = clamp((speedMps * speedMps) / (42.0 * 42.0), 0.15, 1.75) * stallFactor;

        double pitchTrim = -weightedEngineY * (engineThrustN / maxThrustN) * 0.045;
        double yawTrim = weightedEngineZ * (engineThrustN / maxThrustN) * 0.03;
        pitch += pitchInput * MAX_PITCH_RATE * pitchAuthority * dynamicFactor * dt;
        pitch += pitchTrim * dt;
        yaw -= yawInput * MAX_YAW_RATE * yawAuthority * dynamicFactor * dt;
        yaw -= yawTrim * dt;

        double desiredBank = yawInput * MAX_BANK;
        roll += (desiredBank - roll) * Math.min(1, dt * 2.3);
        if (stalled) {
            pitch -= Math.toRadians(11) * dt;
        }
        pitch = clamp(pitch, Math.toRadians(-72), Math.toRadians(72));

        double forwardX = Math.cos(pitch) * Math.cos(yaw);
        double forwardY = Math.sin(pitch);
        double forwardZ = -Math.cos(pitch) * Math.sin(yaw);
        double drag = 0.5 * AIR_DENSITY * DRAG_AREA * speedMps * speedMps;
        if (controls.brake()) drag += 0.5 * AIR_DENSITY * DRAG_AREA * speedMps * speedMps * 0.8;
        double gravityAlongForward = GRAVITY * forwardY;
        speedMps += (engineThrustN - drag - massKg * gravityAlongForward) / massKg * dt;
        speedMps = clamp(speedMps, 0, MAX_SPEED);

        double sink = stalled ? Math.max(0, STALL_SPEED - speedMps) * 1.25 + 0.8 : 0;
        double vy = speedMps * forwardY - sink;
        velocity = new Vec3(speedMps * forwardX, vy, speedMps * forwardZ);
        position = position.add(velocity.multiply(dt));
        verticalSpeedMps = vy;
        gLoad = 1 / Math.max(0.22, Math.cos(roll)) + Math.abs(yawInput) * speedMps / 120.0;

        double ground = world.heightAt(position.x(), position.z());
        double altitude = position.y() - ground;
        if (altitude <= GEAR_CLEARANCE) {
            handleGroundContact(ground);
        }
        if (!world.inside(position.x(), position.z())) {
            outsideWorld = true;
            crash("已离开训练空域");
        }
    }

    private void handleGroundContact(double ground) {
        boolean onRunway = world.runway().contains(position.x(), position.z());
        boolean gentle = verticalSpeedMps > -8.5
                && Math.abs(roll) < Math.toRadians(24)
                && pitch > Math.toRadians(-13)
                && (onRunway || speedMps < 38);
        if (gentle) {
            onGround = true;
            position = new Vec3(position.x(), ground + GEAR_CLEARANCE, position.z());
            pitch = 0;
            roll = 0;
            speedMps *= onRunway ? 0.84 : 0.55;
            verticalSpeedMps = 0;
            double forwardX = Math.cos(yaw);
            double forwardZ = -Math.sin(yaw);
            velocity = new Vec3(forwardX * speedMps, 0, forwardZ * speedMps);
        } else {
            position = new Vec3(position.x(), ground + GEAR_CLEARANCE, position.z());
            speedMps = 0;
            velocity = Vec3.ZERO;
            crash(onRunway ? "着陆冲击过大" : "撞击地形");
        }
    }

    private void crash(String reason) {
        crashed = true;
        crashReason = reason;
        speedMps = 0;
        velocity = Vec3.ZERO;
        verticalSpeedMps = 0;
        clearInputs();
    }

    private void updateDerivedValues() {
        if (onGround) {
            verticalSpeedMps = 0;
        }
    }

    private double headingDegrees(Vec3 forward) {
        return (Math.toDegrees(Math.atan2(forward.z(), forward.x())) + 360) % 360;
    }

    public synchronized FlightState snapshot() {
        Quat orientation = Quat.fromYawPitchRoll(yaw, pitch, roll);
        Vec3 forward = orientation.rotate(LOCAL_FORWARD);
        Vec3 up = orientation.rotate(LOCAL_UP);
        Vec3 right = orientation.rotate(LOCAL_RIGHT);
        double ground = world.heightAt(position.x(), position.z());
        double heading = headingDegrees(forward);
        double pitchDeg = Math.toDegrees(Math.asin(clamp(forward.y(), -1, 1)));
        double rollDeg = Math.toDegrees(Math.atan2(-right.y(), Math.max(1e-6, up.y())));
        return new FlightState(
                timeSeconds,
                position,
                velocity,
                orientation,
                speedMps,
                verticalSpeedMps,
                position.y(),
                Math.max(0, position.y() - ground),
                heading,
                pitchDeg,
                rollDeg,
                throttle,
                engineThrustN,
                gLoad,
                onGround,
                crashed,
                !onGround && speedMps < STALL_SPEED,
                outsideWorld,
                crashReason
        );
    }

    public synchronized void setThrottle(double throttle) {
        this.throttle = clamp(throttle, 0, 1);
    }

    public synchronized double throttle() {
        return throttle;
    }

    private static double authority(double averageLever) {
        if (averageLever <= 1e-6) return 0.0;
        return clamp(averageLever / 2.2, 0.12, 1.8);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
