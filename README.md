# Express Backend

Simple Express backend with Prisma and Supabase.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `env.example` to `.env` and update your Supabase database URL

3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

4. Run migrations:
   ```bash
   npx prisma migrate dev
   ```

5. Start server:
   ```bash
   npm run dev
   ```

## Database URL Format
```
postgresql://username:password@host:port/database
``` 