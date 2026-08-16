package com.ecommerce.backend.modules.notification;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.notification.NotificationService.NotificationListResult;
import com.ecommerce.backend.modules.notification.NotificationService.NotificationPublic;
import com.ecommerce.backend.security.CurrentUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Notification endpoints (mirrors {@code notification.routes.ts} + {@code notification.controller.ts}). */
@RestController
@RequestMapping("/api/v1/notifications")
@Validated
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationPublic>>> listNotifications(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) Boolean unreadOnly,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        NotificationListResult result = notificationService.listNotifications(current.userId(), p, l, unreadOnly);
        PageMeta meta = PageMeta.of(p, l, result.total());
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", meta.page());
        metaMap.put("limit", meta.limit());
        metaMap.put("total", meta.total());
        metaMap.put("totalPages", meta.totalPages());
        metaMap.put("hasNextPage", meta.hasNextPage());
        metaMap.put("hasPreviousPage", meta.hasPreviousPage());
        return ResponseEntity.ok(ApiResponse.success(
                result.notifications(), "Notifications retrieved successfully", metaMap));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> unreadCount(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        long count = notificationService.unreadNotificationCount(current.userId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", count), "Unread count retrieved"));
    }

    @PostMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllRead(@AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        notificationService.markAllNotificationsRead(current.userId());
        return ResponseEntity.ok(ApiResponse.success(null, "All notifications marked as read"));
    }

    @PostMapping("/{notificationId}/read")
    public ResponseEntity<ApiResponse<Void>> markRead(
            @PathVariable String notificationId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        notificationService.markNotificationRead(current.userId(), notificationId);
        return ResponseEntity.ok(ApiResponse.success(null, "Notification marked as read"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
