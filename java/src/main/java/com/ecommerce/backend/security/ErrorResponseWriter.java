package com.ecommerce.backend.security;

import com.ecommerce.backend.common.error.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;

/** Writes the consistent {@code { success:false, ... }} JSON error envelope. */
public final class ErrorResponseWriter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ErrorResponseWriter() {}

    public static void writeError(HttpServletResponse response, int status, String message, String code)
            throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("code", code);
        writeJson(response, status, body);
    }

    public static void writeError(HttpServletResponse response, ApiException ex) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", ex.getMessage());
        body.put("code", ex.getErrorCode());
        if (ex.getDetails() != null) {
            body.put("details", ex.getDetails());
        }
        writeJson(response, ex.getStatus().value(), body);
    }

    public static void writeJson(HttpServletResponse response, int status, Object body) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        MAPPER.writeValue(response.getWriter(), body);
    }
}
