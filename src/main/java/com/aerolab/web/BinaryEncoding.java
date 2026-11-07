package com.aerolab.web;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Base64;

public final class BinaryEncoding {

    private BinaryEncoding() {
    }

    public static String encodeFloats(float[] values) {
        ByteBuffer buffer = ByteBuffer.allocate(values.length * Float.BYTES).order(ByteOrder.LITTLE_ENDIAN);
        for (float value : values) {
            buffer.putFloat(value);
        }
        return Base64.getEncoder().encodeToString(buffer.array());
    }
}
