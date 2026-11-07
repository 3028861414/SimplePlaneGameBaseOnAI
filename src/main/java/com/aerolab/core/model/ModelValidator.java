package com.aerolab.core.model;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

public final class ModelValidator {

    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final int MAX_PARTS = 80;

    private ModelValidator() {
    }

    public static void validate(VehicleModel model) {
        if (model == null) {
            throw new IllegalArgumentException("模型不能为空");
        }
        if (model.name() == null || model.name().isBlank() || model.name().length() > 80) {
            throw new IllegalArgumentException("模型名称需为 1-80 个字符");
        }
        List<ModelPart> parts = model.parts();
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("模型至少需要一个部件");
        }
        if (parts.size() > MAX_PARTS) {
            throw new IllegalArgumentException("模型最多支持 " + MAX_PARTS + " 个部件");
        }
        if (model.cockpit() == null) {
            throw new IllegalArgumentException("必须指定驾驶舱摄像机位置");
        }

        Set<String> ids = new HashSet<>();
        for (int i = 0; i < parts.size(); i++) {
            ModelPart part = parts.get(i);
            if (part == null) {
                throw new IllegalArgumentException("第 " + (i + 1) + " 个部件为空");
            }
            if (part.id() == null || part.id().isBlank() || part.id().length() > 80) {
                throw new IllegalArgumentException("部件 ID 无效");
            }
            if (!ids.add(part.id())) {
                throw new IllegalArgumentException("部件 ID 重复：" + part.id());
            }
            if (part.name() == null || part.name().isBlank() || part.name().length() > 60) {
                throw new IllegalArgumentException("部件名称需为 1-60 个字符");
            }
            validateRange(part.position(), -2000, 2000, part.name() + " 的位置");
            validateRange(part.rotation(), -1080, 1080, part.name() + " 的旋转角");
            validateSize(part);
            if (!Double.isFinite(part.massKg()) || part.massKg() < 0 || part.massKg() > 100_000) {
                throw new IllegalArgumentException(part.name() + " 的质量需在 0-100000 kg 之间");
            }
            if (part.color() == null || !COLOR.matcher(part.color()).matches()) {
                throw new IllegalArgumentException(part.name() + " 的颜色必须为 #RRGGBB 格式");
            }
        }

        CockpitCamera cockpit = model.cockpit();
        validateRange(cockpit.position(), -2000, 2000, "驾驶舱位置");
        if (!Double.isFinite(cockpit.yawDegrees()) || cockpit.yawDegrees() < -360 || cockpit.yawDegrees() > 360) {
            throw new IllegalArgumentException("驾驶舱航向角需在 -360° 至 360° 之间");
        }
        if (!Double.isFinite(cockpit.pitchDegrees()) || cockpit.pitchDegrees() < -89 || cockpit.pitchDegrees() > 89) {
            throw new IllegalArgumentException("驾驶舱俯仰角需在 -89° 至 89° 之间");
        }
    }

    private static void validateRange(com.aerolab.core.geometry.Vec3 value, double min, double max, String label) {
        if (value == null
                || value.x() < min || value.x() > max
                || value.y() < min || value.y() > max
                || value.z() < min || value.z() > max) {
            throw new IllegalArgumentException(label + "超出允许范围");
        }
    }

    private static void validateSize(ModelPart part) {
        var size = part.size();
        if (size == null
                || size.x() < 0.02 || size.x() > 100
                || size.y() < 0.02 || size.y() > 100
                || size.z() < 0.02 || size.z() > 100) {
            throw new IllegalArgumentException(part.name() + " 的尺寸需在 0.02-100 米之间");
        }
    }
}
