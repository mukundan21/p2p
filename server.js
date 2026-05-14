const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const SESSION_TTL = 300000;
const STATIC_DIR = path.join(__dirname, 'frontend');
const MAX_PEERS = 2;
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const sessions = new Map();
const wsClients = new Map();

function generateCode() {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    return code;
}

function isValidSession(session) {
    return Date.now() - session.lastActivity < SESSION_TTL;
}

function cleanupExpiredSessions() {
    for (const [code, session] of sessions) {
        if (!isValidSession(session)) {
            sessions.delete(code);
        }
    }
}

setInterval(cleanupExpiredSessions, 60000);

function broadcastToSession(code, message, excludeWs = null) {
    for (const [ws, clientCode] of wsClients) {
        if (clientCode === code && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
    } else if (req.method === 'GET') {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        filePath = path.join(STATIC_DIR, filePath);

        const ext = path.extname(filePath);
        const contentTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
        };

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
            res.end(data);
        });
    } else if (req.method === 'POST' && req.url === '/api/session/create') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let code;
            do {
                code = generateCode();
            } while (sessions.has(code));

            sessions.set(code, {
                createdAt: Date.now(),
                lastActivity: Date.now(),
                peers: []
            });

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ code, expires_in: SESSION_TTL / 1000 }));
        });
    } else if (req.method === 'POST' && req.url === '/api/session/join') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { code } = JSON.parse(body || '{}');
            const upperCode = (code || '').toUpperCase();

            if (!upperCode || upperCode.length !== 6 || !/^[A-Z0-9]+$/.test(upperCode)) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid code format' }));
                return;
            }

            const session = sessions.get(upperCode);
            if (!session || !isValidSession(session)) {
                res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid or expired code' }));
                return;
            }

            if (session.peers.length >= MAX_PEERS) {
                res.writeHead(409, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Session is full' }));
                return;
            }

            session.lastActivity = Date.now();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true, code: upperCode }));
        });
    } else if (req.method === 'POST' && req.url === '/api/session/heartbeat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { code } = JSON.parse(body || '{}');
            const upperCode = (code || '').toUpperCase();
            const session = sessions.get(upperCode);

            if (!session || !isValidSession(session)) {
                res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Session expired' }));
                return;
            }

            session.lastActivity = Date.now();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true }));
        });
    } else if (req.method === 'DELETE' && req.url.startsWith('/api/session/')) {
        const code = req.url.split('/').pop().toUpperCase();
        sessions.delete(code);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: true }));
    } else if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    wsClients.set(ws, null);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'join': {
                    const code = message.code?.toUpperCase();
                    const session = sessions.get(code);

                    if (session && isValidSession(session)) {
                        const peerCount = session.peers.length;

                        if (peerCount >= MAX_PEERS) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Session is full' }));
                            return;
                        }

                        wsClients.set(ws, code);
                        session.lastActivity = Date.now();
                        session.peers.push(ws);

                        ws.send(JSON.stringify({ type: 'joined', code }));

                        if (peerCount === 1) {
                            const firstPeer = session.peers[0];
                            if (firstPeer.readyState === WebSocket.OPEN) {
                                firstPeer.send(JSON.stringify({ type: 'peer-joined' }));
                            }
                            sessions.delete(code);
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Session not found or expired' }));
                    }
                    break;
                }

                case 'offer':
                case 'answer':
                case 'ice-candidate': {
                    const targetCode = message.code?.toUpperCase();
                    if (targetCode) {
                        broadcastToSession(targetCode, message, ws);
                    }
                    break;
                }

                case 'leave': {
                    const leaveCode = message.code?.toUpperCase();
                    const session = sessions.get(leaveCode);
                    if (session) {
                        session.peers = session.peers.filter(p => p !== ws);
                        if (session.peers.length === 0) {
                            sessions.delete(leaveCode);
                        }
                    }
                    wsClients.set(ws, null);
                    ws.send(JSON.stringify({ type: 'left', code: leaveCode }));
                    break;
                }
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });

    ws.on('close', () => {
        const code = wsClients.get(ws);
        if (code) {
            const session = sessions.get(code);
            if (session) {
                session.peers = session.peers.filter(p => p !== ws);
                if (session.peers.length === 0) {
                    sessions.delete(code);
                }
            }
        }
        wsClients.delete(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
