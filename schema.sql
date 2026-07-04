-- =====================================================================
-- ZOOSH Quotation Portal - Database Schema Setup Script
-- =====================================================================
-- Instructions:
-- 1. Open your Supabase project dashboard: https://supabase.com
-- 2. Go to the SQL Editor in the left sidebar.
-- 3. If you have an old "quotations" table, run the following line first:
--    DROP TABLE quotations;
-- 4. Copy-paste this entire script and click "Run".
-- =====================================================================

CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  no TEXT NOT NULL,
  "sequenceNumber" INT, -- Stored sequence number
  revision INT,         -- Stored revision code
  date TEXT,
  valid TEXT,
  curr TEXT DEFAULT 'INR',
  client JSONB,
  company JSONB,
  "logoData" TEXT,
  items JSONB DEFAULT '[]'::JSONB,
  "itemData" JSONB DEFAULT '{}'::JSONB,
  "itemPhotos" JSONB DEFAULT '{}'::JSONB,
  "afState" JSONB DEFAULT '{}'::JSONB,
  "taxPricing" JSONB,
  terms JSONB,
  status TEXT DEFAULT 'Draft',
  history JSONB DEFAULT '[]'::JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time replication for this table
ALTER TABLE quotations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE quotations;
