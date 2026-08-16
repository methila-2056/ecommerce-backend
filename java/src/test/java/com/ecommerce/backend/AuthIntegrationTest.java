package com.ecommerce.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ecommerce.backend.integrations.email.EmailService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
 * End-to-end auth tests against a real MongoDB.
 *
 * <p>The MongoDB connection comes from the {@code MONGO_URI} environment
 * variable (or the {@code mongo.uri} system property). When neither is set the
 * suite is skipped — CI provides a MongoDB service container, and local runs
 * point {@code MONGO_URI} at any running {@code mongod}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthIntegrationTest {

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
    ObjectMapper objectMapper;

    /** Email delivery is swapped for a mock so tests can read the magic links. */
    @MockBean
    EmailService emailService;

    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void resetMocks() {
        org.mockito.Mockito.reset(emailService);
    }

    record AuthSession(String accessToken, String refreshToken) {}

    private void register(String name, String email, String password) throws Exception {
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("name", name).put("email", email).put("password", password))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.email").value(email));
    }

    private AuthSession login(String email, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("email", email).put("password", password))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
                .andReturn();
        JsonNode data = mapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
        return new AuthSession(data.path("accessToken").asText(), data.path("refreshToken").asText());
    }

    private String lastEmailText() {
        ArgumentCaptor<EmailService.EmailMessage> captor = ArgumentCaptor.forClass(EmailService.EmailMessage.class);
        verify(emailService, org.mockito.Mockito.atLeastOnce()).send(captor.capture());
        List<EmailService.EmailMessage> all = captor.getAllValues();
        return all.get(all.size() - 1).text();
    }

    private String extractQueryToken(String text, String key) {
        return text.replaceFirst(".*\\?" + key + "=([A-Za-z0-9_-]+).*", "$1");
    }

    @Test
    void registerThenLoginAndAccessMe() throws Exception {
        String email = "customer-" + System.nanoTime() + "@example.com";
        register("Ada Lovelace", email, "StrongPass1");
        AuthSession session = login(email, "StrongPass1");

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + session.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(email));
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        String email = "dup-" + System.nanoTime() + "@example.com";
        register("Dup User", email, "StrongPass1");
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("name", "Dup User")
                                .put("email", email.toUpperCase())
                                .put("password", "StrongPass1"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
    }

    @Test
    void weakPasswordIsRejected() throws Exception {
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("name", "Weak Pass")
                                .put("email", "weak-" + System.nanoTime() + "@example.com")
                                .put("password", "short"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errors").isArray());
    }

    @Test
    void verifyEmailMarksAccountVerified() throws Exception {
        String email = "verify-" + System.nanoTime() + "@example.com";
        register("Verify Me", email, "StrongPass1");
        String token = extractQueryToken(lastEmailText(), "token");

        mvc.perform(post("/api/v1/auth/verify-email").param("token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emailVerified").value(true));

        mvc.perform(post("/api/v1/auth/verify-email").param("token", "bogus-token"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void refreshRotatesAndReplayOfOldTokenRevokesFamily() throws Exception {
        String email = "refresh-" + System.nanoTime() + "@example.com";
        register("Refresh Me", email, "StrongPass1");
        AuthSession first = login(email, "StrongPass1");

        MvcResult refreshResult = mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", first.refreshToken()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andReturn();
        String rotated = mapper.readTree(refreshResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("refreshToken").asText();

        // Replaying the already-rotated token is a theft signal: 401 + family burned.
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", first.refreshToken()))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_REVOKED"));

        // The freshly rotated token must also be dead now.
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", rotated))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        String email = "wrongpw-" + System.nanoTime() + "@example.com";
        register("Wrong Pass", email, "StrongPass1");
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("email", email).put("password", "WrongPass1"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void logoutRevokesRefreshSession() throws Exception {
        String email = "logout-" + System.nanoTime() + "@example.com";
        register("Logout Me", email, "StrongPass1");
        AuthSession session = login(email, "StrongPass1");

        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + session.accessToken()))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", session.refreshToken()))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void changePasswordKeepsCurrentSessionButRevokesOthers() throws Exception {
        String email = "cp-" + System.nanoTime() + "@example.com";
        register("Change Pass", email, "StrongPass1");
        AuthSession primary = login(email, "StrongPass1");
        AuthSession otherDevice = login(email, "StrongPass1");

        mvc.perform(post("/api/v1/auth/change-password")
                        .header("Authorization", "Bearer " + primary.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("currentPassword", "StrongPass1")
                                .put("newPassword", "NewStrongPass2"))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", otherDevice.refreshToken()))))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("refreshToken", primary.refreshToken()))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("email", email).put("password", "NewStrongPass2"))))
                .andExpect(status().isOk());
    }

    @Test
    void forgotAndResetPassword() throws Exception {
        String email = "reset-" + System.nanoTime() + "@example.com";
        register("Reset Me", email, "StrongPass1");

        mvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("email", email))))
                .andExpect(status().isAccepted());

        String resetToken = extractQueryToken(lastEmailText(), "token");

        mvc.perform(post("/api/v1/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(mapper.createObjectNode()
                                .put("token", resetToken)
                                .put("newPassword", "FreshPassword3"))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(
                                mapper.createObjectNode().put("email", email).put("password", "FreshPassword3"))))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpointRejectsMissingToken() throws Exception {
        mvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
}
