package com.aerolab.core.model;

import java.util.List;

public record VehicleModel(String name, List<ModelPart> parts, CockpitCamera cockpit) {

    public VehicleModel {
        parts = parts == null ? List.of() : List.copyOf(parts);
    }
}
