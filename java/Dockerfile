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

# Bundle MongoDB + mongosh so the app can run in in-memory demo mode
# (USE_IN_MEMORY_DB=true without an external DATABASE_URL). Images are large
# (~85 MB each) but only downloaded once at build time.
RUN curl -fsSLo /tmp/mongo.tgz https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-7.0.14.tgz \
    && curl -fsSLo /tmp/mongosh.tgz https://downloads.mongodb.com/compass/mongosh-2.3.8-linux-x64.tgz \
    && tar -xzf /tmp/mongo.tgz -C /tmp \
    && tar -xzf /tmp/mongosh.tgz -C /tmp \
    && cp /tmp/mongodb-linux-x86_64-ubuntu2204-7.0.14/bin/mongod /usr/local/bin/ \
    && cp /tmp/mongosh-2.3.8-linux-x64/bin/mongosh /usr/local/bin/ \
    && rm -rf /tmp/mongo.tgz /tmp/mongosh.tgz /tmp/mongodb-linux-* /tmp/mongosh-2.3.8-linux-* \
    && mkdir -p /data/db \
    && chown -R appuser:appuser /data/db

COPY --chown=appuser:appuser --from=build /app/target/ecommerce-backend-1.0.0.jar ./app.jar
COPY --chown=appuser:appuser start.sh ./start.sh
RUN chmod +x ./start.sh

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/${PORT:-3001}'

ENTRYPOINT ["/app/start.sh"]
