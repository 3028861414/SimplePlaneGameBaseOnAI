package com.aerolab.core.flight;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.Mat3;
import com.aerolab.core.geometry.Quat;
import com.aerolab.core.geometry.Rotations;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.ShapeType;
import com.aerolab.core.world.TerrainWorld;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Force-based rigid-body flight model. Aerodynamic forces are calculated per
 * modeled lifting surface / stabilizer, engine thrust acts at its configured
 * mount, and mass properties are derived from component masses and positions.
 */
public final class FlightDynamics {

    private static final Vec3 LOCAL_FORWARD = new Vec3(1, 0, 0);
    private static final Vec3 LOCAL_UP = new Vec3(0, 1, 0);
    private static final Vec3 LOCAL_RIGHT = new Vec3(0, 0, 1);
    private static final double GRAVITY = 9.80665;
    private static final double AIR_DENSITY = 1.225;
    private static final double THROTTLE_RATE = 0.62;
    private static final double STALL_ANGLE = Math.toRadians(15.5);
    private static final double LIFT_SLOPE = 5.1;
    private static final double AILERON_AUTHORITY = 0.38;
    private static final double ELEVATOR_AUTHORITY = 0.95;
    private static final double RUDDER_AUTHORITY = 0.66;
    private static final double ROLLING_DRAG_COEFFICIENT = 0.018;
    private static final double BRAKE_FRICTION_COEFFICIENT = 0.55;
    private static final double TIRE_SIDE_GRIP = 0.85;
    private static final double PARASITE_DRAG_FACTOR = 0.20;
    private static final double GEAR_SPRING_PER_KG = 140.0;
    private static final double GEAR_DAMPING_PER_KG = 7.0;
    private static final double MAX_ANGULAR_VELOCITY = 18;
    private static final double WEATHER_WIND_X = 4.0;
    private static final double WEATHER_WIND_Z = 6.5;
    private static final double NITRO_MULTIPLIER = 2.0;
    private static final double NITRO_DURATION_SECONDS = 4.0;
    private static final double NITRO_COOLDOWN_SECONDS = 12.0;

    private final TerrainWorld world;
    private final FlightSystems systems;
    private final KeyBindings bindings;
    private final FlightControlState controls = new FlightControlState();
    private final MassProperties massProperties;
    private final double massKg;
    private final Mat3 inverseInertia;
    private final Vec3 centerOfMass;
    private final double groundComOffset;
    private final List<LandingGear> landingGear = new ArrayList<>();
    private final double gearSpringNPerM;
    private final double gearDamperNsPerM;
    private final Map<String, Double> engineThrottles = new LinkedHashMap<>();
    private final Map<String, Double> engineThrusts = new LinkedHashMap<>();
    private final List<LiftingSurface> liftingSurfaces = new ArrayList<>();
    private final List<VerticalSurface> verticalSurfaces = new ArrayList<>();
    private final double parasiteDragArea;
    private final double rollDampingArea;
    private final double pitchDampingArea;
    private final double yawDampingArea;

    private Vec3 position;
    private Vec3 velocity = Vec3.ZERO;
    private Quat orientation = Quat.IDENTITY;
    private Vec3 angularVelocity = Vec3.ZERO;
    private double throttle;
    private double timeSeconds;
    private double pitchInput;
    private double yawInput;
    private double rollInput;
    private boolean onGround = true;
    private boolean crashed;
    private boolean stalled;
    private String crashReason;
    private double engineThrustN;
    private double liftN;
    private double dragN;
    private double aoaDeg;
    private double gLoad = 1;
    private boolean weatherEnabled;
    private double weatherBlend;
    private Vec3 windVelocity = Vec3.ZERO;
    private final double spawnOffsetLateral;
    private boolean nitroActive;
    private double nitroRemainingSeconds;
    private double nitroCooldownSeconds;
    private boolean nitroWasRequested;
    private Double autopilotPitch;
    private Double autopilotRoll;
    private Double autopilotYaw;
    private Double autopilotThrottle;

    public FlightDynamics(TerrainWorld world, AircraftDefinition aircraft) {
        this(world, aircraft, 0);
    }

    public FlightDynamics(TerrainWorld world, AircraftDefinition aircraft, double spawnOffsetLateral) {
        this.world = world;
        this.spawnOffsetLateral = spawnOffsetLateral;
        this.systems = aircraft.systems();
        this.bindings = aircraft.bindings();
        FlightSystemsValidator.validate(systems);
        this.massProperties = MassProperties.from(aircraft.model(), systems);
        this.massKg = massProperties.massKg();
        this.centerOfMass = massProperties.centerOfMass();
        this.inverseInertia = massProperties.inverseInertia();
        for (EngineSpec engine : systems.engines()) {
            engineThrottles.put(engine.id(), 0.0);
        }

        double modelMinX = Double.POSITIVE_INFINITY;
        double modelMaxX = Double.NEGATIVE_INFINITY;
        double modelMinY = Double.POSITIVE_INFINITY;
        double modelMaxZ = Double.NEGATIVE_INFINITY;
        double modelMinZ = Double.POSITIVE_INFINITY;
        double frontalArea = 0;
        for (ModelPart part : aircraft.model().parts()) {
            Aabb bounds = part.localBounds();
            modelMinX = Math.min(modelMinX, bounds.min().x());
            modelMaxX = Math.max(modelMaxX, bounds.max().x());
            modelMinY = Math.min(modelMinY, bounds.min().y());
            modelMaxZ = Math.max(modelMaxZ, bounds.max().z());
            modelMinZ = Math.min(modelMinZ, bounds.min().z());
            frontalArea += Math.max(0.01, part.size().y() * part.size().z());
            buildAerodynamicSurfaces(part);
        }
        if (!Double.isFinite(modelMinY)) {
            modelMinX = -2.5;
            modelMaxX = 2.5;
            modelMinY = -0.5;
            modelMaxZ = 1.2;
            modelMinZ = -1.2;
        }
        this.groundComOffset = Math.max(0.05, centerOfMass.y() - modelMinY);
        this.parasiteDragArea = Math.max(0.10, frontalArea * PARASITE_DRAG_FACTOR);
        double wingArea = 0;
        double wingSpan = 1;
        double tailArea = 0;
        double tailArm = 1;
        for (LiftingSurface surface : liftingSurfaces) {
            if (surface.tail) {
                tailArea += surface.area;
                tailArm = Math.max(tailArm, Math.abs(surface.offset.x()));
            } else {
                wingArea += surface.area;
                wingSpan = Math.max(wingSpan, Math.abs(surface.offset.z()) * 2);
            }
        }
        double finArea = 0;
        double finArm = 1;
        for (VerticalSurface surface : verticalSurfaces) {
            finArea += surface.area;
            finArm = Math.max(finArm, Math.abs(surface.offset.x()));
        }
        this.rollDampingArea = Math.max(0.01, wingArea * wingSpan);
        this.pitchDampingArea = Math.max(0.01, tailArea * tailArm * tailArm);
        this.yawDampingArea = Math.max(0.01, finArea * finArm * finArm);
        this.gearSpringNPerM = massKg * GEAR_SPRING_PER_KG;
        this.gearDamperNsPerM = massKg * GEAR_DAMPING_PER_KG;
        buildLandingGear(modelMinX, modelMaxX, modelMinY, modelMinZ, modelMaxZ);
        reset();
    }

    public synchronized void setKey(String code, boolean pressed) {
        controls.setKey(bindings, code, pressed);
    }

    public synchronized void clearInputs() {
        controls.clear();
    }

    public synchronized void reset() {
        Vec3 start = world.runway().startPosition(0);
        orientation = Quat.fromYawPitchRoll(world.runway().headingRadians(), 0, 0);
        Vec3 comOffset = orientation.rotate(new Vec3(centerOfMass.x(), 0, centerOfMass.z()));
        double heading = world.runway().headingRadians();
        double startX = start.x() - Math.sin(heading) * spawnOffsetLateral + comOffset.x();
        double startZ = start.z() + Math.cos(heading) * spawnOffsetLateral + comOffset.z();
        double ground = world.heightAt(startX, startZ);
        position = new Vec3(startX, ground + groundComOffset, startZ);
        velocity = Vec3.ZERO;
        angularVelocity = Vec3.ZERO;
        pitchInput = 0;
        yawInput = 0;
        rollInput = 0;
        throttle = 0;
        for (String engineId : engineThrottles.keySet()) {
            engineThrottles.put(engineId, 0.0);
        }
        engineThrusts.clear();
        timeSeconds = 0;
        onGround = true;
        crashed = false;
        stalled = false;
        crashReason = null;
        engineThrustN = 0;
        windVelocity = Vec3.ZERO;
        liftN = 0;
        dragN = 0;
        aoaDeg = 0;
        gLoad = 1;
        nitroActive = false;
        nitroRemainingSeconds = 0;
        nitroCooldownSeconds = 0;
        nitroWasRequested = false;
        autopilotPitch = null;
        autopilotRoll = null;
        autopilotYaw = null;
        autopilotThrottle = null;
        controls.clear();
    }

    public synchronized void step(double dt) {
        double step = Math.max(0.001, Math.min(dt, 0.05));
        if (crashed) return;
        timeSeconds += step;
        updateInputs(step);
        updateThrottle(step);
        updateWeather(step);
        updateNitro(step);
        updateEngineThrust();
        if (onGround) stepOnGround(step);
        else stepInAir(step);
    }

    private void updateInputs(double dt) {
        double rate = Math.min(1, dt * (autopilotPitch == null ? 6.0 : 3.6));
        double pitchTarget = autopilotPitch != null ? autopilotPitch : controls.pitchDirection();
        double yawTarget = autopilotYaw != null ? autopilotYaw : controls.yawDirection();
        double rollTarget = autopilotRoll != null ? autopilotRoll : controls.rollDirection();
        pitchInput += (clamp(pitchTarget, -1, 1) - pitchInput) * rate;
        yawInput += (clamp(yawTarget, -1, 1) - yawInput) * rate;
        rollInput += (clamp(rollTarget, -1, 1) - rollInput) * rate;
    }

    private void updateThrottle(double dt) {
        if (autopilotThrottle != null) {
            double target = clamp(autopilotThrottle, 0, 1);
            adjustAllEngineThrottle((target - averageEngineThrottle()) * Math.min(1, dt * 1.6));
            return;
        }
        double direction = controls.throttleDirection();
        if (direction > 0) adjustAllEngineThrottle(THROTTLE_RATE * dt);
        if (direction < 0) adjustAllEngineThrottle(-THROTTLE_RATE * dt);
        if (controls.brake() && onGround) adjustAllEngineThrottle(-THROTTLE_RATE * 1.8 * dt);
    }

    private void adjustAllEngineThrottle(double delta) {
        if (engineThrottles.isEmpty()) {
            throttle = clamp(throttle + delta, 0, 1);
            return;
        }
        for (Map.Entry<String, Double> entry : engineThrottles.entrySet()) {
            entry.setValue(clamp(entry.getValue() + delta, 0, 1));
        }
        throttle = averageEngineThrottle();
    }

    private void updateNitro(double dt) {
        boolean requested = controls.boost();
        if (requested && !nitroWasRequested && !nitroActive && nitroCooldownSeconds <= 0) {
            nitroActive = true;
            nitroRemainingSeconds = NITRO_DURATION_SECONDS;
        }
        nitroWasRequested = requested;

        if (nitroActive) {
            nitroRemainingSeconds = Math.max(0, nitroRemainingSeconds - dt);
            if (nitroRemainingSeconds <= 0) {
                nitroActive = false;
                nitroCooldownSeconds = NITRO_COOLDOWN_SECONDS;
            }
        } else if (nitroCooldownSeconds > 0) {
            nitroCooldownSeconds = Math.max(0, nitroCooldownSeconds - dt);
        }
    }

    private void updateEngineThrust() {
        double boost = nitroActive ? NITRO_MULTIPLIER : 1.0;
        double total = 0;
        engineThrusts.clear();
        for (EngineSpec engine : systems.engines()) {
            double engineThrottle = clamp(engineThrottles.getOrDefault(engine.id(), 0.0), 0, 1);
            double thrust = engine.maxThrustN() * engineThrottle * boost;
            engineThrusts.put(engine.id(), thrust);
            total += thrust;
        }
        engineThrustN = total;
    }

    private void updateWeather(double dt) {
        double target = weatherEnabled ? 1.0 : 0.0;
        weatherBlend += (target - weatherBlend) * Math.min(1, dt * 0.8);
        if (weatherBlend < 1e-4) {
            windVelocity = Vec3.ZERO;
            return;
        }
        double t = timeSeconds;
        double gust = 0.65 * Math.sin(t * 0.9) + 0.35 * Math.sin(t * 2.4 + 1.1);
        Vec3 wind = new Vec3(
                WEATHER_WIND_X + 1.8 * gust,
                0.25 * Math.sin(t * 1.8 + 0.4),
                WEATHER_WIND_Z + 2.2 * Math.sin(t * 0.37 + 2.0)
        );
        windVelocity = wind.multiply(weatherBlend);
    }

    private double averageEngineThrottle() {
        if (engineThrottles.isEmpty()) return throttle;
        double total = 0;
        for (double value : engineThrottles.values()) total += value;
        return total / engineThrottles.size();
    }

    private void stepOnGround(double dt) {
        AerodynamicResult aero = computeAerodynamics();
        Vec3 thrustBody = new Vec3(engineThrustN, 0, 0);
        Vec3 forceBody = aero.forceBody.add(thrustBody);
        Vec3 forceWorld = orientation.rotate(forceBody).add(new Vec3(0, -massKg * GRAVITY, 0));
        Vec3 torqueWorld = orientation.rotate(aero.torqueBody.add(engineTorque()));
        ContactResult contacts = applyGroundContacts(forceWorld, torqueWorld);
        forceWorld = contacts.forceWorld();
        torqueWorld = contacts.torqueWorld();

        Vec3 acceleration = forceWorld.multiply(1.0 / massKg);
        velocity = velocity.add(acceleration.multiply(dt));
        position = position.add(velocity.multiply(dt));

        Vec3 torqueBody = orientation.conjugate().rotate(torqueWorld);
        integrateAngular(torqueBody, dt);
        orientation = integrateOrientation(orientation, angularVelocity, dt);
        onGround = contacts.anyContact;
        if (contacts.anyContact && orientation.rotate(LOCAL_UP).y() < 0.15) {
            crash("机体触地");
            return;
        }

        liftN = Math.max(0, orientation.rotate(forceBody).y());
        dragN = aero.dragN;
        aoaDeg = Math.toDegrees(aero.maxAngleOfAttack);
        gLoad = 1;
        stalled = false;
    }

    private void stepInAir(double dt) {
        double previousVerticalSpeed = velocity.y();
        AerodynamicResult aero = computeAerodynamics();
        Vec3 thrustBody = new Vec3(engineThrustN, 0, 0);
        Vec3 forceBody = aero.forceBody.add(thrustBody);
        Vec3 forceWorld = orientation.rotate(forceBody).add(new Vec3(0, -massKg * GRAVITY, 0));
        Vec3 acceleration = forceWorld.multiply(1.0 / massKg);
        velocity = velocity.add(acceleration.multiply(dt));
        position = position.add(velocity.multiply(dt));

        Vec3 torque = aero.torqueBody.add(engineTorque());
        integrateAngular(torque, dt);
        orientation = integrateOrientation(orientation, angularVelocity, dt);

        liftN = Math.max(0, forceBody.dot(LOCAL_UP));
        dragN = aero.dragN;
        aoaDeg = Math.toDegrees(aero.maxAngleOfAttack);
        double specificVertical = forceBody.dot(LOCAL_UP) / (massKg * GRAVITY);
        gLoad = specificVertical;
        stalled = Math.abs(aero.maxAngleOfAttack) > STALL_ANGLE && velocity.length() > 6;
        onGround = false;

        double penetration = maxGearPenetration();
        if (penetration > 0) {
            if (previousVerticalSpeed < -9.0 || orientation.rotate(LOCAL_UP).y() < 0.15) {
                crash(previousVerticalSpeed < -9.0 ? "着陆冲击过大" : "机体触地");
                return;
            }
            position = new Vec3(position.x(), position.y() + penetration, position.z());
            velocity = new Vec3(velocity.x(), 0, velocity.z());
            angularVelocity = angularVelocity.multiply(0.25);
            onGround = true;
        }
    }

    private AerodynamicResult computeAerodynamics() {
        Vec3 airVelocityWorld = velocity.subtract(windVelocity);
        Vec3 vBody = orientation.conjugate().rotate(airVelocityWorld);
        Vec3 omega = angularVelocity;
        Vec3 forceBody = Vec3.ZERO;
        Vec3 torqueBody = Vec3.ZERO;
        double drag = 0;
        double maxAlpha = 0;

        Vec3 airdragDirection = vBody.lengthSquared() > 1e-8 ? vBody.normalized().multiply(-1) : Vec3.ZERO;
        double speed = vBody.length();
        if (speed > 1e-4) {
            double q = 0.5 * AIR_DENSITY * speed * speed;
            torqueBody = torqueBody.add(new Vec3(
                    -q * rollDampingArea * 0.030 * omega.x(),
                    -q * yawDampingArea * 0.18 * omega.y(),
                    -q * pitchDampingArea * 0.10 * omega.z()
            ));
        }
        if (speed > 1e-4) {
            double q = 0.5 * AIR_DENSITY * speed * speed;
            Vec3 dragForce = airdragDirection.multiply(q * parasiteDragArea * 0.45);
            forceBody = forceBody.add(dragForce);
            drag += dragForce.length();
        }

        for (LiftingSurface surface : liftingSurfaces) {
            Vec3 vAt = vBody.add(omega.cross(surface.offset));
            Vec3 vLocal = Rotations.inverseRotateXyz(vAt, surface.rotation);
            double localSpeed = vLocal.length();
            if (localSpeed < 0.08) continue;
            double q = 0.5 * AIR_DENSITY * localSpeed * localSpeed;
            double alpha = Math.atan2(-vLocal.y(), vLocal.x());
            if (surface.tail) alpha -= Math.toRadians(6.0);
            maxAlpha = Math.max(maxAlpha, Math.abs(alpha));
            double cl = liftCoefficient(alpha);
            if (surface.aileron) {
                cl += rollInput * AILERON_AUTHORITY * (surface.offset.z() > 0 ? -1 : 1);
            }
            double cd = 0.018 + cl * cl / (Math.PI * surface.aspectRatio * 0.82);
            cd += 1.05 * Math.abs(Math.sin(alpha)) * Math.abs(Math.sin(alpha));
            Vec3 localDragDir = vLocal.normalized().multiply(-1);
            Vec3 localForce = new Vec3(0, cl * q * surface.area, 0)
                    .add(localDragDir.multiply(cd * q * surface.area));
            Vec3 force = Rotations.rotateXyz(localForce, surface.rotation);
            forceBody = forceBody.add(force);
            torqueBody = torqueBody.add(surface.offset.cross(force));
            drag += localDragDir.multiply(cd * q * surface.area).length();
        }

        for (VerticalSurface surface : verticalSurfaces) {
            Vec3 vAt = vBody.add(omega.cross(surface.offset));
            Vec3 vLocal = Rotations.inverseRotateXyz(vAt, surface.rotation);
            double localSpeed = vLocal.length();
            if (localSpeed < 0.08) continue;
            double q = 0.5 * AIR_DENSITY * localSpeed * localSpeed;
            double sideSlip = Math.atan2(vLocal.z(), vLocal.x());
            double cl = -5.1 * sideSlip;
            double cd = 0.018 + cl * cl / (Math.PI * surface.aspectRatio * 0.82);
            Vec3 localDragDir = vLocal.normalized().multiply(-1);
            Vec3 localForce = new Vec3(0, 0, cl * q * surface.area)
                    .add(localDragDir.multiply(cd * q * surface.area));
            Vec3 force = Rotations.rotateXyz(localForce, surface.rotation);
            forceBody = forceBody.add(force);
            torqueBody = torqueBody.add(surface.offset.cross(force));
            drag += localDragDir.multiply(cd * q * surface.area).length();
        }

        if (speed > 1e-4) {
            for (ControlSurfaceSpec elevator : systems.horizontalRudders()) {
                Vec3 rel = elevator.position().subtract(centerOfMass);
                Vec3 vAt = vBody.add(omega.cross(rel));
                double q = 0.5 * AIR_DENSITY * vAt.lengthSquared();
                double force = -pitchInput * ELEVATOR_AUTHORITY * elevator.areaM2() * q;
                Vec3 localForce = new Vec3(0, force, 0);
                forceBody = forceBody.add(localForce);
                torqueBody = torqueBody.add(rel.cross(localForce));
                drag += Math.abs(force) * 0.06;
            }
            for (ControlSurfaceSpec rudder : systems.verticalRudders()) {
                Vec3 rel = rudder.position().subtract(centerOfMass);
                Vec3 vAt = vBody.add(omega.cross(rel));
                double q = 0.5 * AIR_DENSITY * vAt.lengthSquared();
                double force = -yawInput * RUDDER_AUTHORITY * rudder.areaM2() * q;
                Vec3 localForce = new Vec3(0, 0, force);
                forceBody = forceBody.add(localForce);
                torqueBody = torqueBody.add(rel.cross(localForce));
                drag += Math.abs(force) * 0.06;
            }
        }

        return new AerodynamicResult(forceBody, torqueBody, drag, maxAlpha);
    }

    private Vec3 engineTorque() {
        Vec3 torque = Vec3.ZERO;
        for (EngineSpec engine : systems.engines()) {
            Vec3 rel = engine.position().subtract(centerOfMass);
            Vec3 force = new Vec3(engineThrusts.getOrDefault(engine.id(), 0.0), 0, 0);
            torque = torque.add(rel.cross(force));
        }
        return torque;
    }

    private void integrateAngular(Vec3 torque, double dt) {
        Vec3 gyroscopic = angularVelocity.cross(massProperties.inertia().apply(angularVelocity));
        Vec3 angularAcceleration = inverseInertia.apply(torque.subtract(gyroscopic));
        angularVelocity = angularVelocity.add(angularAcceleration.multiply(dt));
        double speed = angularVelocity.length();
        if (speed > MAX_ANGULAR_VELOCITY) {
            angularVelocity = angularVelocity.multiply(MAX_ANGULAR_VELOCITY / speed);
        }
    }

    private static Quat integrateOrientation(Quat current, Vec3 omega, double dt) {
        Quat omegaQuat = new Quat(omega.x(), omega.y(), omega.z(), 0);
        Quat derivative = current.multiply(omegaQuat);
        return new Quat(
                current.x() + derivative.x() * 0.5 * dt,
                current.y() + derivative.y() * 0.5 * dt,
                current.z() + derivative.z() * 0.5 * dt,
                current.w() + derivative.w() * 0.5 * dt
        ).normalized();
    }

    private void crash(String reason) {
        crashed = true;
        crashReason = reason;
        dragN = 0;
        clearInputs();
    }

    private void buildLandingGear(double minX, double maxX, double minY, double minZ, double maxZ) {
        double length = Math.max(1.0, maxX - minX);
        double halfTrack = Math.max(0.35, (maxZ - minZ) * 0.26);
        double gearY = minY - centerOfMass.y();
        double mainX = minX + length * 0.48 - centerOfMass.x();
        double noseX = maxX - length * 0.15 - centerOfMass.x();
        landingGear.add(new LandingGear(new Vec3(mainX, gearY, -halfTrack), true));
        landingGear.add(new LandingGear(new Vec3(mainX, gearY, halfTrack), true));
        landingGear.add(new LandingGear(new Vec3(noseX, gearY, 0), false));
    }

    private ContactResult applyGroundContacts(Vec3 baseForceWorld, Vec3 baseTorqueWorld) {
        Vec3 force = baseForceWorld;
        Vec3 torque = baseTorqueWorld;
        boolean anyContact = false;
        Vec3 forward = orientation.rotate(LOCAL_FORWARD);
        forward = new Vec3(forward.x(), 0, forward.z()).normalized();
        Vec3 right = orientation.rotate(LOCAL_RIGHT);
        right = new Vec3(right.x(), 0, right.z()).normalized();
        Vec3 omegaWorld = orientation.rotate(angularVelocity);
        double maxNormal = massKg * GRAVITY * 6.0;

        for (LandingGear gear : landingGear) {
            Vec3 worldRel = orientation.rotate(gear.offset());
            Vec3 point = position.add(worldRel);
            double ground = world.heightAt(point.x(), point.z());
            double penetration = ground - point.y();
            if (penetration < -0.035) continue;
            anyContact = true;

            Vec3 pointVelocity = velocity.add(omegaWorld.cross(worldRel));
            double normalSpeed = pointVelocity.y();
            double normalForce = gearSpringNPerM * penetration - gearDamperNsPerM * normalSpeed;
            if (penetration < 0) {
                normalForce = normalSpeed < -0.01 ? -gearDamperNsPerM * normalSpeed : 0;
            }
            normalForce = clamp(normalForce, 0, maxNormal);
            if (normalForce <= 0) continue;

            Vec3 normal = new Vec3(0, normalForce, 0);
            force = force.add(normal);
            torque = torque.add(worldRel.cross(normal));

            double lateralSpeed = pointVelocity.dot(right);
            double lateralLimit = TIRE_SIDE_GRIP * normalForce;
            double lateralForce = clamp(-lateralSpeed * massKg * 7.0, -lateralLimit, lateralLimit);
            Vec3 friction = right.multiply(lateralForce);

            double forwardSpeed = pointVelocity.dot(forward);
            double frictionCoefficient = ROLLING_DRAG_COEFFICIENT;
            if (gear.braked() && controls.brake()) frictionCoefficient += BRAKE_FRICTION_COEFFICIENT;
            double forwardLimit = frictionCoefficient * normalForce;
            double forwardForce = clamp(-forwardSpeed * massKg * 4.5, -forwardLimit, forwardLimit);
            friction = friction.add(forward.multiply(forwardForce));

            force = force.add(friction);
            torque = torque.add(worldRel.cross(friction));
        }
        return new ContactResult(force, torque, anyContact);
    }

    private double maxGearPenetration() {
        double max = 0;
        for (LandingGear gear : landingGear) {
            Vec3 worldRel = orientation.rotate(gear.offset());
            Vec3 point = position.add(worldRel);
            max = Math.max(max, world.heightAt(point.x(), point.z()) - point.y());
        }
        return max;
    }

    private void buildAerodynamicSurfaces(ModelPart part) {
        Vec3 relative = part.position().subtract(centerOfMass);
        if (part.liftingSurface()) {
            double area = planformArea(part);
            double aspect = Math.max(1.0, part.size().z() * part.size().z() / Math.max(area, 1e-4));
            boolean aileron = Math.abs(relative.z()) > 0.4 && Math.abs(part.size().z()) > 1.2;
            boolean tail = !aileron && relative.x() < -0.8;
            liftingSurfaces.add(new LiftingSurface(relative, part.rotation(), area, aspect, aileron, tail));
        } else if (isVerticalSurface(part)) {
            double area = part.size().x() * part.size().y();
            double aspect = Math.max(1.0, part.size().y() * part.size().y() / Math.max(area, 1e-4));
            verticalSurfaces.add(new VerticalSurface(relative, part.rotation(), area, aspect));
        }
    }

    private static boolean isVerticalSurface(ModelPart part) {
        if (part.shape() != ShapeType.BOX && part.shape() != ShapeType.ELLIPSOID) return false;
        return part.size().z() < Math.min(part.size().x(), part.size().y()) * 0.35
                && part.size().y() >= 0.4;
    }

    private static double planformArea(ModelPart part) {
        double area = part.size().x() * part.size().z();
        if (part.shape() == ShapeType.ELLIPSOID) area *= Math.PI / 4.0;
        return Math.max(0.02, area);
    }

    private static double liftCoefficient(double alpha) {
        double absolute = Math.abs(alpha);
        if (absolute <= STALL_ANGLE) return LIFT_SLOPE * alpha;
        double t = Math.min(1, (absolute - STALL_ANGLE) / (Math.PI * 0.5 - STALL_ANGLE));
        double peak = LIFT_SLOPE * STALL_ANGLE;
        return Math.signum(alpha) * peak * (1 - t) * (1 - 0.35 * t);
    }

    private double rollDegrees() {
        Vec3 right = orientation.rotate(LOCAL_RIGHT);
        Vec3 up = orientation.rotate(LOCAL_UP);
        return Math.toDegrees(Math.atan2(-right.y(), up.y()));
    }

    private double pitchDegrees() {
        Vec3 forward = orientation.rotate(LOCAL_FORWARD);
        return Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, forward.y()))));
    }

    public synchronized FlightState snapshot() {
        Vec3 forward = orientation.rotate(LOCAL_FORWARD);
        Vec3 right = orientation.rotate(LOCAL_RIGHT);
        Vec3 up = orientation.rotate(LOCAL_UP);
        double ground = world.heightAt(position.x(), position.z());
        double heading = (Math.toDegrees(Math.atan2(forward.z(), forward.x())) + 360) % 360;
        double pitch = Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, forward.y()))));
        double roll = Math.toDegrees(Math.atan2(-right.y(), Math.max(1e-6, up.y())));
        return new FlightState(
                timeSeconds,
                position,
                velocity,
                orientation,
                velocity.length(),
                velocity.y(),
                position.y(),
                Math.max(0, position.y() - ground),
                heading,
                pitch,
                roll,
                throttle,
                engineThrustN,
                engineStates(),
                weatherEnabled,
                windVelocity,
                liftN,
                dragN,
                aoaDeg,
                massKg,
                centerOfMass,
                gLoad,
                onGround,
                crashed,
                stalled,
                false,
                crashReason,
                nitroActive,
                nitroRemainingSeconds,
                nitroCooldownSeconds,
                NITRO_DURATION_SECONDS,
                NITRO_COOLDOWN_SECONDS,
                NITRO_MULTIPLIER
        );
    }

    public synchronized void setThrottle(double throttle) {
        double value = clamp(throttle, 0, 1);
        this.throttle = value;
        for (String engineId : engineThrottles.keySet()) {
            engineThrottles.put(engineId, value);
        }
    }

    public synchronized void setEngineThrottle(String engineId, double throttle) {
        if (engineId == null || !engineThrottles.containsKey(engineId)) return;
        engineThrottles.put(engineId, clamp(throttle, 0, 1));
        this.throttle = averageEngineThrottle();
    }

    public synchronized void setWeatherEnabled(boolean enabled) {
        this.weatherEnabled = enabled;
    }

    public synchronized void setAutopilotCommand(
            Double pitch,
            Double roll,
            Double yaw,
            Double throttle
    ) {
        this.autopilotPitch = pitch == null ? null : clamp(pitch, -1, 1);
        this.autopilotRoll = roll == null ? null : clamp(roll, -1, 1);
        this.autopilotYaw = yaw == null ? null : clamp(yaw, -1, 1);
        this.autopilotThrottle = throttle == null ? null : clamp(throttle, 0, 1);
    }

    public synchronized void clearAutopilotCommand() {
        autopilotPitch = null;
        autopilotRoll = null;
        autopilotYaw = null;
        autopilotThrottle = null;
    }

    public synchronized boolean autopilotControlActive() {
        return autopilotPitch != null || autopilotRoll != null
                || autopilotYaw != null || autopilotThrottle != null;
    }

    private List<EngineState> engineStates() {
        List<EngineState> states = new ArrayList<>(systems.engines().size());
        for (EngineSpec engine : systems.engines()) {
            double engineThrottle = clamp(engineThrottles.getOrDefault(engine.id(), 0.0), 0, 1);
            double thrust = engineThrusts.getOrDefault(engine.id(), 0.0);
            states.add(new EngineState(engine.id(), engine.name(), engineThrottle, thrust, engine.maxThrustN()));
        }
        return states;
    }

    public synchronized double throttle() {
        return throttle;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record LiftingSurface(
            Vec3 offset,
            Vec3 rotation,
            double area,
            double aspectRatio,
            boolean aileron,
            boolean tail
    ) {
    }

    private record VerticalSurface(Vec3 offset, Vec3 rotation, double area, double aspectRatio) {
    }

    private record LandingGear(Vec3 offset, boolean braked) {
    }

    private record ContactResult(
            Vec3 forceWorld,
            Vec3 torqueWorld,
            boolean anyContact
    ) {
    }

    private record AerodynamicResult(
            Vec3 forceBody,
            Vec3 torqueBody,
            double dragN,
            double maxAngleOfAttack
    ) {
    }
}
