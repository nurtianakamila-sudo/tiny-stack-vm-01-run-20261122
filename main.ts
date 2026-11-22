// Tiny stack VM: fast, exact interpreter of make.fun's tiny stack ISA v1
// (kit ISA.md; expected answers come from reference generator/subject/vm.mjs).
// Check order mirrors the reference VM: step limit, pc range, unknown opcode,
// cut-off immediate, stack underflow, stack overflow, then the op's own traps.
import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';

// Opcode tables: immediate bytes, values popped, values pushed.
// -1 in IMM marks a byte no opcode names. Each entry is 5 chars:
// 2 hex digits of opcode, then imm, pops, pushes as single digits.
const IMM = new Int8Array(256).fill(-1);
const POPS = new Int8Array(256);
const PUSHES = new Int8Array(256);
for (const s of '00000 01101 02401 03010 04012 05022 06023 07033 10021 11021 12021 13021 14021 15021 16021 17011 18021 19021 1a021 1b011 1c021 1d021 1e021 20021 21021 22021 30200 31210 32210 33200 34000 40011 41020 50010 51010 52001 53010'.split(' ')) {
  const o = parseInt(s.slice(0, 2), 16);
  IMM[o] = +s[2]; POPS[o] = +s[3]; PUSHES[o] = +s[4];
}

// Scratch for PRINT's decimal digits, written backwards (at most 11 bytes).
const DIG = new Uint8Array(12);

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = new Uint8Array(65536);
  const n = p.length;
  let sp = 0, csp = 0, pc = 0, steps = 0, olen = 0, ipos = 0, code = 0;
  loop: for (;;) {
    if (steps === 1000000) { code = 10; break; }
    if (pc < 0 || pc >= n) { code = 9; break; }
    const op = p[pc];
    const imm = IMM[op];
    if (imm < 0) { code = 5; break; }
    if (pc + imm >= n) { code = 9; break; }
    steps++;
    const next = pc + 1 + imm;
    if (sp < POPS[op]) { code = 2; break; }
    if (sp - POPS[op] + PUSHES[op] > 256) { code = 3; break; }
    pc = next;
    switch (op) {
      case 0x00: code = 0; break loop;
      case 0x01: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x10: D[sp - 2] = (D[sp - 2] + D[sp - 1]) | 0; sp--; break;
      case 0x11: D[sp - 2] = (D[sp - 2] - D[sp - 1]) | 0; sp--; break;
      case 0x12: D[sp - 2] = Math.imul(D[sp - 2], D[sp - 1]); sp--; break;
      case 0x13: {
        const b = D[sp - 1];
        if (b === 0) { code = 4; break loop; }
        const a = D[sp - 2];
        D[sp - 2] = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        sp--; break;
      }
      case 0x14: {
        const b = D[sp - 1];
        if (b === 0) { code = 4; break loop; }
        D[sp - 2] = b === -1 ? 0 : (D[sp - 2] % b) | 0;
        sp--; break;
      }
      case 0x15: {
        const b = D[sp - 1];
        if (b === 0) { code = 4; break loop; }
        D[sp - 2] = Math.floor((D[sp - 2] >>> 0) / (b >>> 0)) | 0;
        sp--; break;
      }
      case 0x16: {
        const b = D[sp - 1];
        if (b === 0) { code = 4; break loop; }
        D[sp - 2] = ((D[sp - 2] >>> 0) % (b >>> 0)) | 0;
        sp--; break;
      }
      case 0x17: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 0x18: D[sp - 2] = D[sp - 2] & D[sp - 1]; sp--; break;
      case 0x19: D[sp - 2] = D[sp - 2] | D[sp - 1]; sp--; break;
      case 0x1a: D[sp - 2] = D[sp - 2] ^ D[sp - 1]; sp--; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x1c: D[sp - 2] = D[sp - 2] << (D[sp - 1] & 31); sp--; break;
      case 0x1d: D[sp - 2] = D[sp - 2] >> (D[sp - 1] & 31); sp--; break;
      case 0x1e: D[sp - 2] = (D[sp - 2] >>> (D[sp - 1] & 31)) | 0; sp--; break;
      case 0x20: D[sp - 2] = D[sp - 2] === D[sp - 1] ? 1 : 0; sp--; break;
      case 0x21: D[sp - 2] = D[sp - 2] < D[sp - 1] ? 1 : 0; sp--; break;
      case 0x22: D[sp - 2] = (D[sp - 2] >>> 0) < (D[sp - 1] >>> 0) ? 1 : 0; sp--; break;
      case 0x30: pc = next + (((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16); break;
      case 0x31: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        if (D[--sp] === 0) pc = next + rel;
        break;
      }
      case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        if (D[--sp] !== 0) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) { code = 7; break loop; }
        C[csp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) { code = 8; break loop; }
        pc = C[--csp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) { code = 6; break loop; }
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) { code = 6; break loop; }
        M[a] = D[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        const v = D[sp - 1];
        let m = 0;
        if (v === 0) { DIG[m++] = 48; } else {
          const neg = v < 0;
          let u = neg ? -v : v;
          while (u > 0) { DIG[m++] = 48 + (u % 10); u = Math.trunc(u / 10); }
          if (neg) DIG[m++] = 45;
        }
        if (olen + m > 65536) { code = 11; break loop; }
        sp--;
        for (let i = m - 1; i >= 0; i--) out[olen++] = DIG[i];
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) { code = 11; break loop; }
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ipos < inp.length ? inp[ipos++] : -1; break;
      case 0x53: code = D[--sp] & 255; break loop;
      default: code = 5; break loop;
    }
  }
  return { out: out.subarray(0, olen), code };
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.code + '\n');
}
