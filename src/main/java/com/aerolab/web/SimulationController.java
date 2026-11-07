package com.aerolab.web;

import com.aerolab.core.model.VehicleModel;
import com.aerolab.core.simulation.AerodynamicSimulator;
import com.aerolab.core.simulation.FlowConditions;
import com.aerolab.core.simulation.SimulationResult;
import com.aerolab.web.dto.SimulationRequest;
import com.aerolab.web.dto.SimulationResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class SimulationController {

    private final AerodynamicSimulator simulator;

    public SimulationController(AerodynamicSimulator simulator) {
        this.simulator = simulator;
    }

    @PostMapping("/simulations")
    public ResponseEntity<SimulationResponse> simulate(@RequestBody SimulationRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        VehicleModel model = SimulationMapper.toDomain(request.model());
        FlowConditions conditions = SimulationMapper.toDomain(request.conditions());
        SimulationResult result = simulator.simulate(model, conditions);
        return ResponseEntity.ok(SimulationMapper.toResponse(result));
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "solver", "potential-flow-v1");
    }
}
