# P2P File Transfer Application - Specification

## 1. Project Overview

**Project Name:** DropZone
**Type:** Full-stack web application
**Core Functionality:** Peer-to-peer file transfer between two users over the internet using WebRTC, with a Node.js backend acting as signaling server only.
**Target Users:** Anyone needing to quickly transfer files between devices without uploading to a server.

---

## 2. Technical Architecture (Simplified)

### Backend (Node.js)
- **Port:** 3000
- **Dependencies:** `ws` (WebSocket library only)
- **API Endpoints:**
  - `POST /api/session/create` - Create new transfer session
  - `POST /api/session/join` - Join existing session
  - `POST /api/session/heartbeat` - Keep session alive
  - `DELETE /api/session/:code` - End session
  - `GET /health` - Health check
- **WebSocket:** Native WebSocket for real-time WebRTC signaling
- **Session Codes:** 6-character alphanumeric, expire after 5 minutes
- **No file storage** - Server only facilitates connection handshake

### Frontend
- **Type:** Single Page Application (vanilla JS + HTML/CSS)
- **WebRTC:** Direct peer-to-peer data channel for file transfer
- **Compression:** LZ-based compression for text files if beneficial

### Data Flow
1. User A creates session → Server generates 6-character code
2. User A shares code with User B
3. User B enters code → Server connects them via WebSocket
4. WebRTC handshake via signaling server
5. Direct P2P connection established
6. File transferred directly (no server involvement)
7. Session terminated after transfer or timeout

---

## 3. UI/UX Specification

### Color Palette
- **Background:** `#0a0a0f` (deep dark)
- **Surface:** `#12121a` (card backgrounds)
- **Surface Elevated:** `#1a1a25` (hover states)
- **Primary:** `#6366f1` (indigo - main actions)
- **Primary Glow:** `#818cf8` (hover states)
- **Success:** `#10b981` (emerald - transfer complete)
- **Warning:** `#f59e0b` (amber - warnings)
- **Error:** `#ef4444` (red - errors)
- **Text Primary:** `#f8fafc` (white-ish)
- **Text Secondary:** `#94a3b8` (muted)
- **Border:** `#2d2d3a` (subtle borders)

### Typography
- **Font Family:** `'Satoshi', 'DM Sans', system-ui, sans-serif`
- **Headings:**
  - H1: 2.5rem, weight 700
  - H2: 1.5rem, weight 600
- **Body:** 1rem, weight 400
- **Small:** 0.875rem, weight 400
- **Monospace:** `'JetBrains Mono', monospace` for codes

### Layout Structure
- **Max Width:** 480px centered container
- **Sections:**
  1. Header with logo/title
  2. Main card area (switches between views)
  3. Status bar (connection info)
- **Spacing:** 8px base unit (0.5rem)

### Responsive Breakpoints
- **Mobile:** < 640px (full width, padding 16px)
- **Desktop:** >= 640px (centered card, max-width 480px)

### Visual Effects
- **Card shadows:** `0 25px 50px -12px rgba(99, 102, 241, 0.15)`
- **Glow effect:** Box-shadow with primary color at 20% opacity
- **Transitions:** 200ms ease-out for all interactive elements
- **Background:** Subtle radial gradient from center

### Components

#### 1. Landing View
- App title "DropZone" with animated gradient text
- Tagline: "Send files directly, no uploads"
- Two action buttons:
  - "Send a File" (primary)
  - "Receive a File" (secondary/outline)

#### 2. Send View (After clicking "Send a File")
- Large drop zone area (200px height)
- Dashed border, changes to solid on drag-over
- Icon: upload arrow
- Text: "Drop your file here or click to browse"
- File preview card (after file selected):
  - File icon based on type
  - File name (truncated if long)
  - File size
  - Remove button (X)
- "Generate Code" button (primary, disabled until file selected)
- Generated code display:
  - Large 6-character code in monospace
  - "Share this code" hint
  - Countdown timer showing session expiry (5:00)
  - Copy button for code

#### 3. Receive View (After clicking "Receive a File")
- 6 input boxes for code entry (one digit each, auto-focus)
- Keyboard navigation (arrow keys, backspace)
- "Join Session" button (primary, disabled until code complete)
- Loading state while connecting

#### 4. Transfer View (During active transfer)
- Connection status indicator (connecting/connected)
- Progress bar with percentage
- File info (name, size)
- Transfer speed (MB/s or KB/s)
- Time remaining estimate
- Cancel button

#### 5. Success View
- Checkmark animation
- "File Transferred!" message
- File name and size
- "Transfer Another" button

#### 6. Error/State View
- Error icon
- Error message
- "Try Again" button

### Animations
- **Drop zone:** Pulse animation on hover
- **Code generation:** Fade in + scale up
- **Progress bar:** Smooth width transition
- **Success:** Checkmark draw animation
- **Error:** Shake animation

---

## 4. Functionality Specification

### Core Features

#### Session Management
1. **Create Session:**
   - Generate 6-character alphanumeric code (uppercase)
   - Store session in memory with 5-minute TTL
   - Return code to sender
   - Start WebSocket server for signaling

2. **Join Session:**
   - Validate 6-character code format
   - Check if session exists and not expired
   - Connect to signaling WebSocket
   - Remove session after successful connection (one-time use)

3. **Session Expiry:**
   - Auto-expire after 5 minutes of inactivity
   - Heartbeat every 30 seconds to keep alive
   - Cleanup on disconnect

#### File Handling
1. **File Selection:**
   - Drag and drop support
   - Click to open file picker
   - Accept any file type
   - Max file size: 2GB (client-side check)

2. **Compression Check:**
   - For text-based files (txt, json, xml, html, js, css, md)
   - If original < 100KB, attempt compression
   - If compression ratio > 0.7, use compressed data
   - Otherwise send original

#### WebRTC P2P Connection
1. **Signaling Flow:**
   - Both clients connect to WebSocket
   - Sender initiates offer
   - Receiver answers
   - ICE candidates exchanged
   - Direct P2P channel established

2. **Data Channel:**
   - Create ordered, reliable channel
   - Chunk files into 16KB pieces
   - Send metadata first (name, size, type)
   - Stream file data in chunks
   - Send completion signal

#### Transfer Protocol
1. **Sender:**
   - Send: `{ type: 'metadata', name, size, mimeType }`
   - Send chunks with progress callback
   - Send: `{ type: 'complete' }`

2. **Receiver:**
   - Receive metadata, show progress UI
   - Accumulate chunks
   - Reconstruct file using Blob API
   - Trigger download on complete

### Error Handling
1. **Network Errors:**
   - Connection lost: Show reconnecting state
   - After 10s disconnect: Show "Connection lost" error
   - Allow retry without losing file

2. **Session Errors:**
   - Invalid code: "Invalid or expired code"
   - Session full: "Session already in use"
   - Session expired: "Code expired, request new one"

3. **File Errors:**
   - File too large (>2GB): "File too large (max 2GB)"
   - Unsupported: Show warning but allow anyway
   - Read error: "Could not read file"

4. **Transfer Errors:**
   - Peer disconnected: "Transfer interrupted"
   - Timeout: "Transfer timed out"

### Security Measures
1. **Input Validation:**
   - Code: 6 alphanumeric characters
   - File: Check type and size before processing
   - Sanitize file names

2. **Session Security:**
   - One-time use codes (removed after successful join)
   - 5-minute expiry
   - In-memory session storage (no persistence)

3. **Data Security:**
   - WebRTC encryption (DTLS)
   - No server-side file access
   - No logging of file contents

---

## 5. Project Structure

```
p2p/
├── server.js              # Node.js server (WebSocket + HTTP)
├── package.json           # Node.js dependencies
├── frontend/
│   ├── index.html         # Main HTML
│   ├── css/
│   │   └── styles.css     # All styles
│   └── js/
│       ├── app.js         # Main app logic
│       ├── webrtc.js      # WebRTC handling
│       └── transfer.js    # File transfer logic
├── SPEC.md                # This specification
└── README.md              # Documentation
```

---

## 6. Running the Application

### Prerequisites
- Node.js 18+ installed

### Installation & Start
```bash
npm install
npm start
```

### Access
- Open `http://localhost:3000` in your browser

---

## 7. Acceptance Criteria

### Must Have
- [x] Landing page with Send/Receive options
- [x] File drag-and-drop with visual feedback
- [x] 6-character code generation with countdown timer
- [x] Code input with auto-advance
- [x] WebRTC P2P connection establishment
- [x] File transfer with progress bar
- [x] Transfer speed display
- [x] Success/failure states
- [x] Responsive on mobile and desktop
- [x] Error handling for all edge cases

### Nice to Have
- [x] File compression for text files
- [x] Clipboard copy for code
- [x] Dark mode only (as specified)
- [x] Animations for states

### Production Ready
- [x] Environment configuration via PORT env var
- [x] Health check endpoint
- [x] Clean modular code structure
- [x] Single dependency (ws library)
