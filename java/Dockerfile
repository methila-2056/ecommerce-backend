# syntax=docker/dockerfile:1

# ---- Build ------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---- Runtime ----------------------------------------------------------------
FROM eclipse-temurin:21-jre AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user (no root inside the container).
RUN useradd --create-home --uid 10001 appuser

COPY --chown=appuser:appuser --from=build /app/target/ecommerce-backend-1.0.0.jar ./app.jar

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/${PORT:-3001}'

CMD ["java", "-jar", "app.jar"]
