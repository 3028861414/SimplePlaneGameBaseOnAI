package com.aerolab.core.simulation;

import com.aerolab.core.model.VehicleModel;

public interface AerodynamicSimulator {

    SimulationResult simulate(VehicleModel model, FlowConditions conditions);
}
