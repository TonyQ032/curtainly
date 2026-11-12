'use client';

import { useState } from 'react';

/** Rows with stable React keys, so removing one doesn't shift the others' inputs. */
export function useKeyedRows<T>(initial: T[]) {
  const [state, setState] = useState(() => ({
    nextKey: initial.length,
    rows: initial.map((value, key) => ({ key, value })),
  }));
  return {
    rows: state.rows,
    add: (value: T) =>
      setState((s) => ({ nextKey: s.nextKey + 1, rows: [...s.rows, { key: s.nextKey, value }] })),
    remove: (key: number) =>
      setState((s) => ({ ...s, rows: s.rows.filter((row) => row.key !== key) })),
    /** Replace every row (e.g. after a bulk add), giving each a fresh key. */
    replace: (values: T[]) =>
      setState((s) => ({
        nextKey: s.nextKey + values.length,
        rows: values.map((value, i) => ({ key: s.nextKey + i, value })),
      })),
    update: (key: number, value: T) =>
      setState((s) => ({
        ...s,
        rows: s.rows.map((row) => (row.key === key ? { ...row, value } : row)),
      })),
  };
}
