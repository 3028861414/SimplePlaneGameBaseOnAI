package com.aerolab.core.simulation;

public record FlowField(
        FlowGrid grid,
        float[] speed,
        float[] pressureCoefficient,
        float[] velocityX,
        float[] velocityY,
        float[] velocityZ
) {

    public FlowField {
        int expected = grid.size();
        if (speed.length != expected || pressureCoefficient.length != expected
                || velocityX.length != expected || velocityY.length != expected || velocityZ.length != expected) {
            throw new IllegalArgumentException("流场数组长度与网格尺寸不一致");
        }
    }

    public boolean isSolid(int index) {
        return !Float.isFinite(speed[index]);
    }
}
