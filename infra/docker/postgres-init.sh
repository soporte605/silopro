#!/bin/sh
# Crea el rol de aplicación SIN superusuario ni BYPASSRLS y su base de datos.
# El superusuario (POSTGRES_USER) queda solo para administración: si la API
# se conectara con él, PostgreSQL ignoraría las políticas RLS.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE silopro LOGIN PASSWORD '${SILOPRO_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE;
CREATE DATABASE silopro OWNER silopro;
SQL
