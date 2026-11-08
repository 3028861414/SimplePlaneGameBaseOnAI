package com.aerolab.core.world;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

/**
 * Converts user-facing world codes into deterministic terrain seeds. Numeric
 * codes keep their literal value; other supported codes are hashed stably.
 */
public final class WorldSeed {

    public static final int MAX_CODE_LENGTH = 48;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();

    private WorldSeed() {
    }

    public static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return defaultCode();
        }
        String code = raw.trim().toUpperCase();
        if (code.length() > MAX_CODE_LENGTH) {
            throw new IllegalArgumentException("世界种子代码不能超过 " + MAX_CODE_LENGTH + " 个字符");
        }
        for (int i = 0; i < code.length(); i++) {
            char character = code.charAt(i);
            if (!(Character.isLetterOrDigit(character) || character == '-' || character == '_')) {
                throw new IllegalArgumentException("世界种子只允许字母、数字、短横线和下划线");
            }
        }
        return code;
    }

    public static long value(String code) {
        String normalized = normalize(code);
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ignored) {
            return fnv1a64(normalized);
        }
    }

    public static String defaultCode() {
        return Long.toString(WorldConfig.SEED);
    }

    public static String randomCode() {
        StringBuilder builder = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            builder.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return builder.toString();
    }

    private static long fnv1a64(String value) {
        long hash = 0xcbf29ce484222325L;
        for (byte character : value.getBytes(StandardCharsets.UTF_8)) {
            hash ^= character & 0xffL;
            hash *= 0x100000001b3L;
        }
        return hash;
    }
}
