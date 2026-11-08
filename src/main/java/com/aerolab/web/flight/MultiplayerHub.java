package com.aerolab.web.flight;

import com.aerolab.core.world.WorldSeed;
import com.aerolab.web.dto.ModelDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory presence and traffic registry. A "room" is one deterministic
 * terrain world; players in different rooms never see one another.
 */
@Component
public class MultiplayerHub {

    public static final int MAX_PLAYERS_PER_ROOM = 8;

    public record PlayerProfile(
            String playerId,
            String name,
            String seed,
            int slot,
            String color,
            ModelDto model
    ) {
    }

    public record PlayerState(String playerId, FlightStateDto state) {
    }

    public record JoinResult(String seed, int slot, List<PlayerProfile> players) {
    }

    private final Map<String, Room> rooms = new LinkedHashMap<>();

    public synchronized JoinResult join(
            String seed,
            String playerId,
            String playerName,
            String playerColor,
            ModelDto model
    ) {
        String roomId = WorldSeed.normalize(seed);
        Room room = rooms.computeIfAbsent(roomId, Room::new);
        Member existing = room.members.get(playerId);
        int slot;
        if (existing != null) {
            slot = existing.profile.slot();
        } else {
            if (room.members.size() >= MAX_PLAYERS_PER_ROOM) {
                throw new IllegalArgumentException("该世界房间已满（最多 " + MAX_PLAYERS_PER_ROOM + " 名玩家）");
            }
            slot = room.nextSlot++;
        }
        PlayerProfile profile = new PlayerProfile(
                playerId,
                safeName(playerName),
                roomId,
                slot,
                safeColor(playerColor),
                model
        );
        room.members.put(playerId, new Member(profile, existing == null ? null : existing.state));
        return new JoinResult(roomId, slot, profiles(room));
    }

    public synchronized PlayerProfile updateProfile(
            String seed,
            String playerId,
            String playerName,
            String playerColor
    ) {
        Room room = rooms.get(WorldSeed.normalize(seed));
        if (room == null) return null;
        Member member = room.members.get(playerId);
        if (member == null) return null;
        PlayerProfile updated = new PlayerProfile(
                playerId,
                safeName(playerName),
                member.profile.seed(),
                member.profile.slot(),
                safeColor(playerColor),
                member.profile.model()
        );
        room.members.put(playerId, new Member(updated, member.state));
        return updated;
    }

    public synchronized void updateState(String seed, String playerId, FlightStateDto state) {
        Room room = rooms.get(WorldSeed.normalize(seed));
        if (room == null) return;
        Member member = room.members.get(playerId);
        if (member != null) {
            room.members.put(playerId, new Member(member.profile, state));
        }
    }

    public synchronized List<PlayerProfile> leave(String seed, String playerId) {
        String roomId = WorldSeed.normalize(seed);
        Room room = rooms.get(roomId);
        if (room == null) return List.of();
        room.members.remove(playerId);
        if (room.members.isEmpty()) {
            rooms.remove(roomId);
            return List.of();
        }
        return profiles(room);
    }

    public synchronized List<PlayerProfile> profiles(String seed) {
        Room room = rooms.get(WorldSeed.normalize(seed));
        return room == null ? List.of() : profiles(room);
    }

    public synchronized List<PlayerState> states(String seed) {
        Room room = rooms.get(WorldSeed.normalize(seed));
        if (room == null) return List.of();
        List<PlayerState> result = new ArrayList<>();
        for (Member member : room.members.values()) {
            if (member.state != null) {
                result.add(new PlayerState(member.profile.playerId(), member.state));
            }
        }
        return result;
    }

    private static List<PlayerProfile> profiles(Room room) {
        return room.members.values().stream()
                .map(Member::profile)
                .sorted(Comparator.comparingInt(PlayerProfile::slot))
                .toList();
    }

    private static String safeName(String value) {
        if (value == null || value.isBlank()) return "飞行员";
        String trimmed = value.trim();
        return trimmed.length() > 24 ? trimmed.substring(0, 24) : trimmed;
    }

    private static String safeColor(String value) {
        return value != null && value.matches("#[0-9a-fA-F]{6}") ? value.toLowerCase() : "#35c6b1";
    }

    private static final class Room {
        private final Map<String, Member> members = new LinkedHashMap<>();
        private int nextSlot;

        private Room(String ignoredSeed) {
        }
    }

    private record Member(PlayerProfile profile, FlightStateDto state) {
    }
}
