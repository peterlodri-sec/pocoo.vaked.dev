---
title: "Sourcify Metadata Migration: Deduplication, Overflow Pages, and Database Internals"
date: 2026-08-16
description: "A deep dive into database internals, B-Trees, overflow pages, and how we solved massive JSON blob duplication in Sourcify."
tags: ["sqlite", "database-internals", "postgresql", "sourcify", "optimization"]
draft: false
---

# Solving Database Bloat in Sourcify: A Lesson in Database Internals

*qwave · database internals · fine touch from within · vaked.dev*

In the Ethereum ecosystem, [Sourcify](https://sourcify.dev/) acts as the canonical decentralized contract verification service. When a developer verifies a smart contract, they upload the source code and the compiler metadata. One of the long-standing architectural challenges we faced in issue `#2924` was the massive database bloat caused by redundant `metadata` JSON blobs being stored across multiple identical contract matches.

To understand why duplicating these blobs is so detrimental, it helps to take a step back and look at the underlying mechanics of database storage engines—specifically focusing on the educational internals of systems like SQLite and Postgres.

## B-Trees and Page Caches: The Engine Room

Relational databases like SQLite and PostgreSQL don't just dump your data into a flat file. They organize rows into a data structure known as a **B-Tree** (or B+ Tree). In these trees, data is chunked into fixed-size blocks called **pages** (commonly 4KB or 8KB). 

When you execute a `SELECT` statement, the database engine traverses the B-Tree from the root page down to the leaf pages to find your data. Because disk I/O is the slowest part of any database operation, engines heavily rely on a **Page Cache** (or buffer pool) kept in RAM. The goal is to keep the most frequently accessed pages in memory.

If your rows are small, a single 4KB page can hold hundreds of rows. Scanning them is lightning fast because pulling one page into memory pulls hundreds of rows simultaneously.

## The Cost of Large Payloads: Overflow Pages

So what happens when a single row exceeds the size of a page? 

In Sourcify, the `metadata` column contains massive JSON documents—often dozens or hundreds of kilobytes in size, detailing compiler settings, ABIs, and ASTs. 

When a database encounters a massive payload that simply cannot fit alongside other columns in a standard B-Tree leaf page, it resorts to **Overflow Pages**. 
1. The engine stores a small pointer in the main B-Tree page.
2. It allocates a separate linked list of overflow pages to hold the actual massive JSON blob.

When you duplicate the exact same 100KB JSON blob across 50 different `sourcify_matches` (because the same compiled contract was deployed to 50 different networks or proxy addresses), you are forcing the database to allocate 50 separate chains of overflow pages. 

This destroys I/O efficiency:
- **Cache Thrashing:** Your Page Cache fills up with duplicate JSON strings, evicting other valuable indexes and table data.
- **B-Tree Depth:** As the database file swells by gigabytes of redundant overflow pages, the B-Tree depth increases, making even standard lookups require more disk seeks.

## The Fix: Normalizing with a Side Table

To resolve this, we introduced a new side table: `compiled_contracts_metadata`.

Instead of attaching the metadata to the individual chain deployment (`sourcify_matches`), we shifted it to a one-to-one relationship mapped strictly by `compilation_id`.

```sql
CREATE TABLE compiled_contracts_metadata (
    compilation_id VARCHAR PRIMARY KEY,
    metadata JSONB NOT NULL
);
```

By moving the heavy payload into a dedicated side table, the core `sourcify_matches` table becomes incredibly lightweight. It now perfectly fits inside standard B-Tree leaf pages without spilling into overflow pages. We can deduplicate the JSON across all deployment variants because the compiled bytecode and metadata are identical for a given `compilation_id`.

## Seamless Reads and Query Execution

Migrating a live system requires care. We needed a way to query the database seamlessly while older deployments were still backfilling into the new table structure. To achieve a **zero-downtime migration**, the read paths now intelligently query both the old and new tables using the `COALESCE` function:
   
```sql
SELECT 
    sourcify_matches.created_at,
    COALESCE(compiled_contracts_metadata.metadata, sourcify_matches.metadata) as metadata
FROM sourcify_matches
LEFT JOIN compiled_contracts_metadata 
    ON compiled_contracts_metadata.compilation_id = verified_contracts.compilation_id
```

### How the Query Planner Handles This
When the SQL parser encounters this conditional structure, it evaluates `COALESCE` from left to right. 
If `compiled_contracts_metadata.metadata` is found (because the row has been migrated), it immediately returns it and skips loading the legacy column entirely. 

Furthermore, we optimized our dynamic query builder in the application layer. It conditionally injects the `LEFT JOIN` and updates the `GROUP BY` clause only when the `metadata` property is explicitly requested. If a user is just querying for a contract's basic match status, the query planner completely bypasses the metadata side table, entirely avoiding the disk I/O required to fetch those heavy overflow pages.

## Conclusion

By understanding how storage engines handle pages and overflow data, we can architect schemas that work in harmony with the database rather than fighting it. Normalizing large binary or text blobs into side tables is a classic, highly effective technique for keeping your primary tables lean, your B-Trees shallow, and your page cache operating at peak efficiency.
