package com.aerolab.config;

import com.aerolab.core.simulation.AerodynamicSimulator;
import com.aerolab.core.simulation.SimplifiedAerodynamicSimulator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SimulationConfiguration {

    @Bean
    public AerodynamicSimulator aerodynamicSimulator() {
        return new SimplifiedAerodynamicSimulator();
    }
}
