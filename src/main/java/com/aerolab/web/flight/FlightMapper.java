package com.aerolab.web.flight;

import com.aerolab.core.flight.AircraftDefinition;
import com.aerolab.core.flight.ControlSurfaceSpec;
import com.aerolab.core.flight.EngineSpec;
import com.aerolab.core.flight.FlightSystems;
import com.aerolab.core.flight.FlightSystemsFactory;
import com.aerolab.core.flight.FlightSystemsValidator;
import com.aerolab.core.flight.GunSpec;
import com.aerolab.core.flight.KeyBindings;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.ModelValidator;
import com.aerolab.core.model.VehicleModel;
import com.aerolab.core.world.TerrainWorld;
import com.aerolab.web.BinaryEncoding;
import com.aerolab.web.SimulationMapper;
import com.aerolab.web.dto.ModelDto;

import java.util.List;
import java.util.Map;

public final class FlightMapper {

    private FlightMapper() {
    }

    public static AircraftDefinition toDefinition(FlightStartRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("飞行请求不能为空");
        }
        VehicleModel model = SimulationMapper.toDomain(request.model());
        ModelValidator.validate(model);
        FlightSystems systems = request.flightSystems() == null
                ? FlightSystemsFactory.defaults()
                : toSystems(request.flightSystems());
        FlightSystemsValidator.validate(systems);
        KeyBindings bindings = new KeyBindings(request.bindings());
        return new AircraftDefinition(model, systems, bindings);
    }

    private static FlightSystems toSystems(FlightStartRequest.FlightSystemsDto dto) {
        return new FlightSystems(
                dto.engines() == null ? List.of() : dto.engines().stream()
                        .map(engine -> new EngineSpec(
                                engine.id(),
                                engine.name(),
                                toVec3(engine.position()),
                                engine.maxThrustN()
                        ))
                        .toList(),
                dto.horizontalRudders() == null ? List.of() : dto.horizontalRudders().stream()
                        .map(surface -> new ControlSurfaceSpec(surface.id(), surface.name(), toVec3(surface.position())))
                        .toList(),
                dto.verticalRudders() == null ? List.of() : dto.verticalRudders().stream()
                        .map(surface -> new ControlSurfaceSpec(surface.id(), surface.name(), toVec3(surface.position())))
                        .toList(),
                dto.guns() == null ? List.of() : dto.guns().stream()
                        .map(gun -> new GunSpec(gun.id(), gun.name(), toVec3(gun.position())))
                        .toList(),
                dto.massKg()
        );
    }

    private static Vec3 toVec3(ModelDto.Vec3Dto value) {
        if (value == null) {
            throw new IllegalArgumentException("飞行系统位置不能为空");
        }
        return new Vec3(value.x(), value.y(), value.z());
    }

    public static FlightWorldDto toWorldDto(TerrainWorld world) {
        var runway = world.runway();
        var start = world.startPosition(1.42);
        return new FlightWorldDto(
                world.resolution(),
                world.originX(),
                world.originZ(),
                world.sizeX(),
                world.sizeZ(),
                world.minHeight(),
                world.maxHeight(),
                "base64-float32-le",
                BinaryEncoding.encodeFloats(world.heights()),
                new FlightWorldDto.RunwayDto(
                        runway.centerX(),
                        runway.centerZ(),
                        runway.length(),
                        runway.width(),
                        runway.elevation(),
                        runway.headingRadians()
                ),
                new ModelDto.Vec3Dto(start.x(), start.y(), start.z())
        );
    }
}
