// Pruebas del cifrado del W-9 (orden 59, D-280): AES-256-GCM de supabase/functions/_shared/cifrado.ts.
// Uso: node --test supabase/tests/cifrado.test.mjs   (Node 22.18 o más nuevo). La clave es aleatoria de prueba.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cifrar, claveW9, descifrar, estaCifrado, sha256Hex, tipoDeRuta } from '../functions/_shared/cifrado.ts';

const claveB64 = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const pdf = new TextEncoder().encode('%PDF-1.7\nW-9 de prueba 123-45-6789\n%%EOF');

test('cifrar y descifrar devuelve el mismo PDF', async () => {
  const clave = await claveW9(claveB64());
  const c = await cifrar(clave, pdf);
  assert.ok(estaCifrado(c));
  assert.ok(!estaCifrado(pdf));
  assert.deepEqual(await descifrar(clave, c), pdf);
});

test('el archivo cifrado no contiene el texto ni el número', async () => {
  const c = await cifrar(await claveW9(claveB64()), pdf);
  const texto = Buffer.from(c).toString('latin1');
  assert.ok(!texto.includes('%PDF') && !texto.includes('123-45-6789'));
});

test('cada cifrado usa un IV distinto', async () => {
  const clave = await claveW9(claveB64());
  const a = await cifrar(clave, pdf);
  const b = await cifrar(clave, pdf);
  assert.notDeepEqual(a, b);
});

test('otra clave o un byte alterado no descifran', async () => {
  const c = await cifrar(await claveW9(claveB64()), pdf);
  await assert.rejects(descifrar(await claveW9(claveB64()), c));
  const clave = await claveW9(claveB64());
  const d = await cifrar(clave, pdf);
  d[d.length - 1] ^= 1;
  await assert.rejects(descifrar(clave, d));
});

test('la clave debe existir y medir 32 bytes', async () => {
  await assert.rejects(claveW9(undefined));
  await assert.rejects(claveW9(Buffer.alloc(16).toString('base64')));
});

test('descifrar un archivo sin cifrar falla', async () => {
  await assert.rejects(descifrar(await claveW9(claveB64()), pdf));
});

test('tipo del archivo según la ruta y hash del enlace', async () => {
  assert.deepEqual(tipoDeRuta('p/w9/signed-1-abc.pdf.enc'), { ext: 'pdf', mime: 'application/pdf' });
  assert.deepEqual(tipoDeRuta('p/w9/x.jpg.enc'), { ext: 'jpg', mime: 'image/jpeg' });
  assert.equal((await sha256Hex('abc')).length, 64);
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
