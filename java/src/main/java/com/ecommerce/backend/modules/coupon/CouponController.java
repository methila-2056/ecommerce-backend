package com.ecommerce.backend.modules.coupon;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.coupon.CouponDtos.CouponInput;
import com.ecommerce.backend.modules.coupon.CouponDtos.CouponUpdate;
import com.ecommerce.backend.modules.coupon.CouponDtos.ValidateCouponRequest;
import com.ecommerce.backend.modules.coupon.CouponService.CouponListResult;
import com.ecommerce.backend.modules.coupon.CouponService.CouponPublic;
import com.ecommerce.backend.modules.coupon.CouponService.DiscountCartItem;
import com.ecommerce.backend.modules.coupon.CouponService.DiscountResult;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Coupon endpoints (mirrors {@code coupon.routes.ts} + {@code coupon.controller.ts}). */
@RestController
@RequestMapping("/api/v1/coupons")
@Validated
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<List<CouponPublic>>> listCoupons(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) Boolean isActive) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        CouponListResult result = couponService.listCoupons(p, l, isActive);
        PageMeta meta = PageMeta.of(p, l, result.total());
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", meta.page());
        metaMap.put("limit", meta.limit());
        metaMap.put("total", meta.total());
        metaMap.put("totalPages", meta.totalPages());
        metaMap.put("hasNextPage", meta.hasNextPage());
        metaMap.put("hasPreviousPage", meta.hasPreviousPage());
        return ResponseEntity.ok(
                ApiResponse.success(result.coupons(), "Coupons retrieved successfully", metaMap));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CouponPublic>> createCoupon(
            @Valid @RequestBody CouponInput input, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CouponPublic coupon = couponService.createCoupon(input, current.userId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(coupon, "Coupon created successfully"));
    }

    @PatchMapping("/{couponId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<CouponPublic>> updateCoupon(
            @PathVariable String couponId,
            @Valid @RequestBody CouponUpdate input,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CouponPublic coupon = couponService.updateCoupon(couponId, input, current.userId());
        return ResponseEntity.ok(ApiResponse.success(coupon, "Coupon updated successfully"));
    }

    @DeleteMapping("/{couponId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteCoupon(
            @PathVariable String couponId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        couponService.deleteCoupon(couponId, current.userId());
        return ResponseEntity.ok(ApiResponse.success(null, "Coupon deleted successfully"));
    }

    @PostMapping("/validate/{code}")
    public ResponseEntity<ApiResponse<DiscountResult>> validateCoupon(
            @PathVariable String code,
            @Valid @RequestBody ValidateCouponRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        List<DiscountCartItem> items = new ArrayList<>();
        if (req.items() != null) {
            for (ValidateCouponRequest.ValidateItem item : req.items()) {
                items.add(new DiscountCartItem(
                        item.productId(), item.category(), item.unitPriceCents(), item.quantity()));
            }
        }
        DiscountResult result = couponService.computeDiscount(code, current.userId(), items);
        return ResponseEntity.ok(ApiResponse.success(result, "Coupon is valid"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
