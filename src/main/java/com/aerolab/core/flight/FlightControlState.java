package com.aerolab.core.flight;

public final class FlightControlState {

    private boolean throttleUp;
    private boolean throttleDown;
    private boolean pitchUp;
    private boolean pitchDown;
    private boolean yawLeft;
    private boolean yawRight;
    private boolean boost;
    private boolean brake;

    public void setKey(KeyBindings bindings, String code, boolean pressed) {
        if (code == null) return;
        if (code.equals(bindings.codeFor(KeyBindings.THROTTLE_UP))) throttleUp = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.THROTTLE_DOWN))) throttleDown = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.PITCH_UP))) pitchUp = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.PITCH_DOWN))) pitchDown = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.YAW_LEFT))) yawLeft = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.YAW_RIGHT))) yawRight = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.BOOST))) boost = pressed;
        if (code.equals(bindings.codeFor(KeyBindings.BRAKE))) brake = pressed;
    }

    public void clear() {
        throttleUp = false;
        throttleDown = false;
        pitchUp = false;
        pitchDown = false;
        yawLeft = false;
        yawRight = false;
        boost = false;
        brake = false;
    }

    public double throttleDirection() {
        return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    }

    public double pitchDirection() {
        return (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
    }

    public double yawDirection() {
        return (yawRight ? 1 : 0) - (yawLeft ? 1 : 0);
    }

    public boolean boost() {
        return boost;
    }

    public boolean brake() {
        return brake;
    }
}
