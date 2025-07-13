const { createApp, ref } = Vue;

createApp({
    setup() {
        const currentPage = ref('home');
        const isAuthenticated = ref(false);
        const authToken = ref(null);
        const message = ref('');
        const messageClass = ref('');
        const selectedFile = ref(null);
        const fileInput = ref(null);
        const cryptoKey = ref('');
        const isDragging = ref(false); // For drag and drop visual
        
        // Loading state for each major action
        const isLoading = ref({
            login: false,
            register: false,
            contact: false,
            encrypt: false,
            decrypt: false
        });
        
        const auth = ref({
            username: '',
            password: '',
            confirmPassword: ''
        });
        
        const contact = ref({
            name: '',
            email: '',
            message: ''
        });
        
        // Check if token exists on initial load
        if (localStorage.getItem('authToken')) {
            authToken.value = localStorage.getItem('authToken');
            isAuthenticated.value = true;
            currentPage.value = 'dashboard'; // Go to dashboard if already authenticated
        }

        function showPage(page) {
            currentPage.value = page;
            clearMessage(); // Clear message when changing page
            // Clear auth form fields when navigating to login/register
            if (page === 'login' || page === 'register') {
                auth.value.username = '';
                auth.value.password = '';
                auth.value.confirmPassword = '';
            }
        }
        
        function triggerFileInput() {
            fileInput.value.click();
        }
        
        function handleFileSelect(event) {
            const files = event.target.files;
            if (files.length > 0) {
                selectedFile.value = files[0];
            }
        }

        function handleFileDrop(event) {
            event.preventDefault();
            isDragging.value = false;
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                selectedFile.value = files[0];
            }
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function showMessage(text, type = 'success', persist = false) {
            message.value = text;
            messageClass.value = type === 'success' ? 'alert-success' : 'alert-danger';
            if (!persist) {
                setTimeout(() => clearMessage(), 5000); // Auto-clear after 5 seconds
            }
        }

        function clearMessage() {
            message.value = '';
            messageClass.value = '';
        }
        
        async function login() {
            if (!auth.value.username || !auth.value.password) {
                showMessage('Please enter both username and password.', 'danger');
                return;
            }

            isLoading.value.login = true;
            clearMessage(); // Clear previous messages
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: auth.value.username,
                        password: auth.value.password
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    authToken.value = data.token;
                    localStorage.setItem('authToken', data.token); // Store token
                    isAuthenticated.value = true;
                    showPage('dashboard');
                    showMessage('Login successful', 'success');
                    auth.value.username = ''; // Clear fields
                    auth.value.password = '';
                } else {
                    throw new Error(data.error || 'Login failed');
                }
            } catch (error) {
                showMessage(error.message, 'danger', true); // Persist login errors
            } finally {
                isLoading.value.login = false;
            }
        }
        
        async function register() {
            if (!auth.value.username || !auth.value.password || !auth.value.confirmPassword) {
                showMessage('All fields are required for registration.', 'danger');
                return;
            }
            if (auth.value.password.length < 8) {
                showMessage('Password must be at least 8 characters long.', 'danger');
                return;
            }
            if (auth.value.password !== auth.value.confirmPassword) {
                showMessage('Passwords do not match', 'danger');
                return;
            }
            
            isLoading.value.register = true;
            clearMessage(); // Clear previous messages
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: auth.value.username,
                        password: auth.value.password
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showMessage('Registration successful! Please login.', 'success');
                    showPage('login');
                    auth.value.username = ''; // Clear fields
                    auth.value.password = '';
                    auth.value.confirmPassword = '';
                } else {
                    throw new Error(data.error || 'Registration failed');
                }
            } catch (error) {
                showMessage(error.message, 'danger', true); // Persist registration errors
            } finally {
                isLoading.value.register = false;
            }
        }
        
        function logout() {
            authToken.value = null;
            localStorage.removeItem('authToken'); // Remove token
            isAuthenticated.value = false;
            showPage('home');
            showMessage('You have been logged out.', 'success');
        }
        
        async function sendContact() {
            if (!contact.value.name || !contact.value.email || !contact.value.message) {
                showMessage('Please fill in all contact fields.', 'danger');
                return;
            }
            // Basic email format check
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value.email)) {
                showMessage('Please enter a valid email address.', 'danger');
                return;
            }

            isLoading.value.contact = true;
            clearMessage(); // Clear previous messages
            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contact.value)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showMessage('Message sent successfully!', 'success');
                    contact.value = { name: '', email: '', message: '' }; // Clear form
                } else {
                    throw new Error(data.error || 'Failed to send message');
                }
            } catch (error) {
                showMessage(error.message, 'danger');
            } finally {
                isLoading.value.contact = false;
            }
        }
        
        async function encryptFile() {
            if (!selectedFile.value) {
                showMessage('Please select a file to encrypt.', 'danger');
                return;
            }
            if (!cryptoKey.value) {
                showMessage('Please enter an encryption key.', 'danger');
                return;
            }
            
            isLoading.value.encrypt = true;
            clearMessage(); // Clear previous messages
            const formData = new FormData();
            formData.append('file', selectedFile.value);
            formData.append('password', cryptoKey.value);
            
            try {
                const response = await fetch('/api/encrypt', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken.value}`
                    },
                    body: formData
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    const link = document.createElement('a');
                    link.href = `data:application/octet-stream;base64,${data.file}`;
                    link.download = selectedFile.value.name + '.enc';
                    link.click();
                    showMessage('File encrypted successfully. Download initiated!', 'success');
                    selectedFile.value = null; // Clear selected file
                    cryptoKey.value = ''; // Clear crypto key
                    fileInput.value.value = null; // Clear file input element
                } else {
                    throw new Error(data.error || 'Encryption failed');
                }
            } catch (error) {
                showMessage(error.message, 'danger', true); // Persist encryption errors
            } finally {
                isLoading.value.encrypt = false;
            }
        }
        
        async function decryptFile() {
            if (!selectedFile.value) {
                showMessage('Please select a file to decrypt.', 'danger');
                return;
            }
            if (!cryptoKey.value) {
                showMessage('Please enter the decryption key.', 'danger');
                return;
            }

            isLoading.value.decrypt = true;
            clearMessage(); // Clear previous messages
            const formData = new FormData();
            formData.append('file', selectedFile.value);
            formData.append('password', cryptoKey.value);
            
            try {
                const response = await fetch('/api/decrypt', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken.value}`
                    },
                    body: formData
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    const originalName = selectedFile.value.name.endsWith('.enc') 
                        ? selectedFile.value.name.slice(0, -4) 
                        : selectedFile.value.name + '.decrypted'; // Fallback name
                    
                    const link = document.createElement('a');
                    link.href = `data:application/octet-stream;base64,${data.file}`;
                    link.download = originalName;
                    link.click();
                    showMessage('File decrypted successfully. Download initiated!', 'success');
                    selectedFile.value = null; // Clear selected file
                    cryptoKey.value = ''; // Clear crypto key
                    fileInput.value.value = null; // Clear file input element
                } else {
                    throw new Error(data.error || 'Decryption failed. Incorrect key or corrupt file.');
                }
            } catch (error) {
                showMessage(error.message, 'danger', true); // Persist decryption errors
            } finally {
                isLoading.value.decrypt = false;
            }
        }
        
        return {
            currentPage,
            isAuthenticated,
            authToken, // Expose authToken for debugging if needed, though not directly used in template
            auth,
            contact,
            message,
            messageClass,
            selectedFile,
            fileInput,
            cryptoKey,
            isLoading,
            isDragging,
            showPage,
            triggerFileInput,
            handleFileSelect,
            handleFileDrop,
            formatFileSize,
            clearMessage,
            login,
            register,
            logout,
            sendContact,
            encryptFile,
            decryptFile
        };
    }
}).mount('#app');