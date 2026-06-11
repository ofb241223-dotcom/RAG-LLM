package com.example.ragllm.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiRequestLoggingFilter extends OncePerRequestFilter {
    private final RequestLogStore requestLogStore;

    public ApiRequestLoggingFilter(RequestLogStore requestLogStore) {
        this.requestLogStore = requestLogStore;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        if (!shouldLog(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        long started = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            requestLogStore.record(
                    "INBOUND",
                    "Spring Boot",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    elapsedMs(started),
                    request.getContentType()
            );
        }
    }

    private boolean shouldLog(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/")
                && !path.startsWith("/api/observability/requests")
                && !"OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    private long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }
}
