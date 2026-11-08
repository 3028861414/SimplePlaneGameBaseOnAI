package com.aerolab.web;

import jakarta.servlet.http.Cookie;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class IdentityService {

    public static final String COOKIE_NAME = "aerolab_uid";
    public static final int COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

    public String newUserId() {
        return UUID.randomUUID().toString();
    }

    public String resolveCookie(Cookie[] cookies) {
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (COOKIE_NAME.equals(cookie.getName())) {
                    String value = normalize(cookie.getValue());
                    if (value != null) return value;
                }
            }
        }
        return newUserId();
    }

    public String resolveCookieHeader(String header) {
        if (header == null || header.isBlank()) return newUserId();
        for (String part : header.split(";")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length == 2 && COOKIE_NAME.equals(pair[0])) {
                String value = normalize(pair[1]);
                if (value != null) return value;
            }
        }
        return newUserId();
    }

    private String normalize(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.length() < 8 || value.length() > 80) return null;
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (!(Character.isLetterOrDigit(character) || character == '-' || character == '_')) {
                return null;
            }
        }
        return value;
    }
}
