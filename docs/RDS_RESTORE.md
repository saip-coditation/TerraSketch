# Push PostgreSQL dump to AWS RDS

Use placeholders: `YOUR_RDS_ENDPOINT`, `YOUR_RDS_PASSWORD`. Do not commit real secrets.

**Prereqs:** `postgresql-client` (`psql`, `pg_restore`) on your machine; RDS security group allows your IP (or EC2) on **5432**; SSL required for RDS.

---

## 1. Restore full custom dump locally (optional)

```bash
createdb -U postgres -h localhost denticon_work

pg_restore \
  -U postgres \
  -h localhost \
  -d denticon_work \
  -v \
  --no-owner \
  --no-privileges \
  /path/to/arq_db_denticon_dump.dump
```

---

## 2. Export for RDS without `bronze` (from local DB)

Creates a smaller archive; **some `gold` views** may reference `bronze` and fail on RDS unless you include those tables or fix views.

```bash
pg_dump \
  -U postgres \
  -h localhost \
  -Fc \
  -N bronze \
  --no-owner \
  --no-acl \
  -f /path/to/denticon_work_no_bronze.dump \
  denticon_work
```

Verify no `bronze` in archive:

```bash
pg_restore -l /path/to/denticon_work_no_bronze.dump | grep -i bronze || echo "OK: no bronze"
```

---

## 3. Create target DB on RDS and restore

```bash
export PGSSLMODE=require
export PGPASSWORD='YOUR_RDS_PASSWORD'

psql \
  -h YOUR_RDS_ENDPOINT \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c 'CREATE DATABASE denticon_db;'

pg_restore \
  -h YOUR_RDS_ENDPOINT \
  -p 5432 \
  -U postgres \
  -d denticon_db \
  -v \
  --no-owner \
  --no-privileges \
  /path/to/denticon_work_no_bronze.dump
```

**Clean reload** (drops `denticon_db` first — PostgreSQL 13+):

```bash
psql -h YOUR_RDS_ENDPOINT -p 5432 -U postgres -d postgres \
  -c 'DROP DATABASE IF EXISTS denticon_db WITH (FORCE);' \
  -c 'CREATE DATABASE denticon_db;'
```

Then run `pg_restore` again.

---

## 4. DBeaver / JDBC

- **Database:** `denticon_db` (data lives here), not only `postgres`.
- **SSL:** require / `sslmode=require`.
- Example JDBC: `jdbc:postgresql://YOUR_RDS_ENDPOINT:5432/denticon_db?sslmode=require`

---

## 5. Quick checks (SQL)

```sql
SELECT schemaname, COUNT(*) AS tables
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY 1;

SELECT COUNT(*) AS total_tables
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE';
```

---

## 6. Known restore warning (`errors ignored: 2`)

If you excluded `bronze`, these views may fail: they reference `bronze.netsuite_qofe_raw`:

- `gold.mart_vintage_tables_qofe_report`
- `gold.mart_vintage_tables_v2_qofe_report`

`silver` / `app` / `audit` table data should still load.

---

## 7. Optional: restore from EC2 (same VPC as RDS)

Copy dump to EC2 (`scp` or S3), install `postgresql-client`, run the same `psql` + `pg_restore` using `YOUR_RDS_ENDPOINT` and RDS security group allowing the **EC2** security group on 5432.
