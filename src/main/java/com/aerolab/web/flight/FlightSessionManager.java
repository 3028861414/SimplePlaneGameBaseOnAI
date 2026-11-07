package com.aerolab.web.flight;

import com.aerolab.core.flight.AircraftDefinition;
import com.aerolab.core.flight.FlightDynamics;
import com.aerolab.core.world.TerrainWorld;
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
import java.util.Map;
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

    private final ObjectMapper objectMapper;
    private final TerrainWorld terrainWorld;
    private final FlightWorldDto worldDto;
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
        this.worldDto = FlightMapper.toWorldDto(terrainWorld);
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
        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(rawSession, 4_000, 2 * 1024 * 1024);
        FlightMessages.Ready ready = new FlightMessages.Ready(worldDto, FlightStateDto.from(dynamics.snapshot()));
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(ready)));
        runtimes.put(rawSession.getId(), new Runtime(session, dynamics));
        LOG.info("Flight session started for {} ({} engines, {} m/s start altitude)",
                rawSession.getId(),
                definition.systems().engines().size(),
                dynamics.snapshot().altitudeMslM());
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
                if (runtime.tick % TELEMETRY_EVERY_TICKS == 0) {
                    FlightMessages.State state = new FlightMessages.State(
                            FlightStateDto.from(runtime.dynamics.snapshot())
                    );
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

    private static final class Runtime {
        private final WebSocketSession session;
        private final FlightDynamics dynamics;
        private int tick;

        private Runtime(WebSocketSession session, FlightDynamics dynamics) {
            this.session = session;
            this.dynamics = dynamics;
        }
    }
}
