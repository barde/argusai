/**
 * ArgusAI Bot Test File v2
 * This file contains intentional issues to test the bot's review capabilities
 * Update: Triggering webhook to capture logs
 */

// Test 1: Hardcoded API credentials (CRITICAL security issue)
const API_KEY = "sk-proj-abcd1234567890";
const DATABASE_URL = "postgres://admin:password123@localhost:5432/mydb";

// Test 2: SQL Injection vulnerability
function getUserByEmail(email) {
    const query = `SELECT * FROM users WHERE email = '${email}'`;
    return db.query(query);
}

// Test 3: No input validation
async function processPayment(amount, cardNumber) {
    // Missing validation for amount and card number
    await chargeCard(cardNumber, amount);
}

// Test 4: Synchronous file operation blocking event loop
function readLargeFile() {
    const fs = require('fs');
    const data = fs.readFileSync('/path/to/huge-file.txt', 'utf8');
    return data;
}

// Test 5: Memory leak - global array that grows forever
let requestLog = [];
function logRequest(req) {
    requestLog.push({
        timestamp: new Date(),
        url: req.url,
        headers: req.headers,
        body: req.body
    });
}

// Test 6: Good practice example - proper async/await with error handling
class UserService {
    constructor(database) {
        this.db = database;
    }

    async createUser(userData) {
        // Validate input
        if (!userData.email || !this.isValidEmail(userData.email)) {
            throw new Error('Valid email is required');
        }

        try {
            // Use parameterized query
            const result = await this.db.query(
                'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
                [userData.email, userData.name]
            );
            return result.rows[0];
        } catch (error) {
            console.error('Failed to create user:', error);
            throw new Error('User creation failed');
        }
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}

// Test 7: Potential XSS vulnerability
function renderUserProfile(user) {
    return `<div>Welcome ${user.name}!</div>`; // user.name not escaped
}

// Test 8: Race condition
let counter = 0;
async function incrementCounter() {
    const current = counter;
    await someAsyncOperation();
    counter = current + 1; // Race condition here
}

module.exports = { UserService, getUserByEmail, processPayment };