export function memoryDb(initial = {}, fail = () => null) {
  const tables = structuredClone(initial), calls = [];
  let nextId = 1;
  return {
    tables, calls,
    from(table) {
      const query = { table, operation: "select", filters: [], values: null, one: false, maximum: Infinity, returning: false };
      const builder = {
        select() { query.returning = true; return builder; },
        insert(values) { query.operation = "insert"; query.values = Array.isArray(values) ? values : [values]; return builder; },
        update(values) { query.operation = "update"; query.values = values; return builder; },
        delete() { query.operation = "delete"; return builder; },
        eq(key, value) { query.filters.push(row => String(row[key]) === String(value)); return builder; },
        in(key, values) { query.filters.push(row => values.includes(row[key])); return builder; },
        order() { return builder; },
        limit(value) { query.maximum = value; return builder; },
        single() { query.one = true; return builder; },
        maybeSingle() { query.one = true; return builder; },
        then(resolve, reject) {
          try {
            calls.push({ table, operation: query.operation, values: query.values });
            const error = fail(query);
            if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
            const rows = tables[table] ||= [];
            let data;
            if (query.operation === "insert") {
              if (table === "auto_posts" && query.values.some(value => rows.some(row => row.type === value.type && row.source_hash === value.source_hash))) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate source" } }).then(resolve, reject);
              data = query.values.map(value => ({ id: nextId++, ...structuredClone(value) })); rows.push(...data);
            } else {
              data = rows.filter(row => query.filters.every(filter => filter(row))).slice(0, query.maximum);
              if (query.operation === "update") data.forEach(row => Object.assign(row, structuredClone(query.values)));
              if (query.operation === "delete") tables[table] = rows.filter(row => !data.includes(row));
            }
            return Promise.resolve({ data: query.one ? structuredClone(data[0] || null) : structuredClone(data), error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        }
      };
      return builder;
    }
  };
}
