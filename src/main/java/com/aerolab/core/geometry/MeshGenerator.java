package com.aerolab.core.geometry;

import com.aerolab.core.model.ModelPart;
import com.aerolab.core.model.ShapeType;
import com.aerolab.core.model.VehicleModel;

import java.util.ArrayList;
import java.util.List;

public final class MeshGenerator {

    private static final int RADIAL_SEGMENTS = 32;
    private static final int SPHERE_LONGITUDES = 28;
    private static final int SPHERE_LATITUDES = 18;

    public List<PartMesh> generate(VehicleModel model) {
        List<PartMesh> meshes = new ArrayList<>(model.parts().size());
        for (ModelPart part : model.parts()) {
            List<MeshTriangle> triangles = switch (part.shape()) {
                case BOX -> box(part);
                case ELLIPSOID -> ellipsoid(part);
                case CYLINDER -> cylinder(part);
                case CONE -> cone(part);
            };
            if (triangles.isEmpty()) {
                throw new IllegalArgumentException(part.name() + " 生成了空网格");
            }
            List<Vec3> points = new ArrayList<>(triangles.size() * 3);
            for (MeshTriangle triangle : triangles) {
                points.add(triangle.a());
                points.add(triangle.b());
                points.add(triangle.c());
            }
            meshes.add(new PartMesh(part, triangles, Aabb.fromPoints(points)));
        }
        return List.copyOf(meshes);
    }

    private List<MeshTriangle> box(ModelPart part) {
        List<MeshTriangle> triangles = new ArrayList<>(12);
        addQuad(triangles, part,
                new Vec3(0.5, -0.5, 0.5), new Vec3(0.5, 0.5, 0.5),
                new Vec3(0.5, 0.5, -0.5), new Vec3(0.5, -0.5, -0.5),
                new Vec3(1, 0, 0));
        addQuad(triangles, part,
                new Vec3(-0.5, -0.5, -0.5), new Vec3(-0.5, 0.5, -0.5),
                new Vec3(-0.5, 0.5, 0.5), new Vec3(-0.5, -0.5, 0.5),
                new Vec3(-1, 0, 0));
        addQuad(triangles, part,
                new Vec3(-0.5, 0.5, 0.5), new Vec3(-0.5, 0.5, -0.5),
                new Vec3(0.5, 0.5, -0.5), new Vec3(0.5, 0.5, 0.5),
                new Vec3(0, 1, 0));
        addQuad(triangles, part,
                new Vec3(-0.5, -0.5, -0.5), new Vec3(-0.5, -0.5, 0.5),
                new Vec3(0.5, -0.5, 0.5), new Vec3(0.5, -0.5, -0.5),
                new Vec3(0, -1, 0));
        addQuad(triangles, part,
                new Vec3(-0.5, -0.5, 0.5), new Vec3(0.5, -0.5, 0.5),
                new Vec3(0.5, 0.5, 0.5), new Vec3(-0.5, 0.5, 0.5),
                new Vec3(0, 0, 1));
        addQuad(triangles, part,
                new Vec3(0.5, -0.5, -0.5), new Vec3(-0.5, -0.5, -0.5),
                new Vec3(-0.5, 0.5, -0.5), new Vec3(0.5, 0.5, -0.5),
                new Vec3(0, 0, -1));
        return triangles;
    }

    private void addQuad(List<MeshTriangle> triangles, ModelPart part,
                         Vec3 a, Vec3 b, Vec3 c, Vec3 d, Vec3 normal) {
        addTriangle(triangles, part, a, b, c, normal, normal, normal);
        addTriangle(triangles, part, a, c, d, normal, normal, normal);
    }

    private List<MeshTriangle> ellipsoid(ModelPart part) {
        List<MeshTriangle> triangles = new ArrayList<>(SPHERE_LONGITUDES * SPHERE_LATITUDES * 2);
        for (int lat = 0; lat < SPHERE_LATITUDES; lat++) {
            double phi0 = -Math.PI / 2 + Math.PI * lat / SPHERE_LATITUDES;
            double phi1 = -Math.PI / 2 + Math.PI * (lat + 1) / SPHERE_LATITUDES;
            for (int lon = 0; lon < SPHERE_LONGITUDES; lon++) {
                double theta0 = 2 * Math.PI * lon / SPHERE_LONGITUDES;
                double theta1 = 2 * Math.PI * (lon + 1) / SPHERE_LONGITUDES;
                Vec3 p00 = spherePoint(phi0, theta0);
                Vec3 p01 = spherePoint(phi1, theta0);
                Vec3 p11 = spherePoint(phi1, theta1);
                Vec3 p10 = spherePoint(phi0, theta1);
                Vec3 n00 = p00.normalized();
                Vec3 n01 = p01.normalized();
                Vec3 n11 = p11.normalized();
                Vec3 n10 = p10.normalized();
                addTriangle(triangles, part, p00, p01, p11, n00, n01, n11);
                addTriangle(triangles, part, p00, p11, p10, n00, n11, n10);
            }
        }
        return triangles;
    }

    private Vec3 spherePoint(double latitude, double longitude) {
        double cosLat = Math.cos(latitude);
        return new Vec3(
                0.5 * cosLat * Math.cos(longitude),
                0.5 * Math.sin(latitude),
                0.5 * cosLat * Math.sin(longitude)
        );
    }

    private List<MeshTriangle> cylinder(ModelPart part) {
        List<MeshTriangle> triangles = new ArrayList<>(RADIAL_SEGMENTS * 4);
        for (int i = 0; i < RADIAL_SEGMENTS; i++) {
            double a0 = 2 * Math.PI * i / RADIAL_SEGMENTS;
            double a1 = 2 * Math.PI * (i + 1) / RADIAL_SEGMENTS;
            Vec3 bottom0 = new Vec3(0.5 * Math.cos(a0), -0.5, 0.5 * Math.sin(a0));
            Vec3 top0 = new Vec3(0.5 * Math.cos(a0), 0.5, 0.5 * Math.sin(a0));
            Vec3 top1 = new Vec3(0.5 * Math.cos(a1), 0.5, 0.5 * Math.sin(a1));
            Vec3 bottom1 = new Vec3(0.5 * Math.cos(a1), -0.5, 0.5 * Math.sin(a1));
            Vec3 n0 = new Vec3(Math.cos(a0), 0, Math.sin(a0));
            Vec3 n1 = new Vec3(Math.cos(a1), 0, Math.sin(a1));
            addTriangle(triangles, part, bottom0, top0, top1, n0, n0, n1);
            addTriangle(triangles, part, bottom0, top1, bottom1, n0, n1, n1);
            addTriangle(triangles, part, new Vec3(0, 0.5, 0), top0, top1, Vec3.UP, Vec3.UP, Vec3.UP);
            addTriangle(triangles, part, new Vec3(0, -0.5, 0), bottom1, bottom0,
                    new Vec3(0, -1, 0), new Vec3(0, -1, 0), new Vec3(0, -1, 0));
        }
        return triangles;
    }

    private List<MeshTriangle> cone(ModelPart part) {
        List<MeshTriangle> triangles = new ArrayList<>(RADIAL_SEGMENTS * 2);
        Vec3 apex = new Vec3(0, 0.5, 0);
        Vec3 apexNormal = Vec3.UP;
        for (int i = 0; i < RADIAL_SEGMENTS; i++) {
            double a0 = 2 * Math.PI * i / RADIAL_SEGMENTS;
            double a1 = 2 * Math.PI * (i + 1) / RADIAL_SEGMENTS;
            Vec3 base0 = new Vec3(0.5 * Math.cos(a0), -0.5, 0.5 * Math.sin(a0));
            Vec3 base1 = new Vec3(0.5 * Math.cos(a1), -0.5, 0.5 * Math.sin(a1));
            Vec3 normal0 = new Vec3(Math.cos(a0), 0.5, Math.sin(a0)).normalized();
            Vec3 normal1 = new Vec3(Math.cos(a1), 0.5, Math.sin(a1)).normalized();
            addTriangle(triangles, part, base0, apex, base1, normal0, apexNormal, normal1);
            addTriangle(triangles, part, new Vec3(0, -0.5, 0), base1, base0,
                    new Vec3(0, -1, 0), new Vec3(0, -1, 0), new Vec3(0, -1, 0));
        }
        return triangles;
    }

    private void addTriangle(List<MeshTriangle> triangles, ModelPart part,
                             Vec3 la, Vec3 lb, Vec3 lc,
                             Vec3 na, Vec3 nb, Vec3 nc) {
        Vec3 a = part.toWorld(la);
        Vec3 b = part.toWorld(lb);
        Vec3 c = part.toWorld(lc);
        Vec3 wa = part.normalToWorld(na);
        Vec3 wb = part.normalToWorld(nb);
        Vec3 wc = part.normalToWorld(nc);
        Vec3 geometric = b.subtract(a).cross(c.subtract(a));
        if (geometric.lengthSquared() < 1e-16) {
            return;
        }
        Vec3 averageNormal = wa.add(wb).add(wc);
        if (geometric.dot(averageNormal) < 0) {
            Vec3 tmpPoint = b;
            b = c;
            c = tmpPoint;
            Vec3 tmpNormal = wb;
            wb = wc;
            wc = tmpNormal;
        }
        triangles.add(new MeshTriangle(a, b, c, wa, wb, wc));
    }
}
