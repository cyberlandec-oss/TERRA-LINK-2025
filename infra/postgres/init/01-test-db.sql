-- Base aislada para pruebas de integración (se recrea su esquema en cada corrida).
CREATE DATABASE terra_link_test;
\connect terra_link_test
CREATE EXTENSION IF NOT EXISTS postgis;
\connect terra_link
CREATE EXTENSION IF NOT EXISTS postgis;
