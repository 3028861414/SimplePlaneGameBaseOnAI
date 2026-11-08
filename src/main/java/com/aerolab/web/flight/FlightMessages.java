package com.aerolab.web.flight;

import java.util.List;

public final class FlightMessages {

    private FlightMessages() {
    }

    public record Ready(
            String type,
            FlightWorldDto world,
            FlightStateDto state,
            String playerId,
            java.util.List<MultiplayerHub.PlayerProfile> players
    ) {
        public Ready(
                FlightWorldDto world,
                FlightStateDto state,
                String playerId,
                java.util.List<MultiplayerHub.PlayerProfile> players
        ) {
            this("ready", world, state, playerId, players);
        }
    }

    public record State(String type, FlightStateDto state) {
        public State(FlightStateDto state) {
            this("state", state);
        }
    }

    public record Chunks(
            String type,
            List<TerrainChunkDto> added,
            List<String> removed,
            int chunkRadius
    ) {
        public Chunks(List<TerrainChunkDto> added, List<String> removed, int chunkRadius) {
            this("chunks", added, removed, chunkRadius);
        }
    }

    public record Players(String type, java.util.List<MultiplayerHub.PlayerProfile> players) {
        public Players(java.util.List<MultiplayerHub.PlayerProfile> players) {
            this("players", players);
        }
    }

    public record Traffic(String type, java.util.List<MultiplayerHub.PlayerState> players) {
        public Traffic(java.util.List<MultiplayerHub.PlayerState> players) {
            this("traffic", players);
        }
    }

    public record Error(String type, String message) {
        public Error(String message) {
            this("error", message);
        }
    }
}
