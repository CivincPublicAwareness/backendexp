-- Migration to add new fields to issues table
-- Run this in your database to add the new fields

-- Add city field (if not already added)
ALTER TABLE issues ADD COLUMN IF NOT EXISTS city VARCHAR(255);

-- Add ward_name field
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ward_name VARCHAR(255);

-- Add designation field
ALTER TABLE issues ADD COLUMN IF NOT EXISTS designation VARCHAR(255);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_issues_city ON issues(city);
CREATE INDEX IF NOT EXISTS idx_issues_ward_name ON issues(ward_name);

-- Update existing issues to populate the new fields
-- This will populate city and ward_name from the related tables
UPDATE issues 
SET 
  city = (
    SELECT c.name 
    FROM cities c 
    JOIN wards w ON c.id = w.city_id 
    WHERE w.id = issues.ward_id
  ),
  ward_name = (
    SELECT w.name 
    FROM wards w 
    WHERE w.id = issues.ward_id
  )
WHERE city IS NULL OR ward_name IS NULL; 