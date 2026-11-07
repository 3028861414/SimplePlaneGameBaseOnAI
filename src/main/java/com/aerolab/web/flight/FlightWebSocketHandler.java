package com.aerolab.web.flight;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class FlightWebSocketHandler extends TextWebSocketHandler {

    private static final Logger LOG = LoggerFactory.getLogger(FlightWebSocketHandler.class);

    private final ObjectMapper objectMapper;
    private final FlightSessionManager sessionManager;

    public FlightWebSocketHandler(ObjectMapper objectMapper, FlightSessionManager sessionManager) {
        this.objectMapper = objectMapper;
        this.sessionManager = sessionManager;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.path("type").asText("");
            switch (type) {
                case "start" -> {
                    FlightStartRequest request = objectMapper.treeToValue(node, FlightStartRequest.class);
                    sessionManager.startSession(session, request);
                }
                case "key" -> sessionManager.keyChanged(
                        session,
                        node.path("code").asText(""),
                        node.path("pressed").asBoolean(false)
                );
                case "reset" -> sessionManager.resetSession(session);
                case "close" -> session.close(CloseStatus.NORMAL);
                default -> sessionManager.sendError(session, "未知的飞行消息类型");
            }
        } catch (IllegalArgumentException exception) {
            sessionManager.sendError(session, exception.getMessage());
        } catch (Exception exception) {
            LOG.debug("Unable to process flight message", exception);
            sessionManager.sendError(session, "飞行指令格式无效");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessionManager.stopSession(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        LOG.debug("Flight transport error for {}", session.getId(), exception);
        sessionManager.stopSession(session);
    }
}
