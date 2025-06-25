/**
 * Test file to verify ArgusAI commenting system functionality
 * This file intentionally contains various code patterns to test different review scenarios
 */

// Test 1: SQL injection vulnerability (should trigger security warning)
function getUserData(userId: string) {
    const query = `SELECT * FROM users WHERE id = '${userId}'`;
    // This is intentionally vulnerable to SQL injection
    return db.execute(query);
}

// Test 2: Missing error handling (should trigger improvement suggestion)
async function fetchData(url: string) {
    const response = await fetch(url);
    const data = await response.json();
    return data;
}

// Test 3: Performance issue (should trigger performance warning)
function findDuplicates(arr: number[]) {
    const duplicates = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            if (arr[i] === arr[j]) {
                duplicates.push(arr[i]);
            }
        }
    }
    return duplicates; // O(n²) complexity
}

// Test 4: Good code example (should receive positive feedback)
class UserService {
    private readonly repository: UserRepository;
    
    constructor(repository: UserRepository) {
        this.repository = repository;
    }
    
    async createUser(userData: CreateUserDto): Promise<User> {
        // Validate input
        if (!userData.email || !userData.name) {
            throw new Error('Email and name are required');
        }
        
        // Check for existing user
        const existing = await this.repository.findByEmail(userData.email);
        if (existing) {
            throw new Error('User already exists');
        }
        
        // Create user with proper error handling
        try {
            const user = await this.repository.create(userData);
            return user;
        } catch (error) {
            console.error('Failed to create user:', error);
            throw new Error('User creation failed');
        }
    }
}

// Test 5: Style issue (inconsistent naming)
const user_name = "John";  // snake_case instead of camelCase
const UserAge = 25;        // PascalCase for variable

// Test 6: Potential null reference
function processUser(user: any) {
    console.log(user.name.toUpperCase()); // user or user.name might be null
}

// Test 7: Hardcoded credentials (security issue)
const API_KEY = "sk-1234567890abcdef";
const DATABASE_PASSWORD = "admin123";

// Test 8: Memory leak potential
let cache = {};
function addToCache(key: string, value: any) {
    cache[key] = value; // Cache grows indefinitely
}

// Types for TypeScript (to avoid compilation errors)
interface User {
    id: string;
    email: string;
    name: string;
}

interface CreateUserDto {
    email: string;
    name: string;
}

interface UserRepository {
    findByEmail(email: string): Promise<User | null>;
    create(data: CreateUserDto): Promise<User>;
}

declare const db: {
    execute(query: string): Promise<any>;
};