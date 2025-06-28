# Storage Module

This module provides a centralized abstraction layer for all KV storage operations in ArgusAI.

## Architecture

The storage module is built with the following components:

### Core Components

1. **StorageService** (`service.ts`) - Main implementation of storage operations
2. **ValidatedStorageService** (`validated-service.ts`) - Wrapper that adds data validation
3. **StorageServiceFactory** (`factory.ts`) - Factory for creating storage service instances
4. **StorageKeys** (`keys.ts`) - Centralized key generation and parsing
5. **Types** (`types.ts`) - TypeScript interfaces for all storage data
6. **Validation** (`validation.ts`) - Zod schemas for data validation

### Utility Components

1. **StorageCleanup** (`cleanup.ts`) - Scheduled cleanup of old data
2. **StorageMetricsCollector** (`metrics.ts`) - Metrics collection and monitoring

## Usage

### Basic Usage

```typescript
import { StorageServiceFactory } from './storage';

// In your handler or service
const factory = new StorageServiceFactory();
const storage = factory.create(env);

// Save a review
await storage.saveReview('owner/repo', 123, 'sha123', reviewData);

// Get a review
const review = await storage.getReview('owner/repo', 123, 'sha123');

// Check rate limits
const { allowed, remaining } = await storage.incrementRateLimit('installationId');

// Save configuration
await storage.saveConfig('owner', 'repo', configData);
```

### With Validation

```typescript
import { ValidatedStorageService } from './storage';

const storage = new ValidatedStorageService(env);
// All operations will validate data before saving and after retrieval
```

## Key Patterns

The storage module uses consistent key patterns:

- **Reviews**: `review:{repository}:{prNumber}:{sha}`
- **Status**: `status:{repository}:{prNumber}`
- **History**: `history:{repository}:{prNumber}`
- **Rate Limits**: `rate:{installationId}:{window}`
- **Config**: `config:{owner}/{repo}`
- **Deduplication**: `dedup:{repository}:{prNumber}:{eventId}`
- **Debug**: `debug:last-{type}`
- **Metrics**: `metrics:{namespace}`

## TTL Configuration

Default TTLs are configured for each data type:

- Reviews: 7 days
- Review Status: 24 hours
- Review History: 30 days
- Rate Limits: 2 minutes
- Config: No TTL (permanent)
- Deduplication: 24 hours
- Debug: 1 hour
- Metrics: 24 hours

## Features

### Rate Limiting

The storage service includes built-in rate limiting with:
- 60 requests per minute per installation
- Automatic window calculation
- Graceful degradation on errors

### Deduplication

Prevents duplicate webhook processing with:
- Event ID tracking
- Automatic TTL management
- Simple isDuplicate/markProcessed API

### Metrics Collection

Track storage operations with:
- Operation counts (reads, writes, deletes, errors)
- Health status calculation
- Prometheus export format
- Slow operation tracking

### Data Cleanup

Scheduled cleanup with:
- Configurable retention periods
- Namespace-specific cleanup
- Rate-limited deletion (1 write/second)

## Testing

The module includes comprehensive tests:

```bash
npm test src/storage/__tests__
```

Test coverage includes:
- Key generation and parsing
- Data validation
- Service operations
- Cleanup routines
- Metrics collection

## KV Namespaces

The module uses three KV namespaces:

1. **CACHE** - General caching (reviews, status, history, debug, metrics)
2. **RATE_LIMITS** - Rate limiting data
3. **CONFIG** - Repository configurations

## Error Handling

All storage operations include:
- Try-catch wrapping
- Graceful degradation
- Error logging
- Metrics tracking

## Performance Considerations

- Batch operations respect the 1 write/second limit
- Metrics don't block main operations
- Cleanup runs asynchronously
- TTLs reduce storage size

## Migration Guide

To migrate from direct KV usage:

1. Replace `env.CACHE.get()` with `storage.get()` or specific methods
2. Replace `env.CACHE.put()` with `storage.put()` or specific methods
3. Remove manual JSON parsing/stringifying
4. Remove manual key generation
5. Update error handling to use storage service errors