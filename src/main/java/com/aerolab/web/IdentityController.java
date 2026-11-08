package com.aerolab.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class IdentityController {

    private final IdentityService identityService;

    public IdentityController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @GetMapping("/identity")
    public IdentityDto identity(
            @CookieValue(name = IdentityService.COOKIE_NAME, required = false) String existing,
            HttpServletResponse response
    ) {
        String userId = existing != null && existing.matches("[A-Za-z0-9_-]{8,80}")
                ? existing
                : identityService.newUserId();
        ResponseCookie cookie = ResponseCookie.from(IdentityService.COOKIE_NAME, userId)
                .path("/")
                .maxAge(IdentityService.COOKIE_MAX_AGE_SECONDS)
                .httpOnly(true)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return new IdentityDto(userId, userId.substring(0, Math.min(8, userId.length())).toUpperCase());
    }

    public record IdentityDto(String userId, String shortId) {
    }
}
