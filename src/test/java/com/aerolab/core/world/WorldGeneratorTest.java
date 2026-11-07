package com.aerolab.core.world;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorldGeneratorTest {

    @Test
    void generatesStableContinuousTerrainWithFlatRunway() {
        TerrainWorld world = new WorldGenerator().generate();

        assertEquals(WorldGenerator.RESOLUTION, world.resolution());
        assertEquals(WorldGenerator.RESOLUTION * WorldGenerator.RESOLUTION, world.heights().length);
        assertTrue(world.maxHeight() > 100);
        assertTrue(world.minHeight() < world.maxHeight());

        assertEquals(WorldGenerator.RUNWAY_ELEVATION, world.heightAt(WorldGenerator.RUNWAY_CENTER_X, 0), 0.01);
        assertEquals(WorldGenerator.RUNWAY_ELEVATION, world.heightAt(WorldGenerator.RUNWAY_CENTER_X - 200, 20), 0.01);
        assertTrue(world.runway().contains(WorldGenerator.RUNWAY_CENTER_X, 0));

        var start = world.startPosition(1.42);
        assertEquals(WorldGenerator.RUNWAY_ELEVATION + 1.42, start.y(), 0.01);
        assertTrue(world.runway().contains(start.x(), start.z()));

        TerrainWorld second = new WorldGenerator().generate();
        for (int index = 0; index < world.heights().length; index += 997) {
            assertEquals(world.heights()[index], second.heights()[index], 0.0001f);
        }
    }
}
