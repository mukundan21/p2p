# DropZone - P2P File Transfer

A peer-to-peer file transfer application. Send files directly between browsers without uploading to any server.

## Features

- **Direct P2P Transfer**: Files transfer directly between devices using WebRTC
- **No Server Storage**: Server only facilitates connection f handshake, files never touch the server
- **6-Character Codes**: Simple session codes that expire after 5 minutes
- **Drag & Drop**: Intuitive file selection with drag-and-drop support
- **File Compression**: Automatic compression for text-based files when beneficial
- **Real-time Progress**: Live transfer speed, progress percentage, and time estimates
- **End-to-End Encryption**: WebRTC provides built-in DTLS encryption

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in two browser windows.

## How It Works

1. **Sender**: Click "Send a File", drop a file, get a 6-character code
2. **Sender** shares the code with the **Receiver**
3. **Receiver**: Click "Receive a File", enter the code
4. The server connects them via WebSocket for signaling
5. WebRTC establishes a direct P2P connection
6. File transfers directly between devices
7. Session ends after transfer or timeout

## Tech Stack

- **Backend**: Node.js + `ws` (WebSocket library only)
- **Frontend**: Vanilla JS + HTML/CSS
- **Protocol**: WebRTC for P2P transfer, WebSocket for signaling

No Docker, no nginx, no Flask. Just Node.js.

## Project Structure

```
p2p/
├── server.js              # Node.js server (WebSocket + HTTP)
├── package.json           # Node.js dependencies
├── frontend/
│   ├── index.html         # Main HTML
│   ├── css/styles.css     # Styles
│   └── js/
│       ├── app.js         # Main app logic
│       ├── webrtc.js      # WebRTC handling
│       └── transfer.js    # File transfer logic
├── SPEC.md                # Specification
└── README.md              # This file
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## License

MIT
