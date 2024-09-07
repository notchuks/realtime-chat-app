## Realtime Chat App

This is a realtime chat application built with Socket.io, Next.js 14, Redis and Typescript. The
server is built with fastify and deployed in a docker container. Caddy is used as a load balancer to
dynamically spin up multiple server instances as the site traffic increases.

How to run the project locally:

```bash
cd client
```

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
cd ../server
```

```bash
pnpm install
```

```bash
pnpm dev
```

