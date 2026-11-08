package com.aerolab.core.world;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WorldSeedTest {

    @Test
    void numericCodesRemainLiteralAndOtherCodesAreStable() {
        assertEquals(20261107L, WorldSeed.value("20261107"));
        assertEquals(WorldSeed.value("ALPHA-9"), WorldSeed.value("alpha-9"));
    }

    @Test
    void generatedCodesAreUsable() {
        String code = WorldSeed.randomCode();
        assertEquals(8, code.length());
        assertEquals(code, WorldSeed.normalize(code));
    }

    @Test
    void rejectsUnsafeCharacters() {
        assertThrows(IllegalArgumentException.class, () -> WorldSeed.normalize("bad seed"));
        assertThrows(IllegalArgumentException.class, () -> WorldSeed.normalize("bad/seed"));
    }
}
