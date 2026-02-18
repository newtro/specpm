# Cursor-Based Pagination

This spec defines cursor-based pagination for API endpoints.

## Why Cursors?
- Stable pagination under concurrent writes
- Better performance than offset-based for large datasets
- Compatible with real-time data streams

## Usage
All list endpoints return a `PaginatedResponse` with `pageInfo` containing cursors for navigation.
