class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.onDataChannelConnected = null;
        this.onMessage = null;
        this.onDisconnected = null;
        this.onError = null;

        this.iceServers = [
            { urls: 'stun:global.xirsys.net' },
        {
            urls: 'turn:global.xirsys.net:3478?transport=udp',
            username: 'Mukundan', // Replace with your Ident
            credential: '702da2da-4f52-11f1-b51b-0242ac140002' // Replace with your Secret
        },
        {
            urls: 'turn:global.xirsys.net:3478?transport=tcp',
            username: 'Mukundan', 
            credential: '702da2da-4f52-11f1-b51b-0242ac140002'
        }
        ];
    }

    _createPeerConnection() {
        this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
        this._setupPeerConnection();
    }

    async createOffer(code, app) {
        this._createPeerConnection();
        this.app = app;
        this.code = code;
        this.isInitiator = true;

        this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
            ordered: true
        });
        this._setupDataChannel();

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        this.app._sendWsMessage({
            type: 'offer',
            code: this.code,
            sdp: this.peerConnection.localDescription
        });
    }

    async handleOffer(offerSdp, code, app) {
        this._createPeerConnection();
        this.app = app;
        this.code = code;
        this.isInitiator = false;

        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this._setupDataChannel();
        };

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        this.app._sendWsMessage({
            type: 'answer',
            code: this.code,
            sdp: this.peerConnection.localDescription
        });
    }

    async handleAnswer(answerSdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answerSdp));
    }

    addIceCandidate(candidate) {
        if (this.peerConnection) {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
                if (this.onError) this.onError(e);
            });
        }
    }

    _setupPeerConnection() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.app._sendWsMessage({
                    type: 'ice-candidate',
                    code: this.code,
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            if (state === 'failed') {
                if (this.onError) this.onError(new Error('ICE connection failed'));
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            if (state === 'connected') {
                if (this.onDataChannelConnected) this.onDataChannelConnected();
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                if (this.onDisconnected) this.onDisconnected();
            }
        };
    }

    _setupDataChannel() {
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            if (this.onDataChannelConnected) this.onDataChannelConnected();
        };

        this.dataChannel.onmessage = (event) => {
            if (this.onMessage) this.onMessage(event);
        };

        this.dataChannel.onclose = () => {
            if (this.onDisconnected) this.onDisconnected();
        };

        this.dataChannel.onerror = (error) => {
            if (this.onError) this.onError(error);
        };
    }

    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(data);
            return true;
        }
        return false;
    }

    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.peerConnection = null;
        this.dataChannel = null;
    }
}

window.WebRTCManager = WebRTCManager;
