package com.ecommerce.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.integrations.email.EmailService;
import com.ecommerce.backend.modules.payment.MockPaymentProvider;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * End-to-end tests for the checkout pipeline (catalog → cart → order → payment
 * → webhook → refund) plus the review, wishlist and user-address modules, all
 * against a real MongoDB. Skips itself when no {@code MONGO_URI} is set, like
 * {@link AuthIntegrationTest}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CommerceFlowIntegrationTest {

    static final String MONGO_URI = resolveMongoUri();

    private static String resolveMongoUri() {
        String uri = System.getProperty("mongo.uri");
        if (uri == null || uri.isBlank()) {
            uri = System.getenv("MONGO_URI");
        }
        return uri != null && !uri.isBlank() ? uri : null;
    }

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry registry) {
        if (MONGO_URI != null) {
            registry.add("spring.data.mongodb.uri", () -> MONGO_URI);
            registry.add("app.database-url", () -> MONGO_URI);
        }
    }

    @BeforeAll
    static void requireMongo() {
        org.junit.jupiter.api.Assumptions.assumeTrue(MONGO_URI != null,
                "MONGO_URI not set; skipping database-backed tests");
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    UserRepository userRepository;

    @Autowired
    MockPaymentProvider mockProvider;

    @MockBean
    EmailService emailService;

    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(emailService);
    }

    // ------------------------------------------------------------------ Helpers

    private AuthSession register(String name, String email, String password) throws Exception {
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("name", name).put("email", email).put("password", password))))
                .andExpect(status().isCreated());
        return login(email, password);
    }

    private AuthSession login(String email, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("email", email).put("password", password))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
        return new AuthSession(data.path("accessToken").asText(), data.path("refreshToken").asText());
    }

    private AuthSession makeAdmin(String email, String password) throws Exception {
        AuthSession customer = register("Admin User", email, password);
        User user = userRepository.findByEmail(email).orElseThrow();
        user.roles = List.of(Role.ADMIN);
        userRepository.save(user);
        return login(email, password);
    }

    private String createProduct(AuthSession admin, String name, String sku) throws Exception {
        ObjectNode variant = mapper.createObjectNode();
        variant.put("sku", sku);
        variant.put("priceCents", 2499);
        variant.put("quantity", 100);
        variant.put("lowStockThreshold", 5);
        variant.put("isActive", true);

        ObjectNode body = mapper.createObjectNode();
        body.put("name", name);
        body.put("status", "published");
        body.put("isActive", true);
        body.putArray("variants").add(variant);

        MvcResult result = mvc.perform(post("/api/v1/products")
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.variants[0].id").isNotEmpty())
                .andReturn();
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").toString();
    }

    private String addAddress(AuthSession user) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("label", "Home");
        body.put("recipient", "Ada Lovelace");
        body.put("phone", "+15551234567");
        body.put("line1", "1 Analytical Engine Way");
        body.put("city", "London");
        body.put("state", "Greater London");
        body.put("postalCode", "SW1A 1AA");
        body.put("country", "GB");
        MvcResult result = mvc.perform(post("/api/v1/users/me/addresses")
                        .header("Authorization", bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("id").asText();
    }

    private static String bearer(AuthSession session) {
        return "Bearer " + session.accessToken();
    }

    record AuthSession(String accessToken, String refreshToken) {}

    // ------------------------------------------------------------------- Tests

    @Test
    void orderCheckoutWebhookAndRefundFlow() throws Exception {
        String runId = Long.toString(System.nanoTime());
        String customerEmail = "flow-customer-" + runId + "@example.com";
        String adminEmail = "flow-admin-" + runId + "@example.com";
        AuthSession customer = register("Flow Customer", customerEmail, "StrongPass1");
        AuthSession admin = makeAdmin(adminEmail, "StrongPass1");

        String productJson = createProduct(admin, "Test Widget " + runId, "SKU-FLOW-" + runId);
        JsonNode product = mapper.readTree(productJson);
        String productId = product.path("id").asText();
        String variantId = product.path("variants").get(0).path("id").asText();

        // Cart
        ObjectNode addItem = mapper.createObjectNode();
        addItem.put("productId", productId);
        addItem.put("variantId", variantId);
        addItem.put("quantity", 2);
        mvc.perform(post("/api/v1/cart")
                        .header("Authorization", bearer(customer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(addItem)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.itemCount").value(2))
                .andExpect(jsonPath("$.data.subtotalCents").value(4998));

        // Address + order
        String addressId = addAddress(customer);
        ObjectNode createOrder = mapper.createObjectNode();
        createOrder.put("shippingAddressId", addressId);
        MvcResult orderResult = mvc.perform(post("/api/v1/orders")
                        .header("Authorization", bearer(customer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(createOrder)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("pending"))
                .andExpect(jsonPath("$.data.totalCents").value(4998))
                .andExpect(jsonPath("$.data.orderNumber").isNotEmpty())
                .andReturn();
        JsonNode order = mapper.readTree(
                        orderResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data");
        String orderId = order.path("id").asText();

        // Checkout (mock provider auto-approves in the test profile)
        ObjectNode checkoutBody = mapper.createObjectNode();
        checkoutBody.put("orderId", orderId);
        MvcResult checkoutResult = mvc.perform(post("/api/v1/payments/checkout")
                        .header("Authorization", bearer(customer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(checkoutBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.payment.status").value("succeeded"))
                .andExpect(jsonPath("$.data.order.status").value("confirmed"))
                .andReturn();
        JsonNode payment = mapper.readTree(
                        checkoutResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("payment");
        String providerReference = payment.path("providerReference").asText();
        long amountCents = payment.path("amountCents").asLong();

        mvc.perform(get("/api/v1/orders/" + orderId).header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("confirmed"))
                .andExpect(jsonPath("$.data.paymentStatus").value("paid"));

        // Signed webhook round-trip (fresh webhook id) then replay (duplicate)
        MockPaymentProvider.SignedWebhook signed =
                mockProvider.buildSignedWebhook("payment.succeeded", providerReference, amountCents, null);
        mvc.perform(post("/api/v1/payments/webhook/mock")
                        .header("x-webhook-signature", signed.signature())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signed.body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acknowledged").value(true))
                .andExpect(jsonPath("$.handled").value(true))
                .andExpect(jsonPath("$.duplicate").value(false));

        mvc.perform(post("/api/v1/payments/webhook/mock")
                        .header("x-webhook-signature", signed.signature())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signed.body()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handled").value(false))
                .andExpect(jsonPath("$.duplicate").value(true));

        // Tampered signature is rejected
        mvc.perform(post("/api/v1/payments/webhook/mock")
                        .header("x-webhook-signature", "deadbeef")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signed.body()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_WEBHOOK_SIGNATURE"));

        // Full refund by admin → order refunded
        mvc.perform(post("/api/v1/payments/" + orderId + "/refund")
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("amountCents", (int) amountCents).put("reason", "Test refund"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("refunded"))
                .andExpect(jsonPath("$.data.refundedCents").value(amountCents));

        mvc.perform(get("/api/v1/orders/" + orderId).header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("refunded"));
    }

    @Test
    void reviewLifecycle() throws Exception {
        String runId = Long.toString(System.nanoTime());
        String customerEmail = "review-customer-" + runId + "@example.com";
        String adminEmail = "review-admin-" + runId + "@example.com";
        AuthSession customer = register("Review Customer", customerEmail, "StrongPass1");
        AuthSession admin = makeAdmin(adminEmail, "StrongPass1");

        JsonNode product = mapper.readTree(createProduct(
                admin, "Reviewable Widget " + runId, "SKU-REV-" + runId));
        String productId = product.path("id").asText();

        ObjectNode body = mapper.createObjectNode();
        body.put("rating", 5);
        body.put("title", "Excellent");
        body.put("body", "Works perfectly and shipped fast.");
        MvcResult created = mvc.perform(post("/api/v1/products/" + productId + "/reviews")
                        .header("Authorization", bearer(customer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("pending"))
                .andReturn();
        String reviewId = mapper.readTree(created.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("id").asText();

        // Pending reviews stay out of the public listing
        mvc.perform(get("/api/v1/products/" + productId + "/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        // Admin approves → visible + reflected in the rating summary
        mvc.perform(patch("/api/v1/admin/reviews/" + reviewId + "/moderate")
                        .header("Authorization", bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode().put("action", "approve"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("approved"));

        mvc.perform(get("/api/v1/products/" + productId + "/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].rating").value(5));

        mvc.perform(get("/api/v1/products/" + productId + "/reviews/rating"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(1))
                .andExpect(jsonPath("$.data.average").value(5.0));
    }

    @Test
    void wishlistAddRemoveAndClear() throws Exception {
        String runId = Long.toString(System.nanoTime());
        String adminEmail = "wish-admin-" + runId + "@example.com";
        AuthSession customer = register("Wishlist Customer", "wish-customer-" + runId + "@example.com", "StrongPass1");
        AuthSession admin = makeAdmin(adminEmail, "StrongPass1");
        String productId = mapper.readTree(createProduct(
                admin, "Wishful Widget " + runId, "SKU-WISH-" + runId)).path("id").asText();

        mvc.perform(post("/api/v1/wishlist/" + productId).header("Authorization", bearer(customer)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data[0].productId").value(productId))
                .andExpect(jsonPath("$.data[0].product.name").isNotEmpty());

        mvc.perform(get("/api/v1/wishlist").header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));

        mvc.perform(delete("/api/v1/wishlist/" + productId).header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());

        mvc.perform(get("/api/v1/wishlist").header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void userAddressCrudAndAdminUserListing() throws Exception {
        String runId = Long.toString(System.nanoTime());
        String adminEmail = "addr-admin-" + runId + "@example.com";
        AuthSession customer = register("Address Customer", "addr-customer-" + runId + "@example.com", "StrongPass1");
        AuthSession admin = makeAdmin(adminEmail, "StrongPass1");

        String firstId = addAddress(customer);
        String secondId = addAddress(customer);

        mvc.perform(get("/api/v1/users/me/addresses").header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));

        mvc.perform(post("/api/v1/users/me/addresses/" + secondId + "/default")
                        .header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDefault").value(true));

        ObjectNode update = mapper.createObjectNode();
        update.put("city", "Cambridge");
        mvc.perform(patch("/api/v1/users/me/addresses/" + firstId)
                        .header("Authorization", bearer(customer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.city").value("Cambridge"));

        // Admin can list and search users
        mvc.perform(get("/api/v1/users").header("Authorization", bearer(admin))
                        .param("search", "addr-customer-" + runId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].email").value("addr-customer-" + runId + "@example.com"))
                .andExpect(jsonPath("$.meta.total").value(1));

        // A customer cannot list users
        mvc.perform(get("/api/v1/users").header("Authorization", bearer(customer)))
                .andExpect(status().isForbidden());

        mvc.perform(delete("/api/v1/users/me/addresses/" + firstId)
                        .header("Authorization", bearer(customer)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/users/me/addresses").header("Authorization", bearer(customer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));
    }
}
