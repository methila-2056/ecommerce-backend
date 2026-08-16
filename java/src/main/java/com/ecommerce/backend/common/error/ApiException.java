package com.ecommerce.backend.common.error;

import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * The Java counterpart of the TypeScript {@code AppError}: an operational,
 * client-facing error carrying an HTTP status, a public message, an error code
 * and optional details. Unexpected (non-AppError) exceptions are never leaked
 * to the client — the global handler converts them to a generic 500.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String errorCode;
    private final Map<String, Object> details;

    public ApiException(HttpStatus status, String message, String errorCode) {
        this(status, message, errorCode, null);
    }

    public ApiException(HttpStatus status, String message, String errorCode, Map<String, Object> details) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
        this.details = details;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Map<String, Object> getDetails() {
        return details;
    }

    public static ApiException badRequest(String message) {
        return badRequest(message, "BAD_REQUEST");
    }

    public static ApiException badRequest(String message, String code) {
        return new ApiException(HttpStatus.BAD_REQUEST, message, code);
    }

    public static ApiException unauthorized(String message, String code) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message, code);
    }

    public static ApiException forbidden(String message, String code) {
        return new ApiException(HttpStatus.FORBIDDEN, message, code);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message, "NOT_FOUND");
    }

    public static ApiException internal(String message, String code) {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, message, code);
    }

    public static ApiException conflict(String message, String code) {
        return new ApiException(HttpStatus.CONFLICT, message, code);
    }

    public static ApiException tooManyRequests(String message, String code, Map<String, Object> details) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, message, code, details);
    }
}
