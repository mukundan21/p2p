const CHUNK_SIZE = 64 * 1024;
const BACKPRESSURE_THRESHOLD = 1024 * 1024;

class TransferManager {
    constructor(webrtcManager) {
        this.webrtc = webrtcManager;
        this.file = null;
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        this.receivedBlob = null;
        this.receivedMetadata = null;
        this.receivedSize = 0;
        this._transferStartTime = 0;
        this._aborted = false;
    }

    async prepareFile(file) {
        this.file = file;
    }

    async send(onProgress) {
        if (!this.file) {
            throw new Error('No file prepared');
        }

        this.onProgress = onProgress;
        this._transferStartTime = Date.now();
        this._aborted = false;

        const metadata = {
            type: 'metadata',
            name: this.file.name,
            size: this.file.size,
            mimeType: this.file.type
        };

        this.webrtc.send(JSON.stringify(metadata));

        const totalChunks = Math.ceil(this.file.size / CHUNK_SIZE);
        let bytesSent = 0;
        let lastProgressUpdate = 0;

        for (let i = 0; i < totalChunks; i++) {
            if (this._aborted) return;

            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, this.file.size);
            const blob = this.file.slice(start, end);
            const arrayBuffer = await blob.arrayBuffer();

            while (this.webrtc.dataChannel.bufferedAmount > BACKPRESSURE_THRESHOLD) {
                if (this._aborted) return;
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            try {
                this.webrtc.send(arrayBuffer);
            } catch (e) {
                throw new Error('Send failed: ' + e.message);
            }

            bytesSent += arrayBuffer.byteLength;

            const now = Date.now();
            if (onProgress && (now - lastProgressUpdate >= 100 || i === totalChunks - 1)) {
                onProgress({
                    transferred: bytesSent,
                    total: this.file.size,
                    speed: this._calculateSpeed(bytesSent)
                });
                lastProgressUpdate = now;
            }
        }

        this.webrtc.send(JSON.stringify({ type: 'complete' }));
    }

    handleMessage(message, onProgress) {
        this.onProgress = onProgress;

        try {
            if (typeof message === 'string') {
                const data = JSON.parse(message);

                if (data.type === 'metadata') {
                    this.receivedMetadata = data;
                    this.receivedBlob = null;
                    this.receivedSize = 0;
                    this._transferStartTime = Date.now();
                } else if (data.type === 'complete') {
                    this._assembleAndDownload();
                }
            } else if (message instanceof ArrayBuffer) {
                const chunk = new Blob([message], {
                    type: this.receivedMetadata?.mimeType || 'application/octet-stream'
                });
                this.receivedBlob = this.receivedBlob
                    ? new Blob([this.receivedBlob, chunk])
                    : chunk;
                this.receivedSize += message.byteLength;

                if (onProgress) {
                    onProgress({
                        transferred: this.receivedSize,
                        total: this.receivedMetadata.size,
                        speed: this._calculateSpeed(this.receivedSize)
                    });
                }
            }
        } catch (e) {
            if (this.onError) this.onError(e);
        }
    }

    async _assembleAndDownload() {
        if (!this.receivedBlob) return;

        const blob = this.receivedBlob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.receivedMetadata.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.receivedBlob = null;

        if (this.onComplete) {
            this.onComplete({
                name: this.receivedMetadata.name,
                size: this.receivedMetadata.size
            });
        }
    }

    _calculateSpeed(bytes) {
        const elapsed = (Date.now() - this._transferStartTime) / 1000;
        return elapsed > 0 ? Math.round(bytes / elapsed) : 0;
    }

    abort() {
        this._aborted = true;
    }

    reset() {
        this.file = null;
        this.receivedBlob = null;
        this.receivedMetadata = null;
        this.receivedSize = 0;
        this._transferStartTime = 0;
        this._aborted = false;
    }
}

window.TransferManager = TransferManager;
