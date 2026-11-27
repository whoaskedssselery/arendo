#!/bin/sh
# Выполняется образом postgres один раз, на пустом томе.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

run() { psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$@"; }

run --single-transaction -f /sql/01_schema.sql -f /sql/02_logic.sql -f /sql/03_seed.sql

# Приложение работает под ролью без прав на изменение схемы.
run -v app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE arendo_app LOGIN PASSWORD :'app_password';
GRANT USAGE ON SCHEMA public TO arendo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arendo_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO arendo_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arendo_app;
SQL
