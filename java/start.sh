#!/usr/bin/env bash
set -euo pipefail

# In-memory demo mode: when USE_IN_MEMORY_DB=true and no external DATABASE_URL
# is provided, start a bundled MongoDB replica set inside this container so the
# app runs without any external database (mirrors the old TypeScript demo that
# used an in-memory Mongo store on Render).
if [ "${USE_IN_MEMORY_DB:-false}" = "true" ] && [ -z "${DATABASE_URL:-}" ]; then
    echo "==> In-memory mode: starting bundled MongoDB replica set (rs0) ..."
    mkdir -p /data/db
    mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017 \
        --replSet rs0 --logpath /data/db/mongod.log --fork

    for _ in $(seq 1 60); do
        if mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    if ! mongosh --quiet --eval "db.adminCommand('replSetGetStatus').ok" 2>/dev/null | grep -q '^1$'; then
        echo "==> Initialising replica set ..."
        mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})" >/dev/null
    fi

    for _ in $(seq 1 60); do
        if mongosh --quiet --eval "db.adminCommand('hello').isWritablePrimary" 2>/dev/null | grep -q 'true'; then
            break
        fi
        sleep 1
    done

    export DATABASE_URL="mongodb://127.0.0.1:27017/ecommerce?replicaSet=rs0&retryWrites=true"
    echo "==> In-memory MongoDB ready at $DATABASE_URL"
fi

exec java -jar app.jar
