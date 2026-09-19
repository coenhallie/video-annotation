// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, h } from 'vue';
import FolderTree from '@/components/FolderTree.vue';
import type { FolderTreeNode } from '@/types/folder';

const folder: FolderTreeNode = {
  id: 'f1',
  name: 'Drills',
  parentId: null,
  children: [],
  level: 0,
  path: ['Drills'],
  isExpanded: false,
  isSelected: false,
  isDragOver: false,
  projectCount: 0,
  totalProjectCount: 0,
};

function mountTree() {
  const selected: unknown[] = [];
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(FolderTree, {
        folders: [folder],
        selectedFolderId: null,
        dragOverFolderId: null,
        onSelect: (f: unknown) => selected.push(f),
      }),
  });
  app.mount(root);
  return { root, selected, unmount: () => (app.unmount(), root.remove()) };
}

// Folder rows were click-only divs, so the folder filter could not be reached
// from the keyboard at all.
describe('folder rows are keyboard operable', () => {
  it('selects All Projects and a folder on Enter', () => {
    const t = mountTree();
    const rows = [...t.root.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]')];
    expect(rows.map((r) => r.textContent?.trim())).toEqual(['All Projects', 'Drills']);

    for (const r of rows) {
      r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }

    expect(t.selected).toEqual([null, folder]);
    t.unmount();
  });
});
