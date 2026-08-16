package com.ecommerce.backend.modules.coupon;

import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.coupon.CouponDtos.CouponInput;
import com.ecommerce.backend.modules.coupon.CouponDtos.CouponUpdate;
import com.ecommerce.backend.modules.coupon.CouponDtos.ValidateCouponRequest.ValidateItem;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

/** Coupon business logic (mirrors {@code coupon.service.ts}). */
@Service
public class CouponService {

    private static final Instant DEFAULT_VALID_FROM = Instant.ofEpochMilli(0);
    private static final Instant DEFAULT_VALID_UNTIL = Instant.parse("2099-12-31T23:59:59Z");

    private final CouponRepository couponRepository;
    private final CouponUsageRepository couponUsageRepository;
    private final AuditService auditService;

    public CouponService(
            CouponRepository couponRepository,
            CouponUsageRepository couponUsageRepository,
            AuditService auditService) {
        this.couponRepository = couponRepository;
        this.couponUsageRepository = couponUsageRepository;
        this.auditService = auditService;
    }

    public record CouponPublic(
            String id,
            String code,
            String type,
            long value,
            String scope,
            List<String> productIds,
            List<String> categoryIds,
            long minOrderValueCents,
            Long maxDiscountCents,
            Long maxUses,
            int perUserLimit,
            long usedCount,
            String validFrom,
            String validUntil,
            boolean isActive) {}

    // -------------------------------------------------------------- Management

    public CouponPublic createCoupon(CouponInput input, String actorId) {
        Coupon coupon = new Coupon();
        coupon.code = input.code().trim().toUpperCase(Locale.ROOT);
        coupon.type = input.type();
        coupon.value = input.value();
        coupon.scope = input.scope() == null ? Coupon.SCOPE_ALL : input.scope();
        coupon.productIds = stringsOrEmpty(input.productIds());
        coupon.categoryIds = stringsOrEmpty(input.categoryIds());
        coupon.minOrderValueCents = input.minOrderValueCents() == null ? 0 : input.minOrderValueCents();
        coupon.maxDiscountCents = input.maxDiscountCents();
        coupon.maxUses = input.maxUses();
        coupon.perUserLimit = input.perUserLimit() == null ? 1 : input.perUserLimit();
        coupon.usedCount = 0;
        coupon.validFrom = input.validFrom() == null || input.validFrom().isBlank()
                ? DEFAULT_VALID_FROM
                : Instant.parse(input.validFrom());
        coupon.validUntil = input.validUntil() == null || input.validUntil().isBlank()
                ? DEFAULT_VALID_UNTIL
                : Instant.parse(input.validUntil());
        coupon.isActive = input.isActive() == null ? true : input.isActive();
        coupon.createdAt = Instant.now();
        coupon.updatedAt = coupon.createdAt;

        Coupon saved = couponRepository.save(coupon);
        auditService.log("coupon.created", actorId, null,
                java.util.Map.of("couponId", saved.id, "code", saved.code));
        return toPublic(saved);
    }

    public CouponPublic updateCoupon(String couponId, CouponUpdate input, String actorId) {
        Coupon coupon = requireCoupon(couponId);
        if (input.code() != null) {
            coupon.code = input.code().trim().toUpperCase(Locale.ROOT);
        }
        if (input.type() != null) {
            coupon.type = input.type();
        }
        if (input.value() != null) {
            coupon.value = input.value();
        }
        if (input.scope() != null) {
            coupon.scope = input.scope();
        }
        if (input.productIds() != null) {
            coupon.productIds = stringsOrEmpty(input.productIds());
        }
        if (input.categoryIds() != null) {
            coupon.categoryIds = stringsOrEmpty(input.categoryIds());
        }
        if (input.minOrderValueCents() != null) {
            coupon.minOrderValueCents = input.minOrderValueCents();
        }
        if (input.maxDiscountCents() != null) {
            coupon.maxDiscountCents = input.maxDiscountCents();
        }
        if (input.maxUses() != null) {
            coupon.maxUses = input.maxUses();
        }
        if (input.perUserLimit() != null) {
            coupon.perUserLimit = input.perUserLimit();
        }
        if (input.validFrom() != null) {
            coupon.validFrom = Instant.parse(input.validFrom());
        }
        if (input.validUntil() != null) {
            coupon.validUntil = Instant.parse(input.validUntil());
        }
        if (input.isActive() != null) {
            coupon.isActive = input.isActive();
        }
        coupon.updatedAt = Instant.now();
        Coupon saved = couponRepository.save(coupon);
        auditService.log("coupon.updated", actorId, null, java.util.Map.of("couponId", saved.id));
        return toPublic(saved);
    }

    public void deleteCoupon(String couponId, String actorId) {
        if (!couponRepository.existsById(couponId)) {
            throw ApiException.notFound("Coupon not found");
        }
        couponRepository.deleteById(couponId);
        auditService.log("coupon.deleted", actorId, null, java.util.Map.of("couponId", couponId));
    }

    public record CouponListResult(List<CouponPublic> coupons, long total) {}

    public CouponListResult listCoupons(int page, int limit, Boolean isActive) {
        long total = couponRepository.count();
        List<Coupon> coupons = couponRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream()
                .filter(c -> isActive == null || c.isActive == isActive)
                .skip((long) (page - 1) * limit)
                .limit(limit)
                .toList();
        return new CouponListResult(coupons.stream().map(this::toPublic).toList(), total);
    }

    // -------------------------------------------------------------- Discount

    public record DiscountCartItem(String productId, String category, long unitPriceCents, int quantity) {}

    public record DiscountResult(String code, String couponId, long discountCents) {}

    /** Pure computation, no DB writes; the order module re-checks limits before committing usage. */
    public DiscountResult computeDiscount(String couponCode, String userId, List<DiscountCartItem> items) {
        Coupon coupon = couponRepository
                .findByCode(couponCode.trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> ApiException.badRequest("Invalid coupon code", "INVALID_COUPON"));
        if (!coupon.isActive) {
            throw ApiException.badRequest("This coupon is no longer active", "COUPON_INACTIVE");
        }

        Instant now = Instant.now();
        if (coupon.validFrom != null && coupon.validFrom.isAfter(now)) {
            throw ApiException.badRequest("This coupon is not yet valid", "COUPON_NOT_STARTED");
        }
        if (coupon.validUntil != null && coupon.validUntil.isBefore(now)) {
            throw ApiException.badRequest("This coupon has expired", "COUPON_EXPIRED");
        }

        long subtotal = items.stream().mapToLong(i -> i.unitPriceCents() * i.quantity()).sum();
        if (subtotal < coupon.minOrderValueCents) {
            throw ApiException.badRequest(
                    "Minimum order value for this coupon is "
                            + String.format("%.2f", coupon.minOrderValueCents / 100.0),
                    "COUPON_MIN_ORDER_NOT_MET");
        }

        if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
            throw ApiException.badRequest(
                    "This coupon has reached its usage limit", "COUPON_EXHAUSTED");
        }

        long userUsage = couponUsageRepository.countByCouponIdAndUserId(coupon.id, userId);
        if (userUsage >= coupon.perUserLimit) {
            throw ApiException.badRequest(
                    "You have already used this coupon", "COUPON_USER_LIMIT_REACHED");
        }

        long eligibleSubtotalCents = 0;
        for (DiscountCartItem item : items) {
            long lineTotal = item.unitPriceCents() * item.quantity();
            if (Coupon.SCOPE_ALL.equals(coupon.scope)) {
                eligibleSubtotalCents += lineTotal;
            } else if (Coupon.SCOPE_CATEGORY.equals(coupon.scope) && item.category() != null) {
                if (coupon.categoryIds.contains(item.category())) {
                    eligibleSubtotalCents += lineTotal;
                }
            } else if (Coupon.SCOPE_PRODUCT.equals(coupon.scope)) {
                if (coupon.productIds.contains(item.productId())) {
                    eligibleSubtotalCents += lineTotal;
                }
            }
        }

        if (eligibleSubtotalCents <= 0) {
            throw ApiException.badRequest(
                    "This coupon does not apply to any item in your cart", "COUPON_NOT_APPLICABLE");
        }

        long discountCents = Coupon.TYPE_PERCENTAGE.equals(coupon.type)
                ? Math.floorDiv(eligibleSubtotalCents * coupon.value, 100)
                : coupon.value;
        if (coupon.maxDiscountCents != null) {
            discountCents = Math.min(discountCents, coupon.maxDiscountCents);
        }
        discountCents = Math.min(discountCents, eligibleSubtotalCents);

        return new DiscountResult(coupon.code, coupon.id, discountCents);
    }

    // -------------------------------------------------------------- Internals

    public Coupon requireCoupon(String couponId) {
        if (!ObjectId.isValid(couponId)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return couponRepository
                .findById(couponId)
                .orElseThrow(() -> ApiException.notFound("Coupon not found"));
    }

    private CouponPublic toPublic(Coupon c) {
        return new CouponPublic(
                c.id,
                c.code,
                c.type,
                c.value,
                c.scope,
                c.productIds == null ? List.of() : c.productIds,
                c.categoryIds == null ? List.of() : c.categoryIds,
                c.minOrderValueCents,
                c.maxDiscountCents,
                c.maxUses,
                c.perUserLimit,
                c.usedCount,
                iso(c.validFrom),
                iso(c.validUntil),
                c.isActive);
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }

    private static List<String> stringsOrEmpty(List<String> values) {
        return values == null ? new ArrayList<>() : values;
    }

    public PageMeta meta(int page, int limit, long total) {
        return PageMeta.of(page, limit, total);
    }

    public record ValidateCartItem(String productId, String category) {}
}
