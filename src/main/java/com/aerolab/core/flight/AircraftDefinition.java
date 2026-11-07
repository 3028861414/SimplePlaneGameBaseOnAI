package com.aerolab.core.flight;

import com.aerolab.core.model.VehicleModel;

public record AircraftDefinition(VehicleModel model, FlightSystems systems, KeyBindings bindings) {

    public static AircraftDefinition withDefaults(VehicleModel model) {
        return new AircraftDefinition(model, FlightSystemsFactory.defaults(), KeyBindings.defaults());
    }
}
