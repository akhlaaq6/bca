import os
import base64
import sqlite3
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet
from cryptography.hazmat.backends import default_backend
import hashlib
import jwt

app = Flask(__name__, static_folder='static')
CORS(app)
app.config['SECRET_KEY'] = os.urandom(24)
DATABASE = 'vaultservice.db'
LOCK = threading.Lock()

# Database Initialization
def init_db():
    with sqlite3.connect(DATABASE) as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            salt BLOB,
            password_hash BLOB,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            filename TEXT,
            operation TEXT,
            timestamp DATETIME,
            status TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )''')
        conn.execute('''CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY,
            name TEXT,
            email TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')
        conn.commit()

# Security Functions
def hash_password(password, salt=None):
    salt = salt or os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
        backend=default_backend()
    )
    return salt, kdf.derive(password.encode())

def verify_password(stored_salt, stored_hash, password):
    try:
        _, computed_hash = hash_password(password, stored_salt)
        return computed_hash == stored_hash
    except:
        return False

def generate_token(username):
    return jwt.encode({'username': username}, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    try:
        return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
    except:
        return None

# API Endpoints
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    salt, pwd_hash = hash_password(password)
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            conn.execute('INSERT INTO users (username, salt, password_hash) VALUES (?, ?, ?)',
                         (username, salt, pwd_hash))
            conn.commit()
        return jsonify({'token': generate_token(username)})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    with sqlite3.connect(DATABASE) as conn:
        user = conn.execute('SELECT salt, password_hash FROM users WHERE username = ?',
                            (username,)).fetchone()
    
    if user and verify_password(user[0], user[1], password):
        return jsonify({'token': generate_token(username)})
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/encrypt', methods=['POST'])
def encrypt():
    token = request.headers.get('Authorization', '').split(' ')[-1]
    user = verify_token(token)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
        
    file = request.files['file']
    password = request.form.get('password')
    
    if not file or not password:
        return jsonify({'error': 'File and password required'}), 400
    
    salt = os.urandom(16)
    key = base64.urlsafe_b64encode(hash_password(password, salt)[1])
    fernet = Fernet(key)
    
    try:
        encrypted = fernet.encrypt(file.read())
        return jsonify({'file': base64.b64encode(salt + encrypted).decode()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/decrypt', methods=['POST'])
def decrypt():
    token = request.headers.get('Authorization', '').split(' ')[-1]
    user = verify_token(token)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
        
    file = request.files['file']
    password = request.form.get('password')
    
    if not file or not password:
        return jsonify({'error': 'File and password required'}), 400
    
    try:
        data = file.read()
        salt = data[:16]
        encrypted = data[16:]
        
        key = base64.urlsafe_b64encode(hash_password(password, salt)[1])
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted)
        
        return jsonify({'file': base64.b64encode(decrypted).decode()})
    except Exception as e:
        return jsonify({'error': 'Decryption failed'}), 400

@app.route('/api/contact', methods=['POST'])
def contact():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    message = data.get('message')
    
    if not all([name, email, message]):
        return jsonify({'error': 'All fields required'}), 400
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            conn.execute('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)',
                         (name, email, message))
            conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Serve frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    init_db()
    app.run(threaded=True)