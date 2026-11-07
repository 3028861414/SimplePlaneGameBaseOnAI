package com.aerolab.core.simulation;

import com.aerolab.core.geometry.Aabb;
import com.aerolab.core.geometry.MeshGenerator;
import com.aerolab.core.geometry.MeshTriangle;
import com.aerolab.core.geometry.PartMesh;
import com.aerolab.core.geometry.Vec3;
import com.aerolab.core.model.ModelValidator;
import com.aerolab.core.model.VehicleModel;

import java.util.ArrayList;
import java.util.List;

/**
 * Fast engineering visualisation model: an anisotropic potential-flow
 * disturbance field combined with an empirical separated-wake model. It is
 * intentionally lightweight and deterministic; it is not a Navier-Stokes CFD
 * solver and must not be used for certification or structural sizing.
 */
public final class SimplifiedAerodynamicSimulator implements AerodynamicSimulator {

    public static final String SOLVER_NAME = "AeroLab PotentialFlow + Wake / v1";

    private static final int GRID_X = 46;
    private static final int GRID_Y = 24;
    private static final int GRID_Z = 28;
    private static final double INFLUENCE_CUTOFF = 6.0;

    private final MeshGenerator meshGenerator;

    public SimplifiedAerodynamicSimulator() {
        this(new MeshGenerator());
    }

    public SimplifiedAerodynamicSimulator(MeshGenerator meshGenerator) {
        this.meshGenerator = meshGenerator;
    }

    @Override
    public SimulationResult simulate(VehicleModel model, FlowConditions conditions) {
        long startedAt = System.nanoTime();
        ModelValidator.validate(model);
        if (conditions == null) {
            throw new IllegalArgumentException("来流条件不能为空");
        }

        List<PartMesh> meshes = meshGenerator.generate(model);
        List<Vec3> allPoints = new ArrayList<>();
        for (PartMesh mesh : meshes) {
            for (MeshTriangle triangle : mesh.triangles()) {
                allPoints.add(triangle.a());
                allPoints.add(triangle.b());
                allPoints.add(triangle.c());
            }
        }
        Aabb worldBounds = Aabb.fromPoints(allPoints);
        WindFrame frame = WindFrame.from(conditions);
        List<FlowShape> flowShapes = flowShapes(meshes, frame);
        Aabb windBounds = boundsInWind(meshes, frame);

        FlowGrid grid = createGrid(windBounds, frame);
        SurfaceComputation surfaceComputation = computeSurfaces(meshes, frame, conditions);
        FlowField flow = computeFlow(model, flowShapes, grid, frame, conditions);

        double maxFlowSpeed = Double.NEGATIVE_INFINITY;
        double minFlowSpeed = Double.POSITIVE_INFINITY;
        for (float speed : flow.speed()) {
            if (Float.isFinite(speed)) {
                maxFlowSpeed = Math.max(maxFlowSpeed, speed);
                minFlowSpeed = Math.min(minFlowSpeed, speed);
            }
        }
        if (!Double.isFinite(maxFlowSpeed)) {
            maxFlowSpeed = conditions.windSpeedMps();
            minFlowSpeed = conditions.windSpeedMps();
        }

        SimulationSummary summary = new SimulationSummary(
                conditions.dynamicPressurePa(),
                surfaceComputation.dragN,
                surfaceComputation.liftN,
                surfaceComputation.sideForceN,
                surfaceComputation.forceMagnitudeN,
                surfaceComputation.surfaceAreaM2,
                surfaceComputation.minCp,
                surfaceComputation.maxCp,
                surfaceComputation.minCp * conditions.dynamicPressurePa() / 1000.0,
                surfaceComputation.maxCp * conditions.dynamicPressurePa() / 1000.0,
                maxFlowSpeed,
                minFlowSpeed
        );

        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
        return new SimulationResult(
                SOLVER_NAME,
                conditions,
                worldBounds,
                surfaceComputation.surfaces,
                flow,
                summary,
                conditions.downstreamDirection(),
                elapsedMs
        );
    }

    private List<FlowShape> flowShapes(List<PartMesh> meshes, WindFrame frame) {
        List<FlowShape> shapes = new ArrayList<>(meshes.size());
        for (PartMesh mesh : meshes) {
            double minX = Double.POSITIVE_INFINITY;
            double minY = Double.POSITIVE_INFINITY;
            double minZ = Double.POSITIVE_INFINITY;
            double maxX = Double.NEGATIVE_INFINITY;
            double maxY = Double.NEGATIVE_INFINITY;
            double maxZ = Double.NEGATIVE_INFINITY;
            for (MeshTriangle triangle : mesh.triangles()) {
                for (Vec3 point : List.of(triangle.a(), triangle.b(), triangle.c())) {
                    Vec3 p = frame.toWind(point);
                    minX = Math.min(minX, p.x());
                    minY = Math.min(minY, p.y());
                    minZ = Math.min(minZ, p.z());
                    maxX = Math.max(maxX, p.x());
                    maxY = Math.max(maxY, p.y());
                    maxZ = Math.max(maxZ, p.z());
                }
            }
            Vec3 center = new Vec3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
            double hx = Math.max((maxX - minX) * 0.5, 0.08);
            double hy = Math.max((maxY - minY) * 0.5, 0.08);
            double hz = Math.max((maxZ - minZ) * 0.5, 0.08);
            shapes.add(new FlowShape(center, hx, hy, hz));
        }
        return List.copyOf(shapes);
    }

    private Aabb boundsInWind(List<PartMesh> meshes, WindFrame frame) {
        List<Vec3> points = new ArrayList<>();
        for (PartMesh mesh : meshes) {
            for (MeshTriangle triangle : mesh.triangles()) {
                points.add(frame.toWind(triangle.a()));
                points.add(frame.toWind(triangle.b()));
                points.add(frame.toWind(triangle.c()));
            }
        }
        return Aabb.fromPoints(points);
    }

    private FlowGrid createGrid(Aabb windBounds, WindFrame frame) {
        Vec3 size = windBounds.size();
        double length = Math.max(size.x(), 0.5);
        double height = Math.max(size.y(), 0.5);
        double span = Math.max(size.z(), 0.5);

        double upstream = clamp(0.85 * length, 1.2, 14.0);
        double downstream = clamp(1.65 * length, 2.4, 28.0);
        double vertical = clamp(0.9 * height + 0.35, 1.0, 12.0);
        double lateral = clamp(0.65 * span + 0.4, 1.0, 22.0);

        double xMin = windBounds.min().x() - upstream;
        double xMax = windBounds.max().x() + downstream;
        double yMin = windBounds.min().y() - vertical;
        double yMax = windBounds.max().y() + vertical;
        double zMin = windBounds.min().z() - lateral;
        double zMax = windBounds.max().z() + lateral;

        double dx = (xMax - xMin) / (GRID_X - 1);
        double dy = (yMax - yMin) / (GRID_Y - 1);
        double dz = (zMax - zMin) / (GRID_Z - 1);

        Vec3 origin = frame.toWorld(new Vec3(xMin, yMin, zMin));
        return new FlowGrid(
                GRID_X, GRID_Y, GRID_Z,
                origin,
                frame.downstream().multiply(dx),
                frame.up().multiply(dy),
                frame.lateral().multiply(dz)
        );
    }

    private FlowField computeFlow(
            VehicleModel model,
            List<FlowShape> shapes,
            FlowGrid grid,
            WindFrame frame,
            FlowConditions conditions
    ) {
        int count = grid.size();
        float[] speed = new float[count];
        float[] cp = new float[count];
        float[] vx = new float[count];
        float[] vy = new float[count];
        float[] vz = new float[count];

        double freeStream = conditions.windSpeedMps();

        for (int k = 0; k < grid.nz(); k++) {
            for (int j = 0; j < grid.ny(); j++) {
                for (int i = 0; i < grid.nx(); i++) {
                    int index = grid.index(i, j, k);
                    Vec3 world = grid.position(i, j, k);
                    if (isInsideAnyPart(model, world)) {
                        speed[index] = Float.NaN;
                        cp[index] = Float.NaN;
                        vx[index] = Float.NaN;
                        vy[index] = Float.NaN;
                        vz[index] = Float.NaN;
                        continue;
                    }

                    Vec3 windPoint = frame.toWind(world);
                    double ux = freeStream;
                    double uy = 0;
                    double uz = 0;
                    double wake = 0;

                    for (FlowShape shape : shapes) {
                        double nx = (windPoint.x() - shape.center.x()) / shape.hx;
                        double ny = (windPoint.y() - shape.center.y()) / shape.hy;
                        double nz = (windPoint.z() - shape.center.z()) / shape.hz;
                        double radiusSquared = nx * nx + ny * ny + nz * nz;

                        if (radiusSquared > 1.0 && radiusSquared < INFLUENCE_CUTOFF * INFLUENCE_CUTOFF) {
                            double radius = Math.sqrt(radiusSquared);
                            double nxHat = nx / radius;
                            double nyHat = ny / radius;
                            double nzHat = nz / radius;
                            double wDotN = shape.hx * freeStream * nxHat;
                            double factor = 0.5 / (radiusSquared * radius);
                            double duX = factor * (shape.hx * freeStream - 3 * wDotN * nxHat) / shape.hx;
                            double duY = factor * (-3 * wDotN * nyHat) / shape.hy;
                            double duZ = factor * (-3 * wDotN * nzHat) / shape.hz;

                            // Thin appendages can create very large mapped velocities near their tips.
                            double disturbance = Math.sqrt(duX * duX + duY * duY + duZ * duZ);
                            double limit = 1.25 * freeStream;
                            if (disturbance > limit) {
                                double scale = limit / disturbance;
                                duX *= scale;
                                duY *= scale;
                                duZ *= scale;
                            }
                            ux += duX;
                            uy += duY;
                            uz += duZ;
                        }

                        double wakeX = windPoint.x() - (shape.center.x() + 0.55 * shape.hx);
                        if (wakeX > 0) {
                            double wakeLength = Math.max(5.0 * shape.hx, 0.8);
                            double spreadY = shape.hy + 0.18 * wakeX + 0.08;
                            double spreadZ = shape.hz + 0.12 * wakeX + 0.08;
                            double dy = windPoint.y() - shape.center.y();
                            double dz = windPoint.z() - shape.center.z();
                            double radial = (dy * dy) / (spreadY * spreadY) + (dz * dz) / (spreadZ * spreadZ);
                            if (radial < 5) {
                                double localDeficit = 0.30 * Math.exp(-wakeX / wakeLength) * Math.exp(-0.85 * radial);
                                wake = Math.max(wake, localDeficit);
                            }
                        }
                    }

                    ux -= freeStream * 0.82 * wake;
                    double vx0 = ux;
                    double vy0 = uy;
                    double vz0 = uz;
                    double magnitude = Math.sqrt(vx0 * vx0 + vy0 * vy0 + vz0 * vz0);
                    double maxMagnitude = 2.25 * freeStream;
                    if (magnitude > maxMagnitude) {
                        double scale = maxMagnitude / magnitude;
                        vx0 *= scale;
                        vy0 *= scale;
                        vz0 *= scale;
                        magnitude = maxMagnitude;
                    }

                    double ratio = magnitude / freeStream;
                    double pressureCoefficient = 1.0 - ratio * ratio - 1.65 * wake;
                    pressureCoefficient = clamp(pressureCoefficient, -2.2, 1.0);

                    speed[index] = (float) magnitude;
                    cp[index] = (float) pressureCoefficient;

                    Vec3 worldVelocity = frame.downstream().multiply(vx0)
                            .add(frame.up().multiply(vy0))
                            .add(frame.lateral().multiply(vz0));
                    vx[index] = (float) worldVelocity.x();
                    vy[index] = (float) worldVelocity.y();
                    vz[index] = (float) worldVelocity.z();
                }
            }
        }

        return new FlowField(grid, speed, cp, vx, vy, vz);
    }

    private boolean isInsideAnyPart(VehicleModel model, Vec3 point) {
        for (var part : model.parts()) {
            if (part.contains(point)) {
                return true;
            }
        }
        return false;
    }

    private SurfaceComputation computeSurfaces(
            List<PartMesh> meshes,
            WindFrame frame,
            FlowConditions conditions
    ) {
        double dynamicPressure = conditions.dynamicPressurePa();
        List<PartSurface> surfaces = new ArrayList<>(meshes.size());
        double area = 0;
        double minCp = Double.POSITIVE_INFINITY;
        double maxCp = Double.NEGATIVE_INFINITY;
        Vec3 force = Vec3.ZERO;

        for (PartMesh mesh : meshes) {
            int triangleCount = mesh.triangles().size();
            int vertexCount = triangleCount * 3;
            float[] positions = new float[vertexCount * 3];
            float[] normals = new float[vertexCount * 3];
            float[] cp = new float[vertexCount];
            float[] speed = new float[vertexCount];
            int vertexCursor = 0;

            for (MeshTriangle triangle : mesh.triangles()) {
                Vec3[] points = {triangle.a(), triangle.b(), triangle.c()};
                Vec3[] vertexNormals = {triangle.normalA(), triangle.normalB(), triangle.normalC()};
                double[] triangleCp = new double[3];

                for (int v = 0; v < 3; v++) {
                    Vec3 nWind = new Vec3(
                            vertexNormals[v].dot(frame.downstream()),
                            vertexNormals[v].dot(frame.up()),
                            vertexNormals[v].dot(frame.lateral())
                    );
                    double incidence = -nWind.x();
                    double value;
                    if (incidence >= 0) {
                        value = 0.95 * Math.pow(incidence, 1.55);
                    } else {
                        value = -0.08 - 0.58 * Math.pow(-incidence, 1.08);
                    }
                    value -= 0.17 * nWind.y();
                    value = clamp(value, -1.6, 1.0);
                    triangleCp[v] = value;
                    minCp = Math.min(minCp, value);
                    maxCp = Math.max(maxCp, value);

                    Vec3 point = points[v];
                    int base = vertexCursor * 3;
                    positions[base] = (float) point.x();
                    positions[base + 1] = (float) point.y();
                    positions[base + 2] = (float) point.z();
                    normals[base] = (float) vertexNormals[v].x();
                    normals[base + 1] = (float) vertexNormals[v].y();
                    normals[base + 2] = (float) vertexNormals[v].z();
                    cp[vertexCursor] = (float) value;
                    speed[vertexCursor] = (float) (conditions.windSpeedMps()
                            * Math.sqrt(Math.max(0.0, 1.0 - value)));
                    vertexCursor++;
                }

                double triangleArea = triangle.area();
                area += triangleArea;
                Vec3 normal = triangle.geometricNormal();
                Vec3 normalWind = new Vec3(
                        normal.dot(frame.downstream()),
                        normal.dot(frame.up()),
                        normal.dot(frame.lateral())
                ).normalized();
                double averageCp = (triangleCp[0] + triangleCp[1] + triangleCp[2]) / 3.0;
                force = force.subtract(normalWind.multiply(averageCp * dynamicPressure * triangleArea));
            }

            surfaces.add(new PartSurface(
                    mesh.part().id(),
                    mesh.part().name(),
                    mesh.part().color(),
                    positions,
                    normals,
                    cp,
                    speed
            ));
        }

        if (surfaces.isEmpty()) {
            throw new IllegalArgumentException("模型没有可用表面");
        }
        if (!Double.isFinite(minCp)) {
            minCp = 0;
            maxCp = 0;
        }
        return new SurfaceComputation(
                List.copyOf(surfaces),
                area,
                minCp,
                maxCp,
                force.x(),
                force.y(),
                force.z(),
                force.length()
        );
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record FlowShape(
            Vec3 center,
            double hx,
            double hy,
            double hz
    ) {
    }

    private record SurfaceComputation(
            List<PartSurface> surfaces,
            double surfaceAreaM2,
            double minCp,
            double maxCp,
            double dragN,
            double liftN,
            double sideForceN,
            double forceMagnitudeN
    ) {
    }
}
