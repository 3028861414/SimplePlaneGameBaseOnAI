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
import com.aerolab.core.world.TerrainChunk;
import com.aerolab.core.world.TerrainWorld;
import com.aerolab.core.world.WorldConfig;
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
                                engine.maxThrustN(),
                                engine.massKg() == null ? 165 : engine.massKg()
                        ))
                        .toList(),
                dto.horizontalRudders() == null ? List.of() : dto.horizontalRudders().stream()
                        .map(surface -> new ControlSurfaceSpec(
                                surface.id(),
                                surface.name(),
                                toVec3(surface.position()),
                                surface.areaM2() == null ? 0.9 : surface.areaM2(),
                                surface.massKg() == null ? 18 : surface.massKg()
                        ))
                        .toList(),
                dto.verticalRudders() == null ? List.of() : dto.verticalRudders().stream()
                        .map(surface -> new ControlSurfaceSpec(
                                surface.id(),
                                surface.name(),
                                toVec3(surface.position()),
                                surface.areaM2() == null ? 0.8 : surface.areaM2(),
                                surface.massKg() == null ? 14 : surface.massKg()
                        ))
                        .toList(),
                dto.guns() == null ? List.of() : dto.guns().stream()
                        .map(gun -> new GunSpec(
                                gun.id(),
                                gun.name(),
                                toVec3(gun.position()),
                                gun.massKg() == null ? 25 : gun.massKg()
                        ))
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

    public static FlightWorldDto toWorldDto(TerrainWorld world, List<TerrainChunk> chunks, int chunkRadius) {
        var runway = world.runway();
        var start = world.startPosition(1.42);
        List<TerrainChunkDto> chunkDtos = chunks.stream().map(FlightMapper::toChunkDto).toList();
        return new FlightWorldDto(
                (int) WorldConfig.CHUNK_SIZE,
                WorldConfig.CHUNK_RESOLUTION,
                "base64-float32-le",
                chunkRadius,
                WorldConfig.MIN_CHUNK_RADIUS,
                WorldConfig.MAX_CHUNK_RADIUS,
                chunkDtos.size(),
                chunkDtos,
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

    public static TerrainChunkDto toChunkDto(TerrainChunk chunk) {
        return new TerrainChunkDto(
                chunk.chunkX(),
                chunk.chunkZ(),
                chunk.resolution(),
                chunk.originX(),
                chunk.originZ(),
                chunk.sizeX(),
                chunk.sizeZ(),
                chunk.minHeight(),
                chunk.maxHeight(),
                chunk.dominantBiome().name(),
                BinaryEncoding.encodeFloats(chunk.heights())
        );
    }
}
