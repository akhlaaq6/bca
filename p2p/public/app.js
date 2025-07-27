// Global variables with better organization
const state = {
  socket: null,
  peer: null,
  localPeerId: '',
  selectedPeerId: '',
  fileQueue: [],
  currentFileIndex: 0,
  currentFile: null,
  currentOffset: 0,
  receivedBuffers: {},
  receivedSize: 0,
  totalSize: 0,
  connectionAttempts: 0,
  maxConnectionAttempts: 5
};

const config = {
  CHUNK_SIZE: 16384, // 16KB chunks
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  RECONNECT_DELAY: 3000,
  TRANSFER_TIMEOUT: 30000
};

// DOM elements cache
const elements = {
  discoverBtn: document.getElementById('discoverBtn'),
  peerList: document.getElementById('peerList'),
  fileInput: document.getElementById('fileInput'),
  fileSelector: document.getElementById('fileSelector'),
  fileList: document.getElementById('fileList'),
  sendBtn: document.getElementById('sendBtn'),
  progressBar: document.getElementById('progressBar'),
  progressText: document.getElementById('progressText'),
  speedText: document.getElementById('speedText'),
  downloadContainer: document.getElementById('downloadContainer'),
  transferLog: document.getElementById('transferLog'),
  networkStatus: document.getElementById('networkStatus'),
  localIpSpan: document.getElementById('localIp'),
  connectionStatus: document.getElementById('connectionStatus')
};

// Initialize application with better error handling
async function init() {
  try {
    // Get network information
    const networkInfo = await fetchNetworkInfo();
    elements.localIpSpan.textContent = `Your IP: ${networkInfo.localIp || 'Not available'}`;
    
    // Initialize socket connection
    initializeSocketConnection();
    
    // Set up UI event listeners
    setupEventListeners();
    
    logMessage('Application initialized successfully');
  } catch (error) {
    logMessage(`Initialization failed: ${error.message}`, 'error');
    setTimeout(init, config.RECONNECT_DELAY);
  }
}

// Improved network info fetching
async function fetchNetworkInfo() {
  try {
    const response = await fetch('/network');
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch network info:', error);
    return { localIp: null };
  }
}

// Enhanced socket connection management
function initializeSocketConnection() {
  state.socket = io({
    reconnection: true,
    reconnectionAttempts: config.maxConnectionAttempts,
    reconnectionDelay: config.RECONNECT_DELAY,
    transports: ['websocket']
  });

  state.socket.on('connect', () => {
    state.localPeerId = state.socket.id;
    state.connectionAttempts = 0;
    updateConnectionStatus(true);
    logMessage('Connected to signaling server');
    startPeerDiscovery();
  });

  state.socket.on('disconnect', (reason) => {
    updateConnectionStatus(false);
    logMessage(`Disconnected: ${reason}`, 'warning');
    if (reason === 'io server disconnect') {
      // Manual reconnection needed
      setTimeout(initializeSocketConnection, config.RECONNECT_DELAY);
    }
  });

  state.socket.on('connect_error', (error) => {
    state.connectionAttempts++;
    logMessage(`Connection error (attempt ${state.connectionAttempts}/${config.maxConnectionAttempts}): ${error.message}`, 'error');
  });

  state.socket.on('peers', (peers) => {
    updatePeerList(peers.filter(id => id !== state.localPeerId));
  });

  state.socket.on('offer', (offer, fromId) => {
    handleOffer(offer, fromId);
  });

  state.socket.on('answer', (answer) => {
    if (state.peer) {
      state.peer.signal(answer);
      logMessage('Received answer from peer');
    }
  });

  state.socket.on('ice-candidate', (candidate) => {
    if (state.peer && !state.peer.destroyed) {
      state.peer.signal(candidate);
    }
  });
}

// Improved peer discovery
function startPeerDiscovery() {
  const discoveryInterval = setInterval(() => {
    if (state.socket.connected) {
      state.socket.emit('discover');
    } else {
      clearInterval(discoveryInterval);
    }
  }, 5000);

  // Initial discovery
  state.socket.emit('discover');
}

// Enhanced file selection handling
function handleFileSelect() {
  const files = elements.fileSelector.files;
  elements.fileList.innerHTML = '';
  state.fileQueue = [];

  if (!files || files.length === 0) return;

  state.fileQueue = Array.from(files);
  state.totalSize = state.fileQueue.reduce((sum, file) => sum + file.size, 0);

  state.fileQueue.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'peer-item';
    fileItem.innerHTML = `
      <span>${file.name}</span>
      <span>${formatFileSize(file.size)}</span>
      <button class="remove-file" data-index="${index}">×</button>
    `;
    elements.fileList.appendChild(fileItem);
  });

  // Add event listeners to remove buttons
  document.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      state.fileQueue.splice(index, 1);
      handleFileSelect(); // Refresh the list
    });
  });

  elements.sendBtn.disabled = false;
  logMessage(`Selected ${files.length} files (${formatFileSize(state.totalSize)})`);
}

// Improved transfer initiation with timeout
function initiateTransfer() {
  if (!state.selectedPeerId || state.fileQueue.length === 0) {
    logMessage('Please select a peer and files first', 'error');
    return;
  }

  logMessage('Initiating transfer...');

  // Clear any existing peer connection
  if (state.peer) {
    state.peer.destroy();
    state.peer = null;
  }

  state.peer = new SimplePeer({
    initiator: true,
    trickle: true,
    config: { iceServers: config.ICE_SERVERS }
  });

  setupPeerEvents();

  // Set transfer timeout
  const transferTimeout = setTimeout(() => {
    if (state.peer && !state.peer.connected) {
      logMessage('Transfer timeout - connection took too long', 'error');
      cleanup();
    }
  }, config.TRANSFER_TIMEOUT);

  state.peer.on('connect', () => {
    clearTimeout(transferTimeout);
    logMessage('Peer connection established!', 'success');
    startFileTransfer();
  });

  state.peer.on('signal', (data) => {
    if (data.type === 'offer') {
      state.socket.emit('offer', data, state.selectedPeerId);
      logMessage('Sent offer to peer');
    } else if (data.candidate) {
      state.socket.emit('ice-candidate', data, state.selectedPeerId);
    }
  });
}

// Enhanced file transfer with progress tracking
function startFileTransfer() {
  state.currentFileIndex = 0;
  state.currentOffset = 0;
  state.receivedSize = 0;

  // Send metadata first
  const filesMetadata = state.fileQueue.map(file => ({
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified
  }));

  sendData(JSON.stringify({
    type: 'metadata',
    files: filesMetadata,
    totalSize: state.totalSize,
    timestamp: Date.now()
  }));

  // Start sending files
  sendNextFile();
}

// Reliable data sending with chunking
function sendData(data) {
  if (!state.peer || !state.peer.connected) {
    logMessage('Cannot send data - peer not connected', 'error');
    return false;
  }

  try {
    state.peer.send(data);
    return true;
  } catch (error) {
    logMessage(`Failed to send data: ${error.message}`, 'error');
    return false;
  }
}

// Deployment-ready cleanup
function cleanup() {
  if (state.peer) {
    try {
      state.peer.destroy();
    } catch (error) {
      console.error('Error cleaning up peer:', error);
    }
    state.peer = null;
  }
  
  state.selectedPeerId = '';
  elements.discoverBtn.textContent = 'Discover Peers';
  
  // Reset progress
  elements.progressBar.value = 0;
  elements.progressText.textContent = '0%';
  elements.speedText.textContent = 'Speed: 0 KB/s';
}

// Enhanced error handling for deployment
window.addEventListener('beforeunload', () => {
  cleanup();
  if (state.socket) state.socket.close();
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  init();
  
  // Service worker registration for PWA deployment
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  }
});

// Keep all your existing helper functions (formatFileSize, formatSpeed, etc.)
// but add this new one for better deployment:

function getDeploymentConfig() {
  return {
    environment: process.env.NODE_ENV || 'development',
    apiBaseUrl: window.location.origin,
    isSecure: window.location.protocol === 'https:',
    // Add other deployment-specific configs here
  };
}
