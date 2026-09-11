import type {Editor} from '@tiptap/react';
import {TableMap} from '@tiptap/pm/tables';

function selectedTable(editor: Editor) {
  const {$from} = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const table = $from.node(depth);
    if (table.type.name !== 'table') continue;
    const start = $from.start(depth), map = TableMap.get(table);
    if ($from.depth <= depth) return null;
    const cell = $from.before(depth + 1 + 1);
    return {table, start, map, column: map.colCount(cell - start)};
  }
  return null;
}

export function selectedColumnWidth(editor: Editor) {
  const context = selectedTable(editor);
  if (!context) return 180;
  const {table, map, column} = context;
  const cell = table.nodeAt(map.map[column]);
  const left = map.colCount(map.map[column]);
  return cell?.attrs.colwidth?.[column - left] || 180;
}

export function setColumnWidth(editor: Editor, value: number) {
  const context = selectedTable(editor);
  if (!context) return false;
  const {table, start, map, column} = context;
  const width = Math.max(60, Math.min(1200, Math.round(value)));
  const tr = editor.state.tr, visited = new Set<number>();
  for (let row = 0; row < map.height; row++) {
    const position = map.map[row * map.width + column];
    if (visited.has(position)) continue;
    visited.add(position);
    const cell = table.nodeAt(position);
    if (!cell) continue;
    const colwidth = cell.attrs.colwidth?.slice() || Array(cell.attrs.colspan).fill(0);
    colwidth[column - map.colCount(position)] = width;
    tr.setNodeMarkup(start + position, undefined, {...cell.attrs, colwidth});
  }
  editor.view.dispatch(tr);
  return true;
}
