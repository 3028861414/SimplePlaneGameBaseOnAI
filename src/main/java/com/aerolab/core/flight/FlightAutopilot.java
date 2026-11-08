package com.aerolab.core.flight;

import java.util.List;

/**
 * Small closed-loop autopilot used by the flight-template buttons. It only
 * consumes FlightState and returns normalized controls, keeping it independent
 * of transport and UI concerns.
 */
public final class FlightAutopilot {

    public record Template(String id, String label, String description, double expectedSeconds) {
    }

    public static final List<Template> TEMPLATES = List.of(
            new Template("takeoff", "起飞爬升", "滑跑、抬轮并爬升到 220 m 后改平", 32),
            new Template("circuit", "五边航线", "爬升后按矩形航线依次转向四边", 58),
            new Template("orbit", "水平盘旋", "保持高度并持续压坡度盘旋", 26),
            new Template("roll", "横滚", "保持高度完成一次 360° 横滚", 12),
            new Template("loop", "筋斗", "拉起完成筋斗并恢复平飞", 18)
    );

    public record Commands(Double pitch, Double roll, Double yaw, Double throttle, boolean finished) {
    }

    private Template template;
    private double elapsed;
    private double phaseElapsed;
    private int phase;
    private boolean takeoffPrelude;
    private double startHeading;
    private double targetAltitudeAgl;

    public record Status(String id, String label, double progress) {
        public static final Status IDLE = new Status(null, null, 0);
    }

    public synchronized boolean start(String id, FlightState state) {
        Template next = TEMPLATES.stream().filter(item -> item.id().equals(id)).findFirst().orElse(null);
        if (next == null) return false;
        template = next;
        elapsed = 0;
        phaseElapsed = 0;
        phase = 0;
        startHeading = state.headingDeg();
        targetAltitudeAgl = Math.max(180, state.altitudeAglM() + 140);
        takeoffPrelude = state.onGround() && !"takeoff".equals(next.id());
        return true;
    }

    public synchronized void cancel() {
        template = null;
        elapsed = 0;
        phaseElapsed = 0;
        phase = 0;
        takeoffPrelude = false;
    }

    public synchronized boolean active() {
        return template != null;
    }

    public synchronized Status status() {
        if (template == null) return Status.IDLE;
        double duration = Math.max(template.expectedSeconds(), 1);
        return new Status(template.id(), template.label(), clamp(elapsed / duration, 0, 1));
    }

    public synchronized Commands next(FlightState state, double dt) {
        if (template == null) return new Commands(null, null, null, null, true);
        if (state.crashed()) {
            cancel();
            return new Commands(null, null, null, null, true);
        }
        elapsed += dt;
        phaseElapsed += dt;

        if (takeoffPrelude) {
            Commands takeoff = takeoffCommand(state);
            if (state.altitudeAglM() > 55) {
                takeoffPrelude = false;
                phase = 0;
                phaseElapsed = 0;
                elapsed = 0;
                startHeading = state.headingDeg();
                targetAltitudeAgl = Math.max(targetAltitudeAgl, state.altitudeAglM() + 80);
            } else {
                return takeoff;
            }
        }

        return switch (template.id()) {
            case "takeoff" -> takeoff(state);
            case "circuit" -> circuit(state, dt);
            case "orbit" -> orbit(state);
            case "roll" -> roll(state);
            case "loop" -> loop(state);
            default -> finish();
        };
    }

    private Commands takeoff(FlightState state) {
        if (phase == 0 && state.speedMps() > 42) {
            phase = 1;
            phaseElapsed = 0;
        }
        if (phase == 1 && state.altitudeAglM() > 35) {
            phase = 2;
            phaseElapsed = 0;
        }
        if (phase == 2 && state.altitudeAglM() > 220) {
            phase = 3;
            phaseElapsed = 0;
        }
        if (phase >= 3) {
            if (phaseElapsed > 6 || (phaseElapsed > 2 && state.verticalSpeedMps() < 5)) return finish();
            return new Commands(pitchHold(210, state, 5), rollLevel(state), 0.0, throttleForSpeed(state, 0.5, 0.72), false);
        }
        if (phase == 2 && (state.altitudeAglM() > 210 || state.verticalSpeedMps() > 32)) {
            phase = 3;
            phaseElapsed = 0;
        }
        double targetPitch = phase == 0 ? 0 : phase == 1 ? 7 : 8;
        Double pitch = state.onGround() && state.speedMps() > 34
                ? 0.9
                : pitchTarget(targetPitch, state);
        return new Commands(
                pitch,
                rollLevel(state),
                0.0,
                state.onGround() ? 1.0 : throttleForSpeed(state, 0.6, 1.0),
                false
        );
    }

    private Commands takeoffCommand(FlightState state) {
        if (phase == 0 && state.speedMps() > 42) {
            phase = 1;
            phaseElapsed = 0;
        }
        if (phase == 1 && state.altitudeAglM() > 18) {
            phase = 2;
            phaseElapsed = 0;
        }
        double targetPitch = phase == 0 ? 0 : 7;
        Double pitch = state.onGround() && state.speedMps() > 34
                ? 0.9
                : pitchTarget(targetPitch, state);
        return new Commands(
                pitch,
                rollLevel(state),
                0.0,
                state.onGround() ? 1.0 : throttleForSpeed(state, 0.65, 1.0),
                false
        );
    }

    private Commands circuit(FlightState state, double dt) {
        double targetAltitude = Math.max(220, targetAltitudeAgl);
        if (phase == 0) {
            if (state.altitudeAglM() > targetAltitude - 20) {
                phase = 1;
                phaseElapsed = 0;
                startHeading = state.headingDeg();
            }
            return new Commands(pitchHold(targetAltitude, state, 11), rollLevel(state), 0.0, 0.88, false);
        }
        double headingTarget = startHeading - 90 * Math.min(4, phase);
        double remaining = normalizeHeading(headingTarget - state.headingDeg());
        boolean turning = Math.abs(remaining) > 8;
        if (!turning) phaseElapsed += dt * 0.55;
        if (phase >= 5) return finish();
        if (!turning && phaseElapsed > 5.5) {
            phase++;
            phaseElapsed = 0;
        }
        double bank = clamp(remaining * 1.15, -28, 28);
        return new Commands(
                pitchHold(targetAltitude, state, 9),
                rollTarget(bank, state),
                0.0,
                turning ? 0.95 : 0.78,
                false
        );
    }

    private Commands orbit(FlightState state) {
        if (state.altitudeAglM() < 100) {
            return new Commands(pitchTarget(11, state), rollLevel(state), 0.0, 1.0, false);
        }
        if (state.altitudeAglM() > targetAltitudeAgl + 40) {
            phase = 1;
        }
        if (elapsed > 24 || (phase == 1 && Math.abs(normalizeHeading(state.headingDeg() - startHeading)) < 12)) {
            return finish();
        }
        return new Commands(
                pitchHold(targetAltitudeAgl, state, 9),
                rollTarget(30, state),
                0.0,
                0.82,
                false
        );
    }

    private Commands roll(FlightState state) {
        if (state.altitudeAglM() < 90) {
            return new Commands(pitchTarget(10, state), rollLevel(state), 0.0, 1.0, false);
        }
        if (phase == 0) {
            if (state.speedMps() > 42) {
                phase = 1;
                phaseElapsed = 0;
            }
            return new Commands(pitchTarget(4, state), rollLevel(state), 0.0, 1.0, false);
        }
        if (phase == 1) {
            if (phaseElapsed >= 2.8) {
                phase = 2;
                phaseElapsed = 0;
            }
            return new Commands(pitchTarget(2, state), 0.92, 0.0, 0.9, false);
        }
        if (phaseElapsed > 2.2) return finish();
        return new Commands(pitchTarget(2, state), rollLevel(state), 0.0, 0.9, false);
    }

    private Commands loop(FlightState state) {
        if (state.altitudeAglM() < 100) {
            return new Commands(pitchTarget(11, state), rollLevel(state), 0.0, 1.0, false);
        }
        if (phase == 0) {
            if (state.speedMps() > 48) {
                phase = 1;
                phaseElapsed = 0;
            }
            return new Commands(pitchTarget(2, state), rollLevel(state), 0.0, 1.0, false);
        }
        if (phase == 1) {
            if (state.pitchDeg() > 58 || phaseElapsed > 4.4) {
                phase = 2;
                phaseElapsed = 0;
            }
            return new Commands(0.9, rollLevel(state), 0.0, 1.0, false);
        }
        if (phase == 2) {
            if (state.pitchDeg() < -35 || phaseElapsed > 3.2) {
                phase = 3;
                phaseElapsed = 0;
            }
            return new Commands(-0.65, rollLevel(state), 0.0, 0.85, false);
        }
        if (state.altitudeAglM() < 60) return finish();
        if (Math.abs(state.pitchDeg()) < 16 || phaseElapsed > 5) {
            return finish();
        }
        return new Commands(pitchHold(Math.max(110, state.altitudeAglM() + 30), state, 8),
                rollLevel(state), 0.0, 0.85, false);
    }

    private Commands finish() {
        cancel();
        return new Commands(null, null, null, null, true);
    }

    private static Double pitchHold(double targetAltitudeAgl, FlightState state, double maxPitch) {
        double target = clamp((targetAltitudeAgl - state.altitudeAglM()) * 0.22, -8, maxPitch);
        return pitchTarget(target, state);
    }

    private static Double pitchTarget(double targetPitchDeg, FlightState state) {
        if (state.pitchDeg() > 32 && targetPitchDeg < state.pitchDeg()) return -0.72;
        if (state.pitchDeg() < -32 && targetPitchDeg > state.pitchDeg()) return 0.72;
        return clamp((targetPitchDeg - state.pitchDeg()) / 20, -0.58, 0.58);
    }

    private static double throttleForSpeed(FlightState state, double lowSpeed, double highSpeed) {
        return state.speedMps() > 120 ? Math.min(0.42, highSpeed) : state.speedMps() > 85 ? 0.62 : lowSpeed;
    }

    private static Double rollLevel(FlightState state) {
        return rollTarget(0, state);
    }

    private static Double rollTarget(double bankDeg, FlightState state) {
        return clamp((bankDeg - state.rollDeg()) / 30, -0.9, 0.9);
    }

    private static double normalizeHeading(double degrees) {
        double value = degrees % 360;
        if (value > 180) value -= 360;
        if (value < -180) value += 360;
        return value;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
