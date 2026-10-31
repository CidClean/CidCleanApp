// Nombres legibles de los archivos (D-296). Uso: node --test supabase/tests/fileName.test.mjs (Node 22.18+).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diaDe, disposicion, limpiarParte, nombreLegible } from '../functions/_shared/fileName.ts';

test('formato de D-296', () => {
  assert.equal(nombreLegible(['Quote Q-0012 v2', 'Naples Yacht Club']), 'Cid Clean - Quote Q-0012 v2 - Naples Yacht Club.pdf');
  assert.equal(nombreLegible(['Service Agreement CSA-0007', 'Naples Yacht Club']), 'Cid Clean - Service Agreement CSA-0007 - Naples Yacht Club.pdf');
  assert.equal(nombreLegible(['ICA-0003', 'Karina Sarmiento']), 'Cid Clean - ICA-0003 - Karina Sarmiento.pdf');
  assert.equal(nombreLegible(['Walkthrough', 'Naples Yacht Club', diaDe('2026-10-21T15:00:00Z')]), 'Cid Clean - Walkthrough - Naples Yacht Club - 2026-10-21.pdf');
  assert.equal(nombreLegible(['W-9', null, ''], 'jpg'), 'Cid Clean - W-9.jpg');
});

test('sin caracteres prohibidos, con acentos', () => {
  assert.equal(limpiarParte('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
  assert.equal(nombreLegible(['W-9', 'José Núñez']), 'Cid Clean - W-9 - José Núñez.pdf');
  assert.equal(nombreLegible(['x'], '../sh'), 'Cid Clean - x.pdf');
  assert.ok(nombreLegible(['y'.repeat(500)]).length <= 154);
});

test('Content-Disposition con filename y filename*', () => {
  const d = disposicion('Cid Clean - W-9 - José Núñez.pdf', 'attachment');
  assert.ok(d.startsWith('attachment; filename="Cid Clean - W-9 - Jose Nunez.pdf"; filename*=UTF-8\'\''));
  assert.ok(d.includes(encodeURIComponent('Núñez')));
});
