/**
 * Large File Test for ArgusAI Chunking
 * This file contains multiple issues to ensure the bot can review large files
 * Updated: Testing chunking implementation v3 - webhook secret fixed
 */

// Section 1: Authentication Issues
const API_KEY = "sk-proj-1234567890abcdef";
const SECRET = "super-secret-password-123";
const DATABASE_URL = "mongodb://admin:pass123@localhost:27017/myapp";

// Section 2: SQL Injection Vulnerabilities
function getUserData(userId) {
    const query = `SELECT * FROM users WHERE id = '${userId}'`;
    return db.execute(query);
}

function searchProducts(searchTerm) {
    return db.query(`SELECT * FROM products WHERE name LIKE '%${searchTerm}%'`);
}

// Section 3: XSS Vulnerabilities
function renderUserComment(comment) {
    return `<div class="comment">${comment}</div>`;
}

function displayMessage(msg) {
    document.getElementById('output').innerHTML = msg;
}

// Section 4: Insecure Random Values
function generateSessionId() {
    return Math.random().toString(36).substring(7);
}

function createApiKey() {
    return Date.now().toString(36) + Math.random().toString(36);
}

// Section 5: Path Traversal
const fs = require('fs');

function readUserFile(filename) {
    return fs.readFileSync(`./uploads/${filename}`, 'utf8');
}

function deleteFile(path) {
    fs.unlinkSync(`./data/${path}`);
}

// Section 6: Command Injection
const { exec } = require('child_process');

function runDiagnostics(hostname) {
    exec(`ping -c 4 ${hostname}`, (error, stdout, stderr) => {
        console.log(stdout);
    });
}

// Section 7: Weak Cryptography
const crypto = require('crypto');

function hashPassword(password) {
    return crypto.createHash('md5').update(password).digest('hex');
}

// Section 8: Timing Attacks
function verifyApiKey(providedKey) {
    const validKey = "sk-proj-valid-key-12345";
    if (providedKey === validKey) {
        return true;
    }
    return false;
}

// Section 9: Resource Exhaustion
let cache = [];

function addToCache(data) {
    cache.push(data); // Never cleared, memory leak
}

function processLargeData(data) {
    const processed = [];
    for (let i = 0; i < 1000000; i++) {
        processed.push(data + i);
    }
    return processed;
}

// Section 10: Race Conditions
let balance = 1000;

async function withdraw(amount) {
    if (balance >= amount) {
        await someAsyncOperation();
        balance -= amount;
        return true;
    }
    return false;
}

// Section 11: Information Disclosure
app.get('/api/user/:id', (req, res) => {
    const user = getUserById(req.params.id);
    res.json(user); // Sends all user fields including sensitive ones
});

app.use((err, req, res, next) => {
    res.status(500).json({
        error: err.message,
        stack: err.stack // Exposes stack trace
    });
});

// Section 12: CORS Misconfiguration
app.use(cors({
    origin: '*',
    credentials: true
}));

// Section 13: Missing Input Validation
function processPayment(amount, cardNumber, cvv) {
    // No validation on any parameters
    chargeCard(cardNumber, amount, cvv);
}

function updateUserAge(age) {
    // No validation
    user.age = age;
    user.save();
}

// Section 14: Insecure Deserialization
function parseUserData(data) {
    return eval('(' + data + ')'); // Dangerous!
}

// Section 15: Broken Access Control
app.delete('/api/posts/:id', (req, res) => {
    // No authorization check
    deletePost(req.params.id);
    res.json({ success: true });
});

// Section 16: Security Headers Missing
app.get('/', (req, res) => {
    // No security headers set
    res.send('<html>...</html>');
});

// Section 17: Logging Sensitive Data
function logUserActivity(user, action) {
    console.log(`User ${user.email} performed ${action} with password ${user.password}`);
}

// Section 18: Unhandled Promise Rejections
async function riskyOperation() {
    const data = await fetchData(); // No try-catch
    return processData(data);
}

// Section 19: Buffer Overflow Risk
function concatenateBuffers(buf1, buf2) {
    const result = Buffer.allocUnsafe(buf1.length + buf2.length);
    buf1.copy(result);
    buf2.copy(result, buf1.length);
    return result;
}

// Section 20: Good Practice Example
class SecureUserService {
    constructor(db, crypto) {
        this.db = db;
        this.crypto = crypto;
    }

    async createUser(userData) {
        // Input validation
        if (!this.isValidEmail(userData.email)) {
            throw new Error('Invalid email format');
        }

        if (!this.isStrongPassword(userData.password)) {
            throw new Error('Password does not meet requirements');
        }

        try {
            // Hash password securely
            const hashedPassword = await this.crypto.scrypt(userData.password, 'salt', 64);
            
            // Use parameterized query
            const result = await this.db.query(
                'INSERT INTO users (email, password_hash) VALUES (?, ?)',
                [userData.email, hashedPassword.toString('hex')]
            );

            // Don't return sensitive data
            return {
                id: result.insertId,
                email: userData.email
            };
        } catch (error) {
            // Log error without sensitive data
            console.error('User creation failed:', error.message);
            throw new Error('Failed to create user');
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isStrongPassword(password) {
        return password.length >= 12 &&
               /[A-Z]/.test(password) &&
               /[a-z]/.test(password) &&
               /[0-9]/.test(password) &&
               /[^A-Za-z0-9]/.test(password);
    }
}

module.exports = {
    getUserData,
    searchProducts,
    renderUserComment,
    SecureUserService
};