# TrueSpace Status

Public health dashboard for Bill and Steve servers and their services.

**Live page:** https://donth8.github.io/status/

The static page calls open `/status` endpoints on each server (no auth, CORS enabled):

- Bill: `https://truespace-tunnel.fly.dev:8080/status`
- Steve: `https://truespace-tunnel.fly.dev:8090/status`

Server-side status endpoints are maintained in the [infrastructure repo](https://github.com/donth8/true-space-infrastructure).
