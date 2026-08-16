package com.ecommerce.backend.common.error;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Single place where every error becomes a consistent JSON response
 * (mirrors {@code shared/errors/error-handler.ts}). Security rule: in
 * production the client never sees stack traces or internal messages for
 * unexpected errors.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> apiException(ApiException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", ex.getMessage());
        body.put("code", ex.getErrorCode());
        boolean exposeDetails = ex.getStatus().value() < 500 && ex.getDetails() != null;
        if (exposeDetails) {
            body.put("details", ex.getDetails());
        }
        return ResponseEntity.status(ex.getStatus()).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> errors = new ArrayList<>();
        ex.getBindingResult().getFieldErrors().forEach(fe -> errors.add(Map.of(
                "path", fe.getField(),
                "message", fe.getDefaultMessage() == null ? "Invalid value" : fe.getDefaultMessage())));
        return ResponseEntity.badRequest().body(validationBody(errors));
    }

    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> constraintViolation(
            jakarta.validation.ConstraintViolationException ex) {
        List<Map<String, String>> errors = new ArrayList<>();
        ex.getConstraintViolations().forEach(v -> errors.add(Map.of(
                "path", v.getPropertyPath().toString(),
                "message", v.getMessage())));
        return ResponseEntity.badRequest().body(validationBody(errors));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> castError(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest()
                .body(errorBody("Invalid identifier format", "BAD_REQUEST"));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> malformedJson(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(errorBody("Invalid JSON body", "INVALID_JSON"));
    }

    @ExceptionHandler({MaxUploadSizeExceededException.class})
    public ResponseEntity<Map<String, Object>> bodyTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(errorBody("Request body too large", "PAYLOAD_TOO_LARGE"));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, Object>> duplicateKey(DuplicateKeyException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(errorBody("Resource already exists", "CONFLICT"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(errorBody("Route not found", "NOT_FOUND"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> methodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(errorBody("Method not allowed", "METHOD_NOT_ALLOWED"));
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> accessDenied(
            org.springframework.security.access.AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(errorBody("You do not have permission to perform this action", "FORBIDDEN"));
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<Map<String, Object>> unhandled(Throwable ex, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorBody("Internal server error", "INTERNAL_ERROR"));
    }

    private static Map<String, Object> validationBody(List<Map<String, String>> errors) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", "Validation failed");
        body.put("errors", errors);
        return body;
    }

    private static Map<String, Object> errorBody(String message, String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("code", code);
        return body;
    }
}
