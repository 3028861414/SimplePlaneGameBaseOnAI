package com.aerolab.config;

import com.aerolab.web.flight.FlightWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class FlightWebSocketConfig implements WebSocketConfigurer {

    private final FlightWebSocketHandler flightWebSocketHandler;

    public FlightWebSocketConfig(FlightWebSocketHandler flightWebSocketHandler) {
        this.flightWebSocketHandler = flightWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(flightWebSocketHandler, "/ws/flight")
                .setAllowedOriginPatterns("*");
    }

    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(2 * 1024 * 1024);
        container.setMaxBinaryMessageBufferSize(2 * 1024 * 1024);
        container.setMaxSessionIdleTimeout(120_000L);
        return container;
    }
}
