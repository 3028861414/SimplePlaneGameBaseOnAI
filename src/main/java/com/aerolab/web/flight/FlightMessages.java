package com.aerolab.web.flight;

public final class FlightMessages {

    private FlightMessages() {
    }

    public record Ready(String type, FlightWorldDto world, FlightStateDto state) {
        public Ready(FlightWorldDto world, FlightStateDto state) {
            this("ready", world, state);
        }
    }

    public record State(String type, FlightStateDto state) {
        public State(FlightStateDto state) {
            this("state", state);
        }
    }

    public record Error(String type, String message) {
        public Error(String message) {
            this("error", message);
        }
    }
}
