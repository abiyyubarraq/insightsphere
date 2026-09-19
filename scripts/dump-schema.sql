-- Alternative to scripts/dump-schema.sh when you do not want to use the
-- database password.
--
--   1. Supabase dashboard -> SQL Editor -> paste this -> Run
--   2. Click "Download CSV" under the results
--   3. Send me the file
--
-- Returns one row per line so the grid does not truncate it (the previous
-- version used string_agg, which put everything in a single unreadable cell).

select ord, line from (
  select 1 as ord, 0 as sub, '-- COLUMNS' as line
  union all
  select 2, row_number() over (order by table_name, ordinal_position),
         format('%s.%s %s%s%s', table_name, column_name, data_type,
                case when is_nullable = 'NO' then ' NOT NULL' else '' end,
                coalesce(' DEFAULT ' || column_default, ''))
    from information_schema.columns where table_schema = 'public'

  union all
  select 3, 0, '-- CONSTRAINTS'
  union all
  select 4, row_number() over (order by tc.table_name, tc.constraint_name),
         format('%s: %s (%s)%s', tc.table_name, tc.constraint_type,
           (select string_agg(k.column_name, ', ' order by k.ordinal_position)
              from information_schema.key_column_usage k
             where k.constraint_name = tc.constraint_name
               and k.table_schema = tc.table_schema),
           coalesce(format(' -> %s.%s ON DELETE %s',
                    ccu.table_name, ccu.column_name, rc.delete_rule), ''))
    from information_schema.table_constraints tc
    left join information_schema.referential_constraints rc
           on rc.constraint_name = tc.constraint_name
    left join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
          and tc.constraint_type = 'FOREIGN KEY'
   where tc.table_schema = 'public' and tc.constraint_type <> 'CHECK'

  union all
  select 5, 0, '-- INDEXES'
  union all
  select 6, row_number() over (order by indexname), indexdef
    from pg_indexes where schemaname = 'public'

  union all
  select 7, 0, '-- RLS'
  union all
  select 8, row_number() over (order by relname),
         format('%s: enabled=%s forced=%s', relname, relrowsecurity, relforcerowsecurity)
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r'

  union all
  select 9, 0, '-- POLICIES'
  union all
  select 10, row_number() over (order by tablename, policyname),
         format('%s.%s [%s] using(%s) check(%s)',
                tablename, policyname, cmd,
                coalesce(qual, '-'), coalesce(with_check, '-'))
    from pg_policies where schemaname = 'public'
) t
order by ord, sub;
