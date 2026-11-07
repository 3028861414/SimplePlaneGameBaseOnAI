package com.aerolab.core.world;

import java.util.Random;

/**
 * Deterministic 2D improved Perlin noise. Coordinates are unitless; callers
 * choose the sampling scale.
 */
public final class PerlinNoise2D {

    private final int[] permutation = new int[512];

    public PerlinNoise2D(long seed) {
        int[] base = new int[256];
        for (int i = 0; i < base.length; i++) {
            base[i] = i;
        }
        Random random = new Random(seed);
        for (int i = base.length - 1; i > 0; i--) {
            int swap = random.nextInt(i + 1);
            int value = base[i];
            base[i] = base[swap];
            base[swap] = value;
        }
        for (int i = 0; i < 512; i++) {
            permutation[i] = base[i & 255];
        }
    }

    public double noise(double x, double y) {
        int xi = floor(x) & 255;
        int yi = floor(y) & 255;
        double xf = x - floor(x);
        double yf = y - floor(y);
        double u = fade(xf);
        double v = fade(yf);

        int aa = permutation[permutation[xi] + yi];
        int ab = permutation[permutation[xi] + yi + 1];
        int ba = permutation[permutation[xi + 1] + yi];
        int bb = permutation[permutation[xi + 1] + yi + 1];

        double x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
        double x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
        return lerp(x1, x2, v);
    }

    public double fbm(double x, double y, int octaves, double lacunarity, double gain) {
        double value = 0;
        double amplitude = 1;
        double frequency = 1;
        double normalizer = 0;
        for (int i = 0; i < octaves; i++) {
            value += noise(x * frequency, y * frequency) * amplitude;
            normalizer += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        return normalizer > 0 ? value / normalizer : 0;
    }

    private static int floor(double value) {
        int integer = (int) value;
        return value < integer ? integer - 1 : integer;
    }

    private static double fade(double value) {
        return value * value * value * (value * (value * 6 - 15) + 10);
    }

    private static double lerp(double a, double b, double t) {
        return a + t * (b - a);
    }

    private static double grad(int hash, double x, double y) {
        int h = hash & 7;
        double u = h < 4 ? x : y;
        double v = h < 4 ? y : x;
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }
}
