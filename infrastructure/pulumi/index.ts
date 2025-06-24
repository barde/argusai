import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as fs from "fs";
import * as path from "path";

// Configuration
const config = new pulumi.Config();
const accountId = config.get("accountId") || "1fe86871c437398bd78c9f5b73c6ecdb";
const environment = config.get("environment") || "development";
const githubAppId = config.require("githubAppId");
const zoneId = config.get("zoneId"); // Optional, for custom domain

// Secrets
const githubAppPrivateKey = config.requireSecret("githubAppPrivateKey");
const githubWebhookSecret = config.requireSecret("githubWebhookSecret");
const githubToken = config.requireSecret("githubToken");

// KV Namespaces
const cacheNamespace = new cloudflare.WorkersKvNamespace(`${environment}-cache`, {
    accountId: accountId,
    title: environment === "production" ? "production-CACHE" : "CACHE",
});

const rateLimitsNamespace = new cloudflare.WorkersKvNamespace(`${environment}-rate-limits`, {
    accountId: accountId,
    title: environment === "production" ? "production-RATE_LIMITS" : "RATE_LIMITS",
});

const configNamespace = new cloudflare.WorkersKvNamespace(`${environment}-config`, {
    accountId: accountId,
    title: environment === "production" ? "production-CONFIG" : "CONFIG",
});

// Queues (requires Workers Paid plan)
const reviewQueue = new cloudflare.Queue(`${environment}-reviews`, {
    accountId: accountId,
    name: environment === "production" ? "argusai-reviews" : "argusai-reviews-dev",
});

const dlqQueue = environment === "production" ? new cloudflare.Queue("reviews-dlq", {
    accountId: accountId,
    name: "argusai-reviews-dlq",
}) : undefined;

// Read the worker script
const workerScript = fs.readFileSync(
    path.join(__dirname, "../../dist/index.js"),
    "utf8"
);

// Worker Script
const worker = new cloudflare.WorkerScript(`argusai-${environment}`, {
    accountId: accountId,
    name: environment === "production" ? "argusai" : "argusai-dev",
    content: workerScript,
    
    // KV Namespace bindings
    kvNamespaceBindings: [
        {
            name: "CACHE",
            namespaceId: cacheNamespace.id,
        },
        {
            name: "RATE_LIMITS",
            namespaceId: rateLimitsNamespace.id,
        },
        {
            name: "CONFIG",
            namespaceId: configNamespace.id,
        },
    ],
    
    // Queue bindings
    queueBindings: [
        {
            binding: "REVIEW_QUEUE",
            queue: reviewQueue.name,
        },
    ],
    
    // Environment variables
    plainTextBindings: [
        {
            name: "ENVIRONMENT",
            text: environment,
        },
        {
            name: "GITHUB_APP_ID",
            text: githubAppId,
        },
        {
            name: "GITHUB_MODEL",
            text: environment === "production" ? "gpt-4o" : "gpt-4o-mini",
        },
        {
            name: "LOG_LEVEL",
            text: environment === "production" ? "info" : "debug",
        },
    ],
    
    // Secrets
    secretTextBindings: [
        {
            name: "GITHUB_APP_PRIVATE_KEY",
            text: githubAppPrivateKey,
        },
        {
            name: "GITHUB_WEBHOOK_SECRET",
            text: githubWebhookSecret,
        },
        {
            name: "GITHUB_TOKEN",
            text: githubToken,
        },
    ],
});

// Worker Route (for production with custom domain)
const workerRoute = environment === "production" && zoneId ? 
    new cloudflare.WorkerRoute("argusai-route", {
        zoneId: zoneId,
        pattern: "api.argusai.dev/*",
        scriptName: worker.name,
    }) : undefined;

// Queue Consumer Cron Trigger
const queueConsumerTrigger = new cloudflare.WorkerCronTrigger("queue-consumer", {
    accountId: accountId,
    scriptName: worker.name,
    schedules: ["*/1 * * * *"], // Every minute
});

// Exports
export const workerUrl = environment === "production" && zoneId
    ? "https://api.argusai.dev"
    : pulumi.interpolate`https://${worker.name}.${accountId}.workers.dev`;

export const kvNamespaceIds = {
    cache: cacheNamespace.id,
    rateLimits: rateLimitsNamespace.id,
    config: configNamespace.id,
};

export const queueNames = {
    reviews: reviewQueue.name,
    dlq: dlqQueue?.name || "N/A",
};

export const webhookUrl = pulumi.interpolate`${workerUrl}/webhooks/github`;