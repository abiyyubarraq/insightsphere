# Production deployment

One machine, four containers, Caddy in front. Everything except Caddy stays on
the internal network.

```
        :443
          |
      [ caddy ]  TLS, automatic certificates
          |
     /----+----  /v1/*        everything else
     |              |
  [ api ]      [ frontend ]
     |
     +--> [ doc-parser ]   OCR, no auth of its own
     +--> [ qdrant ]       vectors, single shared key
     |
     +--> Supabase, OpenAI  (external)
```

The parser and Qdrant are deliberately not published to the host. The parser
will OCR any PDF path it is handed and has no authentication, and Qdrant's is
one shared key, so neither should be reachable from outside the compose network.

## Deploy

On a fresh server with Docker installed, and DNS for your domain already
pointing at it:

```bash
git clone https://github.com/abiyyubarraq/insightsphere.git
cd insightsphere

cp docker/.env.prod.example docker/.env.prod
$EDITOR docker/.env.prod

docker compose -f docker/docker-compose.prod.yaml --env-file docker/.env.prod up -d --build
```

Apply `supabase/migrations/` in order to the Supabase project before first use.

Caddy requests a certificate on first start, which needs ports 80 and 443 open
and the domain resolving to this machine.

## Notes

`VITE_*` values are compiled into the frontend bundle, so changing them requires
`up -d --build` rather than a restart. They are public values; the anon key is
meant to ship to browsers, which is why every table has row level security.

`QDRANT_API_KEY` has no default. Qdrant without it accepts anything that can
reach the port.

Verify access control after deploying:

```bash
API_URL=https://your-domain ./scripts/verify-security.sh docker/.env.prod
```
