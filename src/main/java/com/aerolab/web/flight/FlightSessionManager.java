package com.aerolab.web.flight;

import com.aerolab.core.flight.AircraftDefinition;
import com.aerolab.core.flight.FlightDynamics;
import com.aerolab.core.flight.FlightState;
import com.aerolab.core.world.TerrainChunk;
import com.aerolab.core.world.TerrainWorld;
import com.aerolab.core.world.WorldConfig;
import com.aerolab.core.world.WorldGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class FlightSessionManager {

    private static final Logger LOG = LoggerFactory.getLogger(FlightSessionManager.class);
    private static final double FIXED_STEP_SECONDS = 1.0 / 60.0;
    private static final int TELEMETRY_EVERY_TICKS = 2;
    private static final int MAX_CHUNKS_PER_UPDATE = 12;
    private static final int SEND_BUFFER_BYTES = 8 * 1024 * 1024;

    private final ObjectMapper objectMapper;
    private final TerrainWorld terrainWorld;
    private final Map<String, Runtime> runtimes = new ConcurrentHashMap<>();
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "flight-dynamics-loop");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicBoolean running = new AtomicBoolean();

    public FlightSessionManager(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.terrainWorld = new WorldGenerator().generate();
    }

    @PostConstruct
    void startLoop() {
        if (running.compareAndSet(false, true)) {
            loop.scheduleAtFixedRate(this::tickAll, 0, 16, TimeUnit.MILLISECONDS);
        }
    }

    @PreDestroy
    void shutdown() {
        running.set(false);
        loop.shutdownNow();
        for (Runtime runtime : runtimes.values()) {
            try {
                runtime.session.close();
            } catch (IOException ignored) {
                // The socket is already gone.
            }
        }
        runtimes.clear();
    }

    public void startSession(WebSocketSession rawSession, FlightStartRequest request) throws IOException {
        if (runtimes.containsKey(rawSession.getId())) {
            throw new IllegalArgumentException("该连接已经开始飞行");
        }
        AircraftDefinition definition = FlightMapper.toDefinition(request);
        FlightDynamics dynamics = new FlightDynamics(terrainWorld, definition);
        FlightState initialState = dynamics.snapshot();
        int chunkRadius = WorldConfig.clampChunkRadius(
                request.chunkRadius() == null ? WorldConfig.DEFAULT_CHUNK_RADIUS : request.chunkRadius()
        );
        Set<String> loadedChunks = new LinkedHashSet<>();
        List<TerrainChunk> initialChunks = loadInitialChunks(initialState, chunkRadius, loadedChunks);

        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(
                rawSession, 4_000, SEND_BUFFER_BYTES
        );
        FlightWorldDto world = FlightMapper.toWorldDto(terrainWorld, initialChunks, chunkRadius);
        FlightMessages.Ready ready = new FlightMessages.Ready(world, FlightStateDto.from(initialState));
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(ready)));
        runtimes.put(rawSession.getId(), new Runtime(
                session,
                dynamics,
                chunkRadius,
                loadedChunks,
                WorldConfig.chunkIndex(initialState.position().x()),
                WorldConfig.chunkIndex(initialState.position().z())
        ));
        LOG.info("Flight session started for {} ({} engines, {} initial chunks, radius {})",
                rawSession.getId(),
                definition.systems().engines().size(),
                initialChunks.size(),
                chunkRadius);
    }

    public void stopSession(WebSocketSession session) {
        Runtime removed = runtimes.remove(session.getId());
        if (removed != null) {
            try {
                removed.session.close();
            } catch (IOException ignored) {
                // The peer has already disconnected.
            }
        }
    }

    public void keyChanged(WebSocketSession session, String code, boolean pressed) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.dynamics.setKey(code, pressed);
        }
    }

    public void resetSession(WebSocketSession session) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.dynamics.reset();
            runtime.chunkDirty = true;
        }
    }

    public void setChunkRadius(WebSocketSession session, int requestedRadius) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime == null) return;
        int radius = WorldConfig.clampChunkRadius(requestedRadius);
        if (radius != runtime.chunkRadius) {
            runtime.chunkRadius = radius;
            runtime.chunkDirty = true;
        }
    }

    public void sendError(WebSocketSession session, String message) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(new FlightMessages.Error(message))));
            }
        } catch (IOException ignored) {
            // The client disconnected while the error was being reported.
        }
    }

    private void tickAll() {
        if (!running.get()) return;
        for (Map.Entry<String, Runtime> entry : runtimes.entrySet()) {
            Runtime runtime = entry.getValue();
            try {
                runtime.dynamics.step(FIXED_STEP_SECONDS);
                runtime.tick++;
                FlightState snapshot = runtime.dynamics.snapshot();
                int centerX = WorldConfig.chunkIndex(snapshot.position().x());
                int centerZ = WorldConfig.chunkIndex(snapshot.position().z());
                if (runtime.chunkDirty || centerX != runtime.centerChunkX || centerZ != runtime.centerChunkZ) {
                    syncChunks(runtime, centerX, centerZ);
                }
                if (runtime.tick % TELEMETRY_EVERY_TICKS == 0) {
                    FlightMessages.State state = new FlightMessages.State(FlightStateDto.from(snapshot));
                    runtime.session.sendMessage(new TextMessage(objectMapper.writeValueAsString(state)));
                }
            } catch (Exception exception) {
                LOG.debug("Flight session {} closed after send failure", entry.getKey(), exception);
                runtimes.remove(entry.getKey());
                try {
                    runtime.session.close();
                } catch (IOException ignored) {
                    // Already closed.
                }
            }
        }
    }

    private void syncChunks(Runtime runtime, int centerX, int centerZ) {
        Set<String> required = chunkKeys(centerX, centerZ, runtime.chunkRadius);
        List<String> removed = new ArrayList<>();
        Set<String> nextLoaded = new HashSet<>(runtime.loadedChunks);
        for (String key : runtime.loadedChunks) {
            if (!required.contains(key)) removed.add(key);
        }
        nextLoaded.removeAll(removed);

        List<TerrainChunkDto> added = new ArrayList<>();
        int radius = runtime.chunkRadius;
        outer:
        for (int dz = -radius; dz <= radius; dz++) {
            for (int dx = -radius; dx <= radius; dx++) {
                if (added.size() >= MAX_CHUNKS_PER_UPDATE) break outer;
                int chunkX = centerX + dx;
                int chunkZ = centerZ + dz;
                String key = WorldConfig.chunkKey(chunkX, chunkZ);
                if (nextLoaded.contains(key)) continue;
                added.add(FlightMapper.toChunkDto(terrainWorld.chunkAt(chunkX, chunkZ)));
                nextLoaded.add(key);
            }
        }

        runtime.centerChunkX = centerX;
        runtime.centerChunkZ = centerZ;
        boolean sendFailed = false;
        if (!added.isEmpty() || !removed.isEmpty()) {
            try {
                FlightMessages.Chunks message = new FlightMessages.Chunks(
                        added, removed, runtime.chunkRadius
                );
                runtime.session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
                runtime.loadedChunks.clear();
                runtime.loadedChunks.addAll(nextLoaded);
            } catch (IOException exception) {
                sendFailed = true;
                LOG.debug("Unable to send chunks for flight session", exception);
            }
        } else {
            runtime.loadedChunks.clear();
            runtime.loadedChunks.addAll(nextLoaded);
        }
        runtime.chunkDirty = sendFailed || !runtime.loadedChunks.containsAll(required);
    }

    private List<TerrainChunk> loadInitialChunks(FlightState state, int radius, Set<String> keys) {
        int centerX = WorldConfig.chunkIndex(state.position().x());
        int centerZ = WorldConfig.chunkIndex(state.position().z());
        List<TerrainChunk> chunks = new ArrayList<>();
        for (int dz = -radius; dz <= radius; dz++) {
            for (int dx = -radius; dx <= radius; dx++) {
                int chunkX = centerX + dx;
                int chunkZ = centerZ + dz;
                chunks.add(terrainWorld.chunkAt(chunkX, chunkZ));
                keys.add(WorldConfig.chunkKey(chunkX, chunkZ));
            }
        }
        return chunks;
    }

    private static Set<String> chunkKeys(int centerX, int centerZ, int radius) {
        Set<String> keys = new HashSet<>((radius * 2 + 1) * (radius * 2 + 1) * 2);
        for (int dz = -radius; dz <= radius; dz++) {
            for (int dx = -radius; dx <= radius; dx++) {
                keys.add(WorldConfig.chunkKey(centerX + dx, centerZ + dz));
            }
        }
        return keys;
    }

    private static final class Runtime {
        private final WebSocketSession session;
        private final FlightDynamics dynamics;
        private final Set<String> loadedChunks;
        private int chunkRadius;
        private int centerChunkX;
        private int centerChunkZ;
        private int tick;
        private boolean chunkDirty;

        private Runtime(
                WebSocketSession session,
                FlightDynamics dynamics,
                int chunkRadius,
                Set<String> loadedChunks,
                int centerChunkX,
                int centerChunkZ
        ) {
            this.session = session;
            this.dynamics = dynamics;
            this.chunkRadius = chunkRadius;
            this.loadedChunks = loadedChunks;
            this.centerChunkX = centerChunkX;
            this.centerChunkZ = centerChunkZ;
        }
    }
}
