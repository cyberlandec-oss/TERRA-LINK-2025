# ADR-0005 — Autenticación inicial

Estado: PROPUESTO · 2026-10-09.

## Contexto

S1 pide identidad compatible con OIDC/OAuth2. No hay proveedor elegido (Keycloak, Cognito, Entra, Auth0…) ni acuerdo de coste o SSO. P0-001 necesita un usuario autenticado para probar membresía y aislamiento.

## Decisión propuesta

- Fase actual: email + contraseña con argon2id (`users.password_hash`), JWT HS256 de corta vida (`JWT_TTL_SECONDS`, por defecto 3600) y secreto ≥32 caracteres en `JWT_SECRET`.
- El estado del usuario se consulta en cada solicitud: una baja corta el acceso aunque el token no haya caducado (probado).
- El login usa un mensaje uniforme y audita los fallos de usuarios existentes. No hay rate limit todavía (pendiente).
- La web guarda el token en `sessionStorage` (limitación: está expuesto si hay XSS). Al adoptar OIDC, pasar a cookie httpOnly + SameSite con protección CSRF.
- `users.external_subject` se añadirá al integrar OIDC. El dominio usa `users.id` y no depende del proveedor.

## Pendiente para aceptar

Elegir proveedor OIDC (P1-015), implementar rate limit, revocación y refresh, y definir la política de contraseñas e invitaciones (P0-002).
