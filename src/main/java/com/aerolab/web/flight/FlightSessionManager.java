package com.aerolab.web.flight;

import com.aerolab.core.flight.AircraftDefinition;
import com.aerolab.core.flight.FlightAutopilot;
import com.aerolab.core.flight.FlightDynamics;
import com.aerolab.core.flight.FlightState;
import com.aerolab.core.world.TerrainChunk;
import com.aerolab.core.world.TerrainWorld;
import com.aerolab.core.world.WorldConfig;
import com.aerolab.core.world.WorldGenerator;
import com.aerolab.core.world.WorldSeed;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class FlightSessionManager {

    private static final Logger LOG = LoggerFactory.getLogger(FlightSessionManager.class);
    private static final double FIXED_STEP_SECONDS = 1.0 / 60.0;
    private static final int TELEMETRY_EVERY_TICKS = 1;
    private static final int MULTIPLAYER_EVERY_TICKS = 4;
    private static final int MAX_CHUNKS_PER_UPDATE = 4;
    private static final int SEND_BUFFER_BYTES = 8 * 1024 * 1024;

    private final ObjectMapper objectMapper;
    private final MultiplayerHub multiplayerHub;
    private final Map<String, Runtime> runtimes = new ConcurrentHashMap<>();
    private final Map<Long, TerrainWorld> worlds = new ConcurrentHashMap<>();
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "flight-dynamics-loop");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicBoolean running = new AtomicBoolean();
    private long loopTick;

    public FlightSessionManager(ObjectMapper objectMapper, MultiplayerHub multiplayerHub) {
        this.objectMapper = objectMapper;
        this.multiplayerHub = multiplayerHub;
    }

    @PostConstruct
    void startLoop() {
        if (running.compareAndSet(false, true)) {
            loop.scheduleAtFixedRate(this::tickAll, 0, 16_666_667, TimeUnit.NANOSECONDS);
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
        worlds.clear();
    }

    public void startSession(WebSocketSession rawSession, FlightStartRequest request) throws IOException {
        if (runtimes.containsKey(rawSession.getId())) {
            throw new IllegalArgumentException("该连接已经开始飞行");
        }
        AircraftDefinition definition = FlightMapper.toDefinition(request);
        String seed = WorldSeed.normalize(request.seed());
        long seedValue = WorldSeed.value(seed);
        TerrainWorld world = worlds.computeIfAbsent(seedValue, value -> new WorldGenerator().generate(value));
        String playerId = sessionPlayerId(rawSession);
        String playerName = request.playerName() == null || request.playerName().isBlank()
                ? "飞行员" : request.playerName();
        String playerColor = request.playerColor() == null ? "#35c6b1" : request.playerColor();
        MultiplayerHub.JoinResult joined = multiplayerHub.join(
                seed, playerId, playerName, playerColor, request.model()
        );
        double spawnOffset = joined.slot() * 9.0;

        FlightDynamics dynamics = new FlightDynamics(world, definition, spawnOffset);
        FlightState initialState = dynamics.snapshot();
        int chunkRadius = WorldConfig.clampChunkRadius(
                request.chunkRadius() == null ? WorldConfig.DEFAULT_CHUNK_RADIUS : request.chunkRadius()
        );
        Set<String> loadedChunks = new LinkedHashSet<>();
        List<TerrainChunk> initialChunks = loadInitialChunks(world, initialState, chunkRadius, loadedChunks);

        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(
                rawSession, 4_000, SEND_BUFFER_BYTES
        );
        FlightWorldDto worldDto = FlightMapper.toWorldDto(world, initialChunks, chunkRadius, seed);
        FlightStateDto stateDto = FlightStateDto.from(initialState);
        FlightMessages.Ready ready = new FlightMessages.Ready(worldDto, stateDto, playerId, joined.players());
        send(session, ready);

        Runtime runtime = new Runtime(
                session,
                dynamics,
                world,
                seed,
                playerId,
                chunkRadius,
                loadedChunks,
                WorldConfig.chunkIndex(initialState.position().x()),
                WorldConfig.chunkIndex(initialState.position().z())
        );
        runtime.lastStateDto = stateDto;
        runtimes.put(rawSession.getId(), runtime);
        multiplayerHub.updateState(seed, playerId, stateDto);
        broadcastPlayers(seed);
        LOG.info("Flight session started for {} user {} seed {} slot {} ({} engines, {} initial chunks, radius {})",
                rawSession.getId(),
                playerId,
                seed,
                joined.slot(),
                definition.systems().engines().size(),
                initialChunks.size(),
                chunkRadius);
    }

    public void stopSession(WebSocketSession session) {
        Runtime removed = runtimes.remove(session.getId());
        if (removed == null) return;
        multiplayerHub.leave(removed.seed, removed.playerId);
        broadcastPlayers(removed.seed);
        pruneWorld(removed.seed);
        try {
            removed.session.close();
        } catch (IOException ignored) {
            // The peer has already disconnected.
        }
    }

    public void keyChanged(WebSocketSession session, String code, boolean pressed) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.dynamics.setKey(code, pressed);
        }
    }

    public void setEngineThrottle(WebSocketSession session, String engineId, double throttle) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.dynamics.setEngineThrottle(engineId, throttle);
        }
    }

    public void setWeatherEnabled(WebSocketSession session, boolean enabled) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.dynamics.setWeatherEnabled(enabled);
        }
    }

    public void resetSession(WebSocketSession session) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime != null) {
            runtime.autopilot.cancel();
            runtime.dynamics.clearAutopilotCommand();
            runtime.dynamics.reset();
            runtime.chunkDirty = true;
        }
    }

    public void updateProfile(WebSocketSession session, String name, String color) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime == null) return;
        multiplayerHub.updateProfile(runtime.seed, runtime.playerId, name, color);
        broadcastPlayers(runtime.seed);
    }

    public void setAutopilot(WebSocketSession session, String templateId) {
        Runtime runtime = runtimes.get(session.getId());
        if (runtime == null) return;
        if (templateId == null || templateId.isBlank() || "none".equalsIgnoreCase(templateId)) {
            runtime.autopilot.cancel();
            runtime.dynamics.clearAutopilotCommand();
            return;
        }
        boolean started = runtime.autopilot.start(templateId, runtime.dynamics.snapshot());
        if (!started) {
            sendError(session, "未知的飞行模板");
            return;
        }
        runtime.chunkDirty = true;
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
            send(session, new FlightMessages.Error(message));
        } catch (IOException ignored) {
            // The client disconnected while the error was being reported.
        }
    }

    private void tickAll() {
        if (!running.get()) return;
        loopTick++;
        for (Map.Entry<String, Runtime> entry : runtimes.entrySet()) {
            Runtime runtime = entry.getValue();
            try {
                tickRuntime(runtime);
            } catch (Exception exception) {
                LOG.debug("Flight session {} closed after send failure", entry.getKey(), exception);
                runtimes.remove(entry.getKey());
                multiplayerHub.leave(runtime.seed, runtime.playerId);
                broadcastPlayers(runtime.seed);
                pruneWorld(runtime.seed);
                try {
                    runtime.session.close();
                } catch (IOException ignored) {
                    // Already closed.
                }
            }
        }
        if (loopTick % MULTIPLAYER_EVERY_TICKS == 0) {
            broadcastTraffic();
        }
    }

    private void tickRuntime(Runtime runtime) throws IOException {
        FlightState before = runtime.dynamics.snapshot();
        FlightAutopilot.Commands commands = runtime.autopilot.active()
                ? runtime.autopilot.next(before, FIXED_STEP_SECONDS)
                : new FlightAutopilot.Commands(null, null, null, null, true);
        if (runtime.autopilot.active()) {
            runtime.dynamics.setAutopilotCommand(
                    commands.pitch(), commands.roll(), commands.yaw(), commands.throttle()
            );
        } else {
            runtime.dynamics.clearAutopilotCommand();
        }

        runtime.dynamics.step(FIXED_STEP_SECONDS);
        runtime.tick++;
        FlightState snapshot = runtime.dynamics.snapshot();
        if (snapshot.crashed()) {
            runtime.autopilot.cancel();
            runtime.dynamics.clearAutopilotCommand();
        }
        int centerX = WorldConfig.chunkIndex(snapshot.position().x());
        int centerZ = WorldConfig.chunkIndex(snapshot.position().z());
        if (runtime.chunkDirty || centerX != runtime.centerChunkX || centerZ != runtime.centerChunkZ) {
            syncChunks(runtime, centerX, centerZ);
        }
        FlightAutopilot.Status status = runtime.autopilot.status();
        FlightStateDto stateDto = FlightStateDto.from(snapshot, status.id(), status.progress());
        runtime.lastStateDto = stateDto;
        multiplayerHub.updateState(runtime.seed, runtime.playerId, stateDto);
        if (runtime.tick % TELEMETRY_EVERY_TICKS == 0) {
            send(runtime.session, new FlightMessages.State(stateDto));
        }
    }

    private void broadcastTraffic() {
        Map<String, List<MultiplayerHub.PlayerState>> byRoom = new HashMap<>();
        for (Runtime runtime : runtimes.values()) {
            byRoom.computeIfAbsent(runtime.seed, ignored -> new ArrayList<>());
        }
        for (String seed : byRoom.keySet()) {
            byRoom.put(seed, multiplayerHub.states(seed));
        }
        for (Runtime runtime : runtimes.values()) {
            List<MultiplayerHub.PlayerState> states = byRoom.getOrDefault(runtime.seed, List.of());
            if (states.isEmpty()) continue;
            try {
                send(runtime.session, new FlightMessages.Traffic(states));
            } catch (IOException exception) {
                LOG.debug("Unable to send multiplayer traffic", exception);
            }
        }
    }

    private void broadcastPlayers(String seed) {
        List<MultiplayerHub.PlayerProfile> profiles = multiplayerHub.profiles(seed);
        for (Runtime runtime : runtimes.values()) {
            if (!runtime.seed.equals(seed)) continue;
            try {
                send(runtime.session, new FlightMessages.Players(profiles));
            } catch (IOException exception) {
                LOG.debug("Unable to broadcast player profiles", exception);
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
                added.add(FlightMapper.toChunkDto(runtime.world.chunkAt(chunkX, chunkZ)));
                nextLoaded.add(key);
            }
        }

        runtime.centerChunkX = centerX;
        runtime.centerChunkZ = centerZ;
        boolean sendFailed = false;
        if (!added.isEmpty() || !removed.isEmpty()) {
            try {
                send(runtime.session, new FlightMessages.Chunks(added, removed, runtime.chunkRadius));
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

    private List<TerrainChunk> loadInitialChunks(
            TerrainWorld world,
            FlightState state,
            int radius,
            Set<String> keys
    ) {
        int centerX = WorldConfig.chunkIndex(state.position().x());
        int centerZ = WorldConfig.chunkIndex(state.position().z());
        List<TerrainChunk> chunks = new ArrayList<>();
        for (int dz = -radius; dz <= radius; dz++) {
            for (int dx = -radius; dx <= radius; dx++) {
                int chunkX = centerX + dx;
                int chunkZ = centerZ + dz;
                chunks.add(world.chunkAt(chunkX, chunkZ));
                keys.add(WorldConfig.chunkKey(chunkX, chunkZ));
            }
        }
        return chunks;
    }

    private void pruneWorld(String seed) {
        boolean stillUsed = runtimes.values().stream().anyMatch(runtime -> runtime.seed.equals(seed));
        if (!stillUsed) {
            worlds.remove(WorldSeed.value(seed));
        }
    }

    private void send(WebSocketSession session, Object message) throws IOException {
        if (session.isOpen()) {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
        }
    }

    private static String sessionPlayerId(WebSocketSession session) {
        Object value = session.getAttributes().get("playerId");
        return value == null || value.toString().isBlank() ? UUID.randomUUID().toString() : value.toString();
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
        private final TerrainWorld world;
        private final String seed;
        private final String playerId;
        private final FlightAutopilot autopilot = new FlightAutopilot();
        private final Set<String> loadedChunks;
        private int chunkRadius;
        private int centerChunkX;
        private int centerChunkZ;
        private int tick;
        private boolean chunkDirty;
        private FlightStateDto lastStateDto;

        private Runtime(
                WebSocketSession session,
                FlightDynamics dynamics,
                TerrainWorld world,
                String seed,
                String playerId,
                int chunkRadius,
                Set<String> loadedChunks,
                int centerChunkX,
                int centerChunkZ
        ) {
            this.session = session;
            this.dynamics = dynamics;
            this.world = world;
            this.seed = seed;
            this.playerId = playerId;
            this.chunkRadius = chunkRadius;
            this.loadedChunks = loadedChunks;
            this.centerChunkX = centerChunkX;
            this.centerChunkZ = centerChunkZ;
        }
    }
}
