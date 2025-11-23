# PushMe Backend

Production-ready backend for PushMe donation and overlay system.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your configuration:
```bash
cp .env.example .env
```

3. Build the project:
```bash
npm run build
```

4. Start with PM2:
```bash
pm2 start ecosystem.config.js
```

Or run in development:
```bash
npm run dev
```

## Environment Variables

See `.env.example` for all required variables.

## Features

- Phantom wallet authentication (JWT)
- SOL-based donation processing
- Media handling (text, gif, image, audio, video)
- Real-time overlay WebSocket events
- Supabase integration
- BullMQ job queues
- Stream-safe content filtering

## API Endpoints

- `POST /auth/nonce` - Get authentication nonce
- `POST /auth/verify` - Verify signature and get JWT
- `GET /auth/me` - Get current user
- `POST /donate` - Submit donation
- `GET /overlay/recent` - Get recent donations
- `GET /overlay/health` - Health check

## WebSocket

Connect to `ws://your-server:5000/overlay` with authentication key.

