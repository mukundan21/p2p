const WS_URL = 'ws://localhost:3000';
const API_URL = 'http://localhost:3000';
const SESSION_TTL = 300;

class App {
    constructor() {
        this.ws = null;
        this.webrtc = null;
        this.transfer = null;
        this.state = 'landing';
        this.sessionCode = null;
        this.selectedFile = null;
        this.timerInterval = null;
        this.timeRemaining = SESSION_TTL;
        this.heartbeatInterval = null;
        this.startTime = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isSender = false;

        this._initElements();
        this._initWebSocket();
        this._bindEvents();
    }

    _initElements() {
        this.views = {
            landing: document.getElementById('landing-view'),
            send: document.getElementById('send-view'),
            receive: document.getElementById('receive-view'),
            transfer: document.getElementById('transfer-view'),
            success: document.getElementById('success-view'),
            error: document.getElementById('error-view')
        };

        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.filePreview = document.getElementById('file-preview');
        this.generateCodeBtn = document.getElementById('generate-code-btn');
        this.codeDisplay = document.getElementById('code-display');
        this.generatedCode = document.getElementById('generated-code');
        this.timer = document.getElementById('timer');
        this.copyCodeBtn = document.getElementById('copy-code-btn');

        this.codeInputs = Array.from(document.querySelectorAll('.code-input'));
        this.joinSessionBtn = document.getElementById('join-session-btn');

        this.progressBar = document.getElementById('progress-bar');
        this.progressPercent = document.getElementById('progress-percent');
        this.progressSpeed = document.getElementById('progress-speed');
        this.progressTime = document.getElementById('progress-time');
        this.transferFilename = document.getElementById('transfer-filename');
        this.transferFilesize = document.getElementById('transfer-filesize');
        this.cancelTransferBtn = document.getElementById('cancel-transfer-btn');

        this.successFilename = document.getElementById('success-filename');
        this.successFilesize = document.getElementById('success-filesize');

        this.errorMessage = document.getElementById('error-message');
    }

    _initWebSocket() {
        this._connectWebSocket();
    }

    _connectWebSocket() {
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleWebSocketMessage(data);
                } catch (e) {
                    console.error('Error parsing WebSocket message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this._attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (e) {
            console.error('Failed to create WebSocket:', e);
        }
    }

    _attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.state !== 'landing') {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this._connectWebSocket(), 2000);
        }
    }

    _handleWebSocketMessage(data) {
        switch (data.type) {
            case 'joined':
                if (!this.isSender) {
                    this._showView('transfer');
                    this._updateTransferUI('connected', 'Peer Connected!');
                }
                break;
            case 'peer-joined':
                if (this.isSender && this.webrtc) {
                    this._showView('transfer');
                    this._updateTransferUI('connected', 'Peer Connected!');
                    this.webrtc.createOffer(this.sessionCode, this);
                }
                break;
            case 'offer':
                console.log('Received offer');
                if (!this.webrtc) {
                    this.webrtc = new WebRTCManager();
                    this.transfer = new TransferManager(this.webrtc);
                }

                this.webrtc.onDataChannelConnected = () => {
                    this._startAsReceiver();
                };
                this.webrtc.onMessage = (event) => {
                    this.transfer.handleMessage(event.data, (progress) => {
                        this._updateProgress(progress);
                    });
                };
                this.webrtc.onDisconnected = () => this._showError('Peer disconnected');
                this.webrtc.onError = (e) => this._showError('Connection error');

                this.webrtc.handleOffer(data.sdp, data.code, this);
                break;
            case 'answer':
                console.log('Received answer');
                if (this.webrtc) {
                    this.webrtc.handleAnswer(data.sdp);
                }
                break;
            case 'ice-candidate':
                if (this.webrtc) {
                    this.webrtc.addIceCandidate(data.candidate);
                }
                break;
            case 'error':
                this._showError(data.message || 'Connection error');
                break;
            case 'left':
                console.log('Left room:', data.code);
                break;
        }
    }

    _sendWsMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    _bindEvents() {
        document.getElementById('send-btn').addEventListener('click', () => {
            this._showView('send');
        });
        document.getElementById('receive-btn').addEventListener('click', () => this._showView('receive'));

        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this._processFile(e.dataTransfer.files[0]);
            }
        });
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this._processFile(e.target.files[0]);
            }
        });

        this.generateCodeBtn.addEventListener('click', () => this._createSession());
        this.copyCodeBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(this.sessionCode).then(() => {
                this.copyCodeBtn.textContent = 'Copied!';
                setTimeout(() => this.copyCodeBtn.textContent = 'Copy', 2000);
            });
        });

        this.codeInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                e.target.value = value;
                if (value && index < 5) {
                    this.codeInputs[index + 1].focus();
                }
                this.joinSessionBtn.disabled = this._getCodeFromInputs().length !== 6;
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    this.codeInputs[index - 1].focus();
                }
            });
        });

        this.codeInputs[0].addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text').toUpperCase();
            const chars = paste.replace(/[^A-Z0-9]/g, '').slice(0, 6).split('');
            chars.forEach((char, i) => {
                if (this.codeInputs[i]) this.codeInputs[i].value = char;
            });
            this.joinSessionBtn.disabled = chars.length !== 6;
            if (chars.length < 6) this.codeInputs[Math.min(chars.length, 5)].focus();
        });

        this.joinSessionBtn.addEventListener('click', () => this._joinSession());
        this.cancelTransferBtn.addEventListener('click', () => this._cancelTransfer());
        document.getElementById('transfer-another-btn').addEventListener('click', () => this._resetToLanding());
        document.getElementById('retry-btn').addEventListener('click', () => this._resetToLanding());
    }

    _showView(viewName) {
        Object.values(this.views).forEach(v => v.classList.add('hidden'));
        this.views[viewName].classList.remove('hidden');
        this.state = viewName;
        if (viewName === 'receive') {
            setTimeout(() => this.codeInputs[0].focus(), 100);
        }
    }

    _processFile(file) {
        const maxSize = 2 * 1024 * 1024 * 1024;
        if (file.size > maxSize) {
            this._showError('File too large (max 2GB)');
            return;
        }
        this.selectedFile = file;
        this._showFilePreview(file);
        this.generateCodeBtn.disabled = false;
    }

    _showFilePreview(file) {
        const icon = this._getFileIcon(file.name);
        const size = this._formatFileSize(file.size);
        this.filePreview.innerHTML = `
            <div class="file-preview-content">
                <span class="file-icon">${icon}</span>
                <div class="file-info">
                    <span class="file-name">${this._truncate(file.name, 30)}</span>
                    <span class="file-size">${size}</span>
                </div>
                <button class="remove-file-btn" id="remove-file-btn">&times;</button>
            </div>
        `;
        document.getElementById('remove-file-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedFile = null;
            this.filePreview.innerHTML = '';
            this.generateCodeBtn.disabled = true;
            this.dropZone.classList.remove('hidden');
            this.filePreview.classList.add('hidden');
        });
        this.dropZone.classList.add('hidden');
        this.filePreview.classList.remove('hidden');
    }

    _getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', zip: '📦', rar: '📦', '7z': '📦', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', mp3: '🎵', wav: '🎵', mp4: '🎬', mov: '🎬', avi: '🎬', js: '📜', ts: '📜', py: '🐍', html: '🌐', css: '🎨', json: '📋', txt: '📄', md: '📝' };
        return icons[ext] || '📁';
    }

    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    _truncate(str, len) {
        return str.length > len ? str.substring(0, len - 3) + '...' : str;
    }

    async _createSession() {
        try {
            const response = await fetch(`${API_URL}/api/session/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Failed to create session');
            const data = await response.json();
            this.sessionCode = data.code;
            this.timeRemaining = data.expires_in;

            this.generatedCode.textContent = this.sessionCode;
            this.codeDisplay.classList.remove('hidden');
            this.generateCodeBtn.classList.add('hidden');

            this._startTimer();
            this._startHeartbeat();
            this._sendWsMessage({ type: 'join', code: this.sessionCode });

            this.webrtc = new WebRTCManager();
            this.transfer = new TransferManager(this.webrtc);

            this.webrtc.onDataChannelConnected = async () => {
                this._showView('transfer');
                this._updateTransferUI('connected', 'Transferring...');
                this.startTime = Date.now();

                await this.transfer.prepareFile(this.selectedFile);
                this.transferFilename.textContent = this.selectedFile.name;
                this.transferFilesize.textContent = this._formatFileSize(this.selectedFile.size);

                this.transfer.send((progress) => this._updateProgress(progress))
                    .then(() => this._onTransferComplete())
                    .catch((e) => this._showError('Transfer failed: ' + e.message));
            };

            this.webrtc.onDisconnected = () => this._showError('Peer disconnected');
            this.webrtc.onError = (e) => this._showError('Connection error');

            this.isSender = true;

        } catch (e) {
            this._showError('Failed to create session: ' + e.message);
        }
    }

    _startTimer() {
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            const mins = Math.floor(this.timeRemaining / 60);
            const secs = this.timeRemaining % 60;
            this.timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            if (this.timeRemaining <= 0) this._showError('Session expired');
        }, 1000);
    }

    _startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                await fetch(`${API_URL}/api/session/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: this.sessionCode })
                });
            } catch (e) { console.warn('Heartbeat failed'); }
        }, 30000);
    }

    _getCodeFromInputs() {
        return this.codeInputs.map(input => input.value).join('').toUpperCase();
    }

    async _joinSession() {
        const code = this._getCodeFromInputs();
        if (code.length !== 6) return;

        try {
            const response = await fetch(`${API_URL}/api/session/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Invalid code');
            }
            this.sessionCode = code;
            this._sendWsMessage({ type: 'join', code });
            this._showView('transfer');
            this._updateTransferUI('connecting', 'Connecting...');
        } catch (e) {
            this._showError(e.message);
        }
    }

_startAsReceiver() {
        this._showView('transfer');
        this._updateTransferUI('connected', 'Receiving...');

        this.transfer.onComplete = (file) => {
            this._showView('success');
            this.successFilename.textContent = file.name;
            this.successFilesize.textContent = this._formatFileSize(file.size);
        };

        this.transfer.onError = (e) => this._showError('Receive error: ' + e.message);
    }

    _updateTransferUI(status, message) {
        document.getElementById('transfer-status-text').textContent = message;
        document.getElementById('transfer-status-text').className = `status-text ${status}`;
        document.querySelector('.status-dot').className = `status-dot ${status}`;
    }

    _updateProgress(progress) {
        const percent = Math.round((progress.transferred / progress.total) * 100);
        this.progressBar.style.width = `${percent}%`;
        this.progressPercent.textContent = `${percent}%`;
        this.progressSpeed.textContent = this._formatFileSize(progress.speed || 0) + '/s';

        if (this.startTime && progress.transferred > 0) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            const rate = progress.transferred / elapsed;
            const remaining = (progress.total - progress.transferred) / rate;
            if (isFinite(remaining)) {
                const mins = Math.floor(remaining / 60);
                const secs = Math.round(remaining % 60);
                this.progressTime.textContent = `${mins}m ${secs}s remaining`;
            }
        }
    }

    _onTransferComplete() {
        clearInterval(this.timerInterval);
        clearInterval(this.heartbeatInterval);
        this._showView('success');
        this.successFilename.textContent = this.selectedFile.name;
        this.successFilesize.textContent = this._formatFileSize(this.selectedFile.size);
    }

    _cancelTransfer() {
        if (this.webrtc) this.webrtc.close();
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this._sendWsMessage({ type: 'leave', code: this.sessionCode });
        this._resetToLanding();
    }

    _showError(message) {
        clearInterval(this.timerInterval);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        document.getElementById('error-message').textContent = message;
        this._showView('error');
    }

    _resetToLanding() {
        if (this.webrtc) this.webrtc.close();
        clearInterval(this.timerInterval);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.sessionCode = null;
        this.selectedFile = null;
        this.webrtc = null;
        this.transfer = null;
        this.isSender = false;

        this.fileInput.value = '';
        this.filePreview.innerHTML = '';
        this.filePreview.classList.add('hidden');
        this.dropZone.classList.remove('hidden');
        this.codeDisplay.classList.add('hidden');
        this.generateCodeBtn.classList.remove('hidden');
        this.generateCodeBtn.disabled = true;

        this.codeInputs.forEach(input => input.value = '');
        this.joinSessionBtn.disabled = true;

        this.progressBar.style.width = '0%';
        this.progressPercent.textContent = '0%';
        this.progressSpeed.textContent = '0 B/s';
        this.progressTime.textContent = 'Calculating...';

        this._showView('landing');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
