# 🧪 PushMe Backend Testing Guide

## ✅ Backend Status

All critical fixes have been applied:
- ✅ JWT token creation fixed (no exp conflict)
- ✅ Database schema errors fixed (removed updated_at)
- ✅ TypeScript compilation errors fixed
- ✅ Authentication flow complete
- ✅ Donation processing ready
- ✅ Overlay polling endpoint ready

---

## 🚀 Quick Start

1. **Start Backend:**
   ```bash
   cd pushmebackend
   npm run dev
   ```

2. **Verify Backend is Running:**
   - Should see: `🚀 PushMe Backend server running on port 5001`
   - Health check: `curl http://localhost:5001/`

---

## 📋 Complete Testing Flow

### **Phase 1: Authentication Flow**

#### Step 1: Request Nonce
**Endpoint:** `POST /auth/nonce`

**Request:**
```bash
curl -X POST http://localhost:5001/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"wallet": "YOUR_WALLET_ADDRESS"}'
```

**Expected Response:**
```json
{
  "nonce": "abc123xyz789",
  "timestamp": 1700419200000,
  "message": "Sign this message to authenticate with PushMe.\n\nWallet: YOUR_WALLET_ADDRESS\nNonce: abc123xyz789\nTimestamp: 1700419200000"
}
```

**Frontend Action:**
- Store `nonce` and `timestamp`
- Show Phantom wallet prompt
- Ask user to sign the `message`

---

#### Step 2: Verify Signature & Get JWT
**Endpoint:** `POST /auth/verify`

**Request:**
```bash
curl -X POST http://localhost:5001/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "YOUR_WALLET_ADDRESS",
    "signature": "SIGNED_MESSAGE_FROM_PHANTOM",
    "nonce": "abc123xyz789",
    "timestamp": 1700419200000
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "wallet": "YOUR_WALLET_ADDRESS",
    "username": null
  }
}
```

**Frontend Action:**
- ✅ Store `token` in localStorage/sessionStorage
- ✅ Store `user` object in state
- ✅ Check if `user.username === null`
  - If null → Show username prompt modal
  - If not null → Display username in top right

---

#### Step 3: Set Username (if null)
**Endpoint:** `PATCH /auth/me`

**Request:**
```bash
curl -X PATCH http://localhost:5001/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "myusername"}'
```

**Expected Response:**
```json
{
  "user": {
    "id": "uuid-here",
    "wallet": "YOUR_WALLET_ADDRESS",
    "username": "myusername"
  }
}
```

**Frontend Action:**
- ✅ Update user state with new username
- ✅ Display username in top right corner
- ✅ Make username clickable → Show dropdown with "Sign Out" option

---

#### Step 4: Get Current User (on page load)
**Endpoint:** `GET /auth/me`

**Request:**
```bash
curl http://localhost:5001/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "user": {
    "id": "uuid-here",
    "wallet": "YOUR_WALLET_ADDRESS",
    "username": "myusername"
  }
}
```

**Frontend Action:**
- ✅ On page load, check localStorage for token
- ✅ If token exists, call `/auth/me` to verify
- ✅ If valid → Restore user state
- ✅ If invalid → Clear token and show "Sign In" button

---

### **Phase 2: Donation Flow**

#### Step 1: Submit Text Donation
**Endpoint:** `POST /donate`

**Request:**
```bash
curl -X POST http://localhost:5001/donate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "content": "Hello from my donation!",
    "username": "myusername",
    "wallet": "YOUR_WALLET_ADDRESS",
    "txHash": "VALID_SOLANA_TRANSACTION_HASH",
    "metadata": {}
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "donation": {
    "type": "text",
    "text": "Hello from my donation!",
    "mediaUrl": null,
    "username": "myusername",
    "price": 0.01
  }
}
```

**Frontend Action:**
- ✅ Show success message
- ✅ Trigger overlay refresh (poll `/overlay/recent`)

---

#### Step 2: Submit Image Donation
**Request:**
```bash
curl -X POST http://localhost:5001/donate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "content": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "username": "myusername",
    "wallet": "YOUR_WALLET_ADDRESS",
    "txHash": "VALID_SOLANA_TRANSACTION_HASH"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "donation": {
    "type": "image",
    "text": null,
    "mediaUrl": "https://supabase.co/storage/v1/object/public/pushme-media/images/uuid.jpg",
    "username": "myusername",
    "price": 0.03
  }
}
```

---

### **Phase 3: Overlay Polling**

#### Get Recent Donations
**Endpoint:** `GET /overlay/recent?limit=10`

**Request:**
```bash
curl "http://localhost:5001/overlay/recent?limit=10"
```

**Expected Response:**
```json
{
  "donations": [
    {
      "id": "uuid",
      "wallet": "YOUR_WALLET_ADDRESS",
      "username": "myusername",
      "type": "text",
      "media_url": null,
      "text": "Hello from my donation!",
      "price": 0.01,
      "tx_hash": "VALID_SOLANA_TRANSACTION_HASH",
      "created_at": "2025-11-20T09:00:00Z"
    }
  ]
}
```

**Frontend Action:**
- ✅ Poll this endpoint every 2-5 seconds
- ✅ Compare with previous donations (by ID)
- ✅ Display new donations in overlay
- ✅ Animate donations appearing

---

## 🎯 Frontend Integration Checklist

### Authentication
- [ ] Store JWT token in localStorage
- [ ] Store user object in state
- [ ] Check for token on page load
- [ ] Show username prompt if `user.username === null`
- [ ] Display username in top right
- [ ] Make username clickable → Show "Sign Out" dropdown
- [ ] Clear token on sign out

### Donations
- [ ] Connect Phantom wallet
- [ ] Request nonce from backend
- [ ] Sign message with Phantom
- [ ] Verify signature with backend
- [ ] Handle donation submission
- [ ] Show success/error messages

### Overlay
- [ ] Poll `/overlay/recent` every 2-5 seconds
- [ ] Track displayed donation IDs
- [ ] Show new donations with animation
- [ ] Handle different donation types (text, image, gif, audio, video)

---

## 🔍 Debugging

### Check Backend Logs
All endpoints log with prefixes:
- `[AUTH]` - Authentication endpoints
- `[DONATE]` - Donation endpoints
- `[OVERLAY]` - Overlay endpoints
- `[MEDIA]` - Media processing

### Common Issues

1. **"Invalid signature"**
   - Check nonce matches between `/nonce` and `/verify`
   - Verify message signing in Phantom

2. **"Payment verification failed"**
   - Ensure transaction hash is valid
   - Check transaction amount meets minimum (0.01 SOL for text)

3. **"User not found"**
   - Token might be expired
   - Try re-authenticating

4. **"Media processing failed"**
   - Check Supabase Storage bucket exists
   - Verify file size < 20MB
   - Check media type is supported

---

## 📊 Expected Server Logs

### Successful Authentication:
```
[AUTH] POST /auth/nonce - wallet: ...
[AUTH] Nonce generated for wallet: ...
[AUTH] POST /auth/verify
[AUTH] Verifying signature for wallet: ...
[AUTH] New user created: uuid-here
[AUTH] User authenticated successfully: ...
```

### Successful Donation:
```
[DONATE] POST /donate - type: text, wallet: ..., txHash: ...
[DONATE] Verifying payment for txHash: ...
[DONATE] Payment verified successfully
[DONATE] Text donation: Hello from my donation!...
[DONATE] Saving donation to database
[DONATE] Donation saved successfully with ID: ...
[DONATE] Donation processed successfully: text from ...
```

---

## ✅ Testing Checklist

- [ ] Backend starts without errors
- [ ] `/auth/nonce` returns nonce
- [ ] `/auth/verify` creates user and returns token
- [ ] `/auth/me` returns user info
- [ ] `PATCH /auth/me` updates username
- [ ] `/donate` accepts text donations
- [ ] `/donate` accepts image donations
- [ ] `/overlay/recent` returns donations
- [ ] Donations appear in database
- [ ] Media uploads to Supabase Storage

---

## 🎉 Ready to Test!

Your backend is now fully functional. Start testing the frontend-backend integration!

