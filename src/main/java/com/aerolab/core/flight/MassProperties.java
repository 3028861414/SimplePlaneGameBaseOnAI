package com.aerolab.core.flight;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.Mat3;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.VehicleModel;

import java.util.ArrayList;
import java.util.List;

/**
 * Mass, center of mass and full 3x3 inertia tensor derived from the modeled
 * geometry and the configured equipment positions.
 */
public record MassProperties(double massKg, Vec3 centerOfMass, Mat3 inertia, Mat3 inverseInertia) {

    public static MassProperties from(VehicleModel model, FlightSystems systems) {
        List<ModelPart> parts = model.parts();
        double specifiedMass = parts.stream().mapToDouble(ModelPart::massKg).sum();
        boolean fallback = specifiedMass <= 1e-6;

        double[] partMasses = new double[parts.size()];
        if (fallback) {
            double totalVolume = 0;
            double[] volumes = new double[parts.size()];
            for (int i = 0; i < parts.size(); i++) {
                volumes[i] = volume(parts.get(i));
                totalVolume += volumes[i];
            }
            double fallbackMass = Math.max(1, systems.massKg());
            for (int i = 0; i < parts.size(); i++) {
                partMasses[i] = totalVolume > 1e-9
                        ? fallbackMass * volumes[i] / totalVolume
                        : fallbackMass / parts.size();
            }
        } else {
            for (int i = 0; i < parts.size(); i++) partMasses[i] = Math.max(0, parts.get(i).massKg());
        }

        List<PointMass> pointMasses = new ArrayList<>();
        for (int i = 0; i < parts.size(); i++) {
            if (partMasses[i] > 1e-9) pointMasses.add(new PointMass(parts.get(i), partMasses[i]));
        }
        if (!fallback) {
            for (EngineSpec engine : systems.engines()) {
                if (engine.massKg() > 0) pointMasses.add(new PointMass(engine.position(), engine.massKg(), Vec3.ZERO));
            }
            for (ControlSurfaceSpec surface : systems.horizontalRudders()) {
                if (surface.massKg() > 0) pointMasses.add(new PointMass(surface.position(), surface.massKg(), Vec3.ZERO));
            }
            for (ControlSurfaceSpec surface : systems.verticalRudders()) {
                if (surface.massKg() > 0) pointMasses.add(new PointMass(surface.position(), surface.massKg(), Vec3.ZERO));
            }
            for (GunSpec gun : systems.guns()) {
                if (gun.massKg() > 0) pointMasses.add(new PointMass(gun.position(), gun.massKg(), Vec3.ZERO));
            }
        }

        double totalMass = pointMasses.stream().mapToDouble(point -> point.massKg).sum();
        if (totalMass <= 1e-6) totalMass = 1;
        Vec3 center = Vec3.ZERO;
        for (PointMass point : pointMasses) {
            center = center.add(point.position.multiply(point.massKg / totalMass));
        }

        double ixx = 0;
        double iyy = 0;
        double izz = 0;
        double ixy = 0;
        double ixz = 0;
        double iyz = 0;
        for (PointMass point : pointMasses) {
            double dx = point.position.x() - center.x();
            double dy = point.position.y() - center.y();
            double dz = point.position.z() - center.z();
            double sx = point.size.x();
            double sy = point.size.y();
            double sz = point.size.z();
            double m = point.massKg;
            ixx += m * (dy * dy + dz * dz) + m * (sy * sy + sz * sz) / 12.0;
            iyy += m * (dx * dx + dz * dz) + m * (sx * sx + sz * sz) / 12.0;
            izz += m * (dx * dx + dy * dy) + m * (sx * sx + sy * sy) / 12.0;
            ixy -= m * dx * dy;
            ixz -= m * dx * dz;
            iyz -= m * dy * dz;
        }

        Mat3 inertia = new Mat3(
                Math.max(1, ixx), ixy, ixz,
                ixy, Math.max(1, iyy), iyz,
                ixz, iyz, Math.max(1, izz)
        );
        return new MassProperties(totalMass, center, inertia, inertia.inverse());
    }


    private static double volume(ModelPart part) {
        Vec3 size = part.size();
        double box = size.x() * size.y() * size.z();
        return switch (part.shape()) {
            case BOX -> box;
            case ELLIPSOID -> Math.PI / 6.0 * box;
            case CYLINDER -> Math.PI / 4.0 * box;
            case CONE -> Math.PI / 12.0 * box;
        };
    }

    private record PointMass(Vec3 position, double massKg, Vec3 size) {
        private PointMass(ModelPart part, double massKg) {
            this(part.position(), massKg, part.localBounds().size());
        }
    }
}
