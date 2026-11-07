package com.aerolab.web;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.CockpitCamera;
import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.VehicleModel;
import com.aerolab.core.simulation.FlowConditions;
import com.aerolab.core.simulation.FlowField;
import com.aerolab.core.simulation.FlowGrid;
import com.aerolab.core.simulation.PartSurface;
import com.aerolab.core.simulation.SimulationResult;
import com.aerolab.core.simulation.SimulationSummary;
import com.aerolab.web.dto.ModelDto;
import com.aerolab.web.dto.SimulationRequest;
import com.aerolab.web.dto.SimulationResponse;

import java.util.List;
import java.util.UUID;

public final class SimulationMapper {

    private SimulationMapper() {
    }

    public static VehicleModel toDomain(ModelDto dto) {
        if (dto == null) {
            throw new IllegalArgumentException("模型不能为空");
        }
        if (dto.cockpit() == null) {
            throw new IllegalArgumentException("必须指定驾驶舱摄像机位置");
        }
        List<ModelPart> parts = dto.parts() == null ? List.of() : dto.parts().stream()
                .map(SimulationMapper::toDomainPart)
                .toList();
        CockpitCamera cockpit = new CockpitCamera(
                toDomain(dto.cockpit().position(), "驾驶舱位置"),
                dto.cockpit().yawDegrees(),
                dto.cockpit().pitchDegrees()
        );
        return new VehicleModel(dto.name() == null ? "" : dto.name().trim(), parts, cockpit);
    }

    private static ModelPart toDomainPart(ModelDto.PartDto dto) {
        if (dto == null) {
            throw new IllegalArgumentException("部件不能为空");
        }
        String id = dto.id() == null || dto.id().isBlank() ? UUID.randomUUID().toString() : dto.id();
        String name = dto.name() == null ? "" : dto.name().trim();
        return new ModelPart(
                id,
                name,
                dto.shape(),
                toDomain(dto.position(), name + " 的位置"),
                toDomain(dto.rotation(), name + " 的旋转角"),
                toDomain(dto.size(), name + " 的尺寸"),
                dto.color()
        );
    }

    public static FlowConditions toDomain(SimulationRequest.FlowConditionsDto dto) {
        if (dto == null) {
            throw new IllegalArgumentException("来流条件不能为空");
        }
        return new FlowConditions(toDomain(dto.direction(), "来流方向向量"), dto.windSpeedMps(), dto.airDensity());
    }

    private static Vec3 toDomain(ModelDto.Vec3Dto dto, String label) {
        if (dto == null) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        return new Vec3(dto.x(), dto.y(), dto.z());
    }

    public static SimulationResponse toResponse(SimulationResult result) {
        FlowField flow = result.flow();
        FlowGrid grid = flow.grid();
        Aabb bounds = result.modelBounds();
        SimulationSummary summary = result.summary();
        return new SimulationResponse(
                result.solver(),
                result.computeTimeMs(),
                toDto(result.windDirection()),
                new SimulationResponse.BoundsDto(toDto(bounds.min()), toDto(bounds.max())),
                new SimulationResponse.SurfaceDto(
                        result.surfaces().stream().map(SimulationMapper::toDto).toList(),
                        summary.minCp(),
                        summary.maxCp()
                ),
                new SimulationResponse.FlowDto(
                        grid.nx(),
                        grid.ny(),
                        grid.nz(),
                        toDto(grid.origin()),
                        toDto(grid.stepX()),
                        toDto(grid.stepY()),
                        toDto(grid.stepZ()),
                        "i + nx * (j + ny * k)",
                        "base64-float32-le",
                        BinaryEncoding.encodeFloats(flow.speed()),
                        BinaryEncoding.encodeFloats(flow.pressureCoefficient()),
                        BinaryEncoding.encodeFloats(flow.velocityX()),
                        BinaryEncoding.encodeFloats(flow.velocityY()),
                        BinaryEncoding.encodeFloats(flow.velocityZ())
                ),
                new SimulationResponse.SummaryDto(
                        summary.dynamicPressurePa(),
                        summary.dragN(),
                        summary.liftN(),
                        summary.sideForceN(),
                        summary.totalPressureForceN(),
                        summary.surfaceAreaM2(),
                        summary.minCp(),
                        summary.maxCp(),
                        summary.minPressureKpa(),
                        summary.maxPressureKpa(),
                        summary.maxFlowSpeedMps(),
                        summary.minFlowSpeedMps()
                ),
                List.of("简化势流 + 经验尾迹可视化模型，非高保真 CFD，不用于结构强度或适航认证。")
        );
    }

    private static SimulationResponse.PartSurfaceDto toDto(PartSurface surface) {
        return new SimulationResponse.PartSurfaceDto(
                surface.id(),
                surface.name(),
                surface.color(),
                surface.positions(),
                surface.normals(),
                surface.pressureCoefficient(),
                surface.speed()
        );
    }

    private static ModelDto.Vec3Dto toDto(Vec3 value) {
        return new ModelDto.Vec3Dto(value.x(), value.y(), value.z());
    }

}
