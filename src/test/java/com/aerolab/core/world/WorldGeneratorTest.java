package com.aerolab.core.world;

import org.junit.jupiter.api.Test;

import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorldGeneratorTest {

    @Test
    void streamsDeterministicSeamlessChunksAroundAFlatRunway() {
        TerrainWorld world = new WorldGenerator().generate();
        TerrainChunk chunk = world.chunkAt(0, 0);
        TerrainChunk neighbor = world.chunkAt(1, 0);

        assertEquals(WorldConfig.CHUNK_RESOLUTION, chunk.resolution());
        assertEquals(WorldConfig.CHUNK_RESOLUTION * WorldConfig.CHUNK_RESOLUTION, chunk.heights().length);
        assertTrue(chunk.maxHeight() > chunk.minHeight());

        for (int iz = 0; iz < chunk.resolution(); iz++) {
            float leftEdge = chunk.heights()[iz * chunk.resolution() + chunk.resolution() - 1];
            float rightEdge = neighbor.heights()[iz * neighbor.resolution()];
            assertEquals(leftEdge, rightEdge, 0.0001f, "adjacent chunks must share edge heights");
        }

        assertEquals(WorldConfig.RUNWAY_ELEVATION, world.heightAt(WorldConfig.RUNWAY_CENTER_X, 0), 0.01);
        assertEquals(WorldConfig.RUNWAY_ELEVATION,
                world.heightAt(WorldConfig.RUNWAY_CENTER_X - 200, 20), 0.01);
        assertTrue(world.runway().contains(WorldConfig.RUNWAY_CENTER_X, 0));

        var start = world.startPosition(1.42);
        assertEquals(WorldConfig.RUNWAY_ELEVATION + 1.42, start.y(), 0.01);
        assertTrue(world.runway().contains(start.x(), start.z()));

        TerrainWorld second = new WorldGenerator().generate();
        for (int i = -10; i <= 10; i++) {
            assertEquals(world.heightAt(i * 137.0, i * -91.0), second.heightAt(i * 137.0, i * -91.0), 0.0001);
        }
    }

    @Test
    void providesPlainsHillsMountainsAndPlateausAcrossAnUnboundedWorld() {
        TerrainWorld world = new WorldGenerator().generate();
        EnumSet<TerrainBiome> biomes = EnumSet.noneOf(TerrainBiome.class);
        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;

        for (int zi = -40; zi <= 40; zi++) {
            for (int xi = -40; xi <= 40; xi++) {
                double height = world.heightAt(xi * 400.0, zi * 400.0);
                assertTrue(Double.isFinite(height));
                min = Math.min(min, height);
                max = Math.max(max, height);
                biomes.add(world.biomeAt(xi * 400.0, zi * 400.0));
            }
        }

        assertEquals(EnumSet.allOf(TerrainBiome.class), biomes);
        assertTrue(min < 40, "plains/lowlands should be present");
        assertTrue(max > 350, "mountain peaks should be present");
        assertTrue(Double.isFinite(world.heightAt(1_000_000, -1_000_000)));
    }
}
