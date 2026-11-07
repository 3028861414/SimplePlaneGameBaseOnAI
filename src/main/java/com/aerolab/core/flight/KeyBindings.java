package com.aerolab.core.flight;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public record KeyBindings(Map<String, String> bindings) {

    public static final String THROTTLE_UP = "throttleUp";
    public static final String THROTTLE_DOWN = "throttleDown";
    public static final String PITCH_UP = "pitchUp";
    public static final String PITCH_DOWN = "pitchDown";
    public static final String YAW_LEFT = "yawLeft";
    public static final String YAW_RIGHT = "yawRight";
    public static final String BOOST = "boost";
    public static final String BRAKE = "brake";
    public static final String TOGGLE_CAMERA = "toggleCamera";
    public static final String RESET_FLIGHT = "resetFlight";
    public static final String FIRE_GUNS = "fireGuns";

    public static final Set<String> ACTIONS = Set.of(
            THROTTLE_UP, THROTTLE_DOWN, PITCH_UP, PITCH_DOWN, YAW_LEFT, YAW_RIGHT,
            BOOST, BRAKE, TOGGLE_CAMERA, RESET_FLIGHT, FIRE_GUNS
    );

    private static final Map<String, String> DEFAULTS = Map.ofEntries(
            Map.entry(THROTTLE_UP, "KeyW"),
            Map.entry(THROTTLE_DOWN, "KeyS"),
            Map.entry(PITCH_UP, "ArrowUp"),
            Map.entry(PITCH_DOWN, "ArrowDown"),
            Map.entry(YAW_LEFT, "ArrowLeft"),
            Map.entry(YAW_RIGHT, "ArrowRight"),
            Map.entry(BOOST, "ShiftLeft"),
            Map.entry(BRAKE, "KeyB"),
            Map.entry(TOGGLE_CAMERA, "KeyC"),
            Map.entry(RESET_FLIGHT, "KeyR"),
            Map.entry(FIRE_GUNS, "Space")
    );

    public KeyBindings {
        Map<String, String> normalized = new LinkedHashMap<>(DEFAULTS);
        if (bindings != null) {
            for (Map.Entry<String, String> entry : bindings.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null) {
                    continue;
                }
                String action = entry.getKey().trim();
                String code = entry.getValue().trim();
                if (!ACTIONS.contains(action)) {
                    throw new IllegalArgumentException("未知按键动作: " + action);
                }
                if (code.isEmpty() || code.length() > 40) {
                    throw new IllegalArgumentException("按键代码无效: " + action);
                }
                normalized.put(action, code);
            }
        }
        bindings = Map.copyOf(normalized);
    }

    public static KeyBindings defaults() {
        return new KeyBindings(Map.of());
    }

    public String codeFor(String action) {
        return bindings.getOrDefault(action, DEFAULTS.get(action));
    }
}
